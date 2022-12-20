import { BigNumber } from 'bignumber.js';
import { isEmpty, groupBy } from 'orbiter-chaincore/src/utils/core';
import dayjs from "dayjs";
import { Op } from "sequelize";
import Context from "../context";
import { Factory } from '../account/factory';
import XVMAccount from '../account/xvmAccount';
import { LoggerService } from 'orbiter-chaincore/src/utils';
import { chains } from 'orbiter-chaincore';
import { orderTimeoutMS } from './validator';
const submissionInterval = 1000 * 10 * 2;
export interface CalldataType {
  chainId: number;
  hash: string;
  token: string;
  value: string;
  expectValue: string;
  timestamp: number;
  slipPoint: number;
  crossTokenUserExpectValue?: string;
}
export enum SwapOrderType {
  None,
  UA,
  CrossAddr,
  CrossToken
}
export interface SwapOrder {
  chainId: number;
  hash: string;
  from: string;
  to: string;
  token: string;
  value: string;
  calldata: CalldataType
  type: SwapOrderType;
}
interface MonitorState {
  [key: string]: {
    locked: boolean,
    lastSubmit: number
  }
}
export default class Sequencer {
  private pending: { [key: string]: SwapOrder[] } = {};
  private monitorState: MonitorState = {}
  // 
  constructor(private readonly ctx: Context) {
    this.monitor()
  }
  async readHistory() {
    const historyList = await this.ctx.db.Transaction.findAll({
      raw: true,
      attributes: [
        'source',
        'hash',
        'timestamp',
        'chainId',
        'tokenAddress',
        'value',
        'replyAccount',
        'side',
        'memo',
        'expectValue',
        'replySender',
        'extra',
      ],
      where: {
        source: 'xvm',
        status: 1,
        side: 0,
        timestamp: {
          [Op.gt]: dayjs().subtract(orderTimeoutMS, 'ms').format('YYYY-MM-DD HH:mm'),
        },
      },
    });
    console.log('init history:', historyList.map(tx=> tx.hash));
    for (const tx of historyList) {
      const order = await this.ctx.validator.verifyFromTx(tx);
      order && this.push(order);
    }
  }
  async monitor() {
    setInterval(async () => {
      for (const chainId in this.pending) {
        const pendingTxs = this.pending[chainId];
        if (pendingTxs.length <= 0) {
          continue;
        }
        let monitorState = this.monitorState[chainId];
        if (!monitorState) {
          // init
          this.monitorState[chainId] = {
            locked: false,
            lastSubmit: Date.now()
          };
          monitorState = this.monitorState[chainId];
          // continue;
        }
        if (!monitorState.locked && Date.now() - monitorState.lastSubmit > submissionInterval) {
          // if type = 
          monitorState.locked = true;
          // filter 
          const matchOrders: SwapOrder[] = [];
          console.log(`start scan pendingTxs chainId: ${chainId}, pendingTxsCount: ${pendingTxs.length}`);
          for (let i = 0; i < pendingTxs.length; i++) {
            const order = pendingTxs[i];
            if (order.type === SwapOrderType.CrossToken) {
              // matchOrders.
              const value = await this.ctx.validator.verifyXVMCrossToken(order);
              if (value && !isEmpty(value)) {
                order.value = String(value);
                const spliceOrders = pendingTxs.splice(i, 1);
                console.log(value.toString(), '=====exec', spliceOrders);
                matchOrders.push(...spliceOrders);
              }
            } else if ([SwapOrderType.UA, SwapOrderType.CrossAddr].includes(order.type)) {
              matchOrders.push(...pendingTxs.splice(i, 1));
            }
          }
          console.log(`start after scan pendingTxs chainId: ${chainId}, pendingTxsCount: ${pendingTxs.length}, matchOrders:${matchOrders.length}`);
          if (matchOrders.length > 0) {
            this.submit(chainId, matchOrders).then(result => {
            }).finally(() => {
              monitorState.locked = false;
              monitorState.lastSubmit = Date.now();
            })
          } else {
            monitorState.locked = false;
            monitorState.lastSubmit = Date.now();
          }
        }

      }
    }, 1000);
  }
  async push(trx: SwapOrder) {
    const chainId = trx.chainId.toString();
    if (isEmpty(this.pending[chainId])) {
      this.pending[chainId] = [trx];
    } else {
      this.pending[chainId].push(trx);
    }
    return this.pending[chainId];
  }

  async submit(chainId: string, pendingTxs: SwapOrder[]) {
    // exec send
    if (pendingTxs.length <= 0) {
      return;
    }
    const logger = LoggerService.getLogger(chainId);

    const InterceptTransactions: SwapOrder[] = [];
    const senderPrivateKey = {};
    for (let i = 0; i < pendingTxs.length; i++) {
      const order = pendingTxs[i];
      const validResult = await this.ctx.validator.verifyToTx(order);
      if (validResult) {
        senderPrivateKey[order.from.toLocaleLowerCase()] = validResult.privateKey;
      } else {
        InterceptTransactions.push(order);
        pendingTxs.splice(i, 1);
      }
    }
    if (InterceptTransactions.length > 0) {
      logger.info(`${chainId} sequencer submit InterceptTransactions:`, InterceptTransactions);
    }
    if (pendingTxs.length <= 0) {
      logger.info(`${chainId} sequencer submit All InterceptTransactions pending null:`, InterceptTransactions.map(row => row.calldata.hash));
      return;
    }
    const groupData = groupBy(pendingTxs, 'from');
    let successFromHash: string[] = [];
    for (const sender in groupData) {
      try {
        const xvmAccount = Factory.createMakerAccount<XVMAccount>(senderPrivateKey[sender.toLocaleLowerCase()], chainId, true);
        const encodeDatas: string[] = [];
        let sendMainTokenValue = new BigNumber(0);
        for (const pendingTx of pendingTxs) {
          const isMainToken = chains.inValidMainToken(pendingTx.chainId, pendingTx.token);
          if (isMainToken) {
            sendMainTokenValue = sendMainTokenValue.plus(pendingTx.value);
          }
          encodeDatas.push(xvmAccount.swapOkEncodeABI(pendingTx.calldata.hash, pendingTx.token, pendingTx.to, pendingTx.value));
        }
        //
        logger.info(`sequencer swap submit:`, pendingTxs, sendMainTokenValue);
        const submitTx = await xvmAccount.swapOK(encodeDatas.length === 1 ? encodeDatas[0] : encodeDatas, {
          value: sendMainTokenValue.gt(0) ? sendMainTokenValue.toString() : "0x0"
        });
        await this.ctx.db.Sequencer.upsert({
          hash: submitTx.hash,
          from: submitTx.from,
          to: String(submitTx.to),
          status: 1,
          chainId: submitTx.chainId,
          transactions: pendingTxs.map(tx => tx.calldata.hash) as any,
          transactionCount: encodeDatas.length
        })
        successFromHash.push(...pendingTxs.map(row => row.calldata.hash));
        await submitTx.wait()
        // save status
      } catch (error) {
        logger.error(`sequencer swap submit error:`, error);
      }
    }
    if (successFromHash.length > 0) {
      await this.ctx.db.Transaction.update({
        status: 97
      }, {
        where: {
          hash: successFromHash.length > 0 ? successFromHash : successFromHash[0]
        }
      })
    }
    return successFromHash;
  }
}