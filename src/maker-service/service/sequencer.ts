import { isEmpty, groupBy, equals } from 'orbiter-chaincore/src/utils/core';
import dayjs from "dayjs";
import { Op } from "sequelize";
import Context from "../context";
import { Factory } from '../account/factory';
import XVMAccount from '../account/xvmAccount';
import { chains } from 'orbiter-chaincore';
import ValidatorService, { orderTimeoutMS } from './validator';
import { ethers } from 'ethers';
import { TransactionResponse } from '../account/baseAccount';
import Caching from '../utils/caching';
const submissionInterval = 1000 * 60 * 3;
export interface submitResponse {
  chainId: number;
  fromHash?: Array<string>
  // hashMap?: {
  //   [key: string]: Array<string>
  // }
}
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
  [key: number]: {
    locked: boolean,
    lastSubmit: number
  }
}
export default class Sequencer {
  private pending: { [key: number]: SwapOrder[] } = {};
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
    this.ctx.logger.info('init history:', { fromHash: historyList.map(tx => tx.hash) });
    for (const tx of historyList) {
      const order = await this.ctx.validator.verifyFromTx(tx);
      order && this.push(order);
    }
  }
  async monitor() {
    try {
      const handle = async () => {
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
            continue;
          }
          if (!monitorState.locked && Date.now() - monitorState.lastSubmit > submissionInterval) {
            // if type = 
            monitorState.locked = true;
            console.log(`check orders:${chainId},pendingTxs:${pendingTxs.length}`);
            // filter 
            const matchOrders: SwapOrder[] = [];
            this.ctx.logger.info(`start scan pendingTxs chainId: ${chainId}, pendingTxsCount: ${pendingTxs.length}`);
            for (let i = 0; i < pendingTxs.length; i++) {
              const order = pendingTxs[i];
              if (!ValidatorService.transactionTimeValid(order.calldata.timestamp)) {
                pendingTxs.splice(i, 1);
                this.ctx.logger.info(`${order.calldata.hash} remove order`);
                continue;
              }
              if (order.type === SwapOrderType.CrossToken) {
                // matchOrders.
                const value = await this.ctx.validator.verifyXVMCrossToken(order);
                if (value && !isEmpty(value)) {
                  order.value = String(value);
                  const spliceOrders = pendingTxs.splice(i, 1);
                  matchOrders.push(...spliceOrders);
                }
              } else if ([SwapOrderType.UA, SwapOrderType.CrossAddr].includes(order.type)) {
                matchOrders.push(...pendingTxs.splice(i, 1));
              }
            }
            this.ctx.logger.info(`start after scan pendingTxs chainId: ${chainId}, pendingTxsCount: ${pendingTxs.length}, matchOrders:${matchOrders.length}`);
            if (matchOrders.length > 0) {
              this.submit(Number(chainId), matchOrders).then(result => {
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
      }
      setInterval(handle, 1000);
    } catch (error) {
      console.error('monitor error', error);
    }
  }
  async push(trx: SwapOrder) {
    const chainId = trx.chainId.toString();
    if (isEmpty(this.pending[chainId])) {
      this.pending[chainId] = [];
    }
    const isExist = this.pending[chainId].findIndex(tx => equals(tx.calldata.hash, trx.calldata.hash)) >= 0;
    if (isExist) {
      this.ctx.logger.warn(`${trx.calldata.hash} exist tradePool Array`);
      return;
    }
    this.pending[chainId].push(trx);
    console.log('push:', trx);
    return this.pending[chainId];
  }

  async submit(chainId: number, pendingTxs: SwapOrder[]): Promise<submitResponse> {
    // exec send
    const cache = Caching.getCache(chainId.toString());
    if (pendingTxs.length <= 0) {
      return { chainId };
    }
    const logger = this.ctx.logger;
    // const logger = LoggerService.getLogger(chainId.toString());

    const InterceptTransactions: SwapOrder[] = [];
    const senderPrivateKey = {};
    const senderFromHashList: Array<string> = [];
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
      return { chainId };
    }
    const groupData = groupBy(pendingTxs, 'from');
    for (const sender in groupData) {
      const fromHashList: string[] = [];
      try {
        const xvmAccount = Factory.createMakerAccount<XVMAccount>(senderPrivateKey[sender.toLocaleLowerCase()], chainId, true);
        const encodeDatas: string[] = [];
        let sendMainTokenValue = ethers.BigNumber.from(0);
        const sendTokenCheck: { [key: string]: ethers.BigNumber } = {}
        for (const pendingTx of groupData[sender]) {
          // isExists sender
          const senderRecord = await cache.get(pendingTx.calldata.hash);
          if (!isEmpty(senderRecord)) {
            logger.error(`${pendingTx.calldata.hash} The sending record already exists, blocking`)
            continue;
          }
          const sendToken = pendingTx.token;
          const isMainToken = chains.inValidMainToken(Number(pendingTx.chainId), sendToken);
          if (isMainToken) {
            sendMainTokenValue = sendMainTokenValue.add(pendingTx.value);
          } else {
            sendTokenCheck[sendToken.toLowerCase()] = sendTokenCheck[sendToken] ? sendTokenCheck[sendToken].add(pendingTx.value) : ethers.BigNumber.from(pendingTx.value);
          }
          fromHashList.push(pendingTx.calldata.hash);
          encodeDatas.push(xvmAccount.swapOkEncodeABI(pendingTx.calldata.hash, pendingTx.token, pendingTx.to, pendingTx.value));
        }
        //
        const sendParams = {
          value: sendMainTokenValue,
        }
        // check balance
        if (sendMainTokenValue.gt(0)) {
          // check mainToke balance
          const makerBalance = await xvmAccount.getBalance(sender);
          if (makerBalance && makerBalance.lt(makerBalance)) {
            throw new Error(`maker ${sender} Balance Insufficient`)
          }
        }
        // check token balance
        for (const token in sendTokenCheck) {
          if (sendTokenCheck[token].gt(0)) {
            const makerBalance = await xvmAccount.getTokenBalance(token, sender);
            if (makerBalance && makerBalance.lt(makerBalance)) {
              throw new Error(`maker ${sender} Token ${token} Balance Insufficient`)
            }
          }
        }
        // When this step is reached, the transaction has been executed
        logger.info(`sequencer swap submit:`, { pendingTxs, sendParams });
        for (const hash of fromHashList) {
          await cache.set(hash, true, orderTimeoutMS);
        }
        let submitTx: TransactionResponse | undefined;
        let isError = false;
        if (encodeDatas.length<=0) {
          continue;
        }
        try {
          submitTx = await xvmAccount.swapOK(encodeDatas.length === 1 ? encodeDatas[0] : encodeDatas, sendParams);
          console.log('sequencer swap submit ok:', submitTx.hash)
        } catch (error: any) {
          isError = true;
          logger.error(`sequencer swap submit swapOK error:${error.message}`, error);
        }
        if (submitTx) {
          await this.ctx.db.Sequencer.upsert({
            hash: submitTx.hash,
            from: submitTx.from,
            to: String(submitTx.to),
            status: 1,
            chainId: submitTx.chainId,
            transactions: fromHashList as any,
            transactionCount: encodeDatas.length
          })
        }
        senderFromHashList.push(...fromHashList);
        await this.ctx.db.Transaction.update({
          status: isError ? 96 : 97
        }, {
          where: {
            hash: fromHashList.length > 1 ? fromHashList : fromHashList[0]
          }
        })
        if (submitTx) {
          await submitTx.wait()
        }
        // save status
      } catch (error: any) {
        logger.error(`sequencer swap submit error:${error.message}`, {
          msg: error.message,
          data: groupData[sender]
        });
      }
    }
    return { chainId, fromHash: senderFromHashList };
  }
}