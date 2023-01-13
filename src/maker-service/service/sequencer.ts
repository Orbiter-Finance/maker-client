import { isEmpty, equals } from 'orbiter-chaincore/src/utils/core';
import dayjs from "dayjs";
import { Op } from "sequelize";
import Context from "../context";
import { Factory } from '../account/factory';
import XVMAccount from '../account/xvmAccount';
import { chains } from 'orbiter-chaincore';
import ValidatorService, { orderTimeoutMS } from './validator';
import { ethers } from 'ethers';
import BaseAccount, { TransactionResponse } from '../account/baseAccount';
import Caching from '../utils/caching';
import { LoggerService } from '../utils/logger';
const submissionInterval = 1000 * 60 * 1;
export interface submitResponse {
  chainId: number;
  error?: Error | string,
  makerDeal?: {
    [key: string]: Array<{
      fromHash: string,
      toHash?: string,
      error?: Error | string
    }>
  }
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
        // source: 'xvm',
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
  async exec(chainId: string) {
    const logger = LoggerService.getLogger(chainId.toString(), {
      label: chainId
    });
    const monitorState = this.monitorState[chainId];
    const pendingTxs = this.pending[chainId];
    if (pendingTxs.length <= 0) {
      return undefined;
    }
    try {
      monitorState.locked = true;
      // filter 
      const matchOrders: SwapOrder[] = [];
      logger.info(`start scan pendingTxs chainId: ${chainId},nowPendingCount:${this.pending[chainId].length}, pendingTxsCount: ${pendingTxs.length}`);
      for (let i = pendingTxs.length - 1; i >= 0; i--) {
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
      logger.info(`start after scan pendingTxs chainId: ${chainId},nowPendingCount:${this.pending[chainId].length}, pendingTxsCount: ${pendingTxs.length}, matchOrders:${matchOrders.length}`);
      if (matchOrders.length > 0) {
        const result = await this.submit(Number(chainId), matchOrders);
        monitorState.locked = false;
        monitorState.lastSubmit = Date.now();
        console.log('submit result:', JSON.stringify(result));
        // .then(result => {
        //   console.log('submit result:', JSON.stringify(result));
        //   this.ctx.logger.info('submit result:', {
        //     result: JSON.stringify(result)
        //   });
        // }).finally(() => {
        //   this.ctx.logger.info(chainId, 'finally 重置locked')
        //   monitorState.locked = false;
        //   monitorState.lastSubmit = Date.now();
        // })
      }
    } catch (error) {
      logger.error('submit error:', error);
      monitorState.locked = false;
      monitorState.lastSubmit = Date.now();
    }
  }
  async monitor() {
    try {
      const handle = async () => {
        for (const chainId in this.pending) {
          if (!this.monitorState[chainId]) {
            // init
            this.monitorState[chainId] = {
              locked: false,
              lastSubmit: Date.now()
            };
            continue;
          }
          const monitorState = this.monitorState[chainId];
          this.ctx.logger.debug(`check orders:${chainId},pendingTxs:${this.pending[chainId].length}, monitorState:${monitorState.locked}, lastSubmit:${monitorState.lastSubmit}`);
          if (!monitorState.locked && Date.now() - monitorState.lastSubmit > submissionInterval) {
            this.exec(chainId);
          }
        }
      }
      setInterval(handle, 1000 * 10);
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
    const logger = LoggerService.getLogger(chainId.toString(), {
      label: chainId
    });
    logger.debug('push:', { hash: trx.calldata.hash });
    return this.pending[chainId];
  }

  async submit(chainId: number, pendingTxs: SwapOrder[]): Promise<submitResponse> {
    // exec send
    const chainConfig = chains.getChainInfo(chainId);
    if (!chainConfig) {
      throw new Error(`From ChainConfig Not found`);
    }
    const cache = Caching.getCache(chainId.toString());
    if (pendingTxs.length <= 0) {
      return { chainId, error: 'pendingTxs less 0' };
    }
    const logger = LoggerService.getLogger(chainId.toString(), {
      label: chainId.toString()
    });
    const senderPrivateKey = {};

    const makerWaitingSending: {
      [key: string]: Array<{
        fromHash: string,
        toHash?: string,
        error?: Error | string
      }>
    } = {}

    for (let i = 0; i < pendingTxs.length; i++) {
      const order = pendingTxs[i];
      const senderRecord = await cache.get(order.calldata.hash);
      if (!isEmpty(senderRecord)) {
        logger.error(`${order.calldata.hash} The sending record already exists, blocking`)
        continue;
      }
      const validResult = await this.ctx.validator.verifyToTx(order);
      if (!validResult) {
        logger.error(`${order.calldata.hash} verifyToTx Fail`)
        continue;
      }
      senderPrivateKey[order.from.toLocaleLowerCase()] = validResult.privateKey;
      // save cache
      await cache.set(order.calldata.hash, true, orderTimeoutMS);
      if (!makerWaitingSending[order.from.toLocaleLowerCase()]) {
        makerWaitingSending[order.from.toLocaleLowerCase()] = [];
      }
      makerWaitingSending[order.from.toLocaleLowerCase()].push({
        fromHash: order.calldata.hash,
        toHash: '',
        error: undefined
      })
    }
    if (Object.keys(makerWaitingSending).length <= 0) {
      logger.info(`${chainId} No transaction to send after filtering`);
    }
    const makerBalance: {
      [key: string]: ethers.BigNumber
    } = {}
    for (const makerReplyAddr in makerWaitingSending) {
      const account: BaseAccount = Factory.createMakerAccount(senderPrivateKey[makerReplyAddr], chainId);
      const trxList = makerWaitingSending[makerReplyAddr];
      for (const tx of trxList) {
        const order = pendingTxs.find(order => equals(order.calldata.hash, tx.fromHash));
        if (!order) {
          tx.error = 'order not found';
          continue;
        }
        const sendToken = order.token.toLocaleLowerCase();
        const sendValue = ethers.BigNumber.from(order.value);
        if (makerBalance[sendToken] === undefined) {
          makerBalance[sendToken] = await account.getBalance(makerReplyAddr, chains.inValidMainToken(chainId, sendToken) ? undefined : sendToken);
        }
        if (makerBalance[sendToken].lt(sendValue)) {
          tx.error = `${chainConfig.name} - ${makerReplyAddr} Maker ${sendToken}  Insufficient funds ${makerBalance[sendToken]}/${sendValue}`;
          continue;
        }
        makerBalance[sendToken] = makerBalance[sendToken].sub(sendValue);
      }
      let submitTx: TransactionResponse | undefined;
      const passOrders: Array<SwapOrder> = [];
      let sendMainTokenValue = ethers.BigNumber.from(0);
      logger.warn(`${chainConfig.name} sequencer before handle:`, { trxList });
      for (const row of trxList) {
        if (isEmpty(row.error)) {
          const order = pendingTxs.find(order => equals(order.calldata.hash, row.fromHash));
          if (order) {
            passOrders.push(order);
            if (chains.inValidMainToken(chainId, order.token)) {
              sendMainTokenValue = sendMainTokenValue.add(order.value);
            }
          }
        }
      }
      if (passOrders.length <= 0) {
        logger.warn(`${chainConfig.name} sequencer passOrders lte 0:`, { passOrders, sendMainTokenValue });
        continue;
      }
      let isXVMReply = ValidatorService.isSupportXVM(chainId);
      if (isXVMReply && passOrders.length === 1) {
        isXVMReply = false;
      }
      logger.info(`${chainConfig.name} sequencer get ready submit`, { passOrders, sendMainTokenValue,isXVMReply });
      if (isXVMReply) {
        const encodeDatas = passOrders.map(order => {
          return (<XVMAccount>account).swapOkEncodeABI(order.calldata.hash, order.token, order.to, order.value);
        })
        let isError = false;
        try {
          submitTx = await (<XVMAccount>account).swapOK(encodeDatas.length === 1 ? encodeDatas[0] : encodeDatas, {
            value: sendMainTokenValue,
          });
        } catch (error: any) {
          isError = true;
          // for (const order of passOrders) {
          const tx = trxList.find(o => equals(o.fromHash, passOrders[0].calldata.hash));
          if (tx)
            tx.error = error;
          // }
          logger.error(`${chainConfig.name} sequencer xvm submit error:${error.message}`, error);
        } finally {
          const passHashList = passOrders.map(tx => tx.calldata.hash);
          if (submitTx) {
            logger.info(`${chainConfig.name} sequencer xvm submit success`, {
              toHash: submitTx.hash,
              fromHashList: passHashList
            })
            for (const order of passOrders) {
              const tx = trxList.find(o => equals(o.fromHash, order.calldata.hash));
              if (tx)
                tx.toHash = submitTx.hash;
            }
            await this.ctx.db.Sequencer.upsert({
              hash: submitTx.hash,
              from: submitTx.from,
              to: String(submitTx.to),
              status: 1,
              chainId: submitTx.chainId,
              transactions: passHashList as any,
              transactionCount: encodeDatas.length
            });
          }
          // change
          await this.ctx.db.Transaction.update({
            status: isError ? 96 : 97
          }, {
            where: {
              hash: passHashList.length > 1 ? passHashList : passHashList[0]
            }
          })
        }
      }
      if (!isXVMReply) {
        // ua
        const txType = (chainConfig['features'] || []).includes("EIP1559") ? 2 : 0;
        for (const order of passOrders) {
          let isError = false;
          try {
            if (chains.inValidMainToken(chainId, order.token)) {
              submitTx = await account.transfer(order.to, order.value, {
                type: txType
              });
            } else {
              submitTx = await account.transferToken(order.token, order.to, order.value, {
                type: txType
              });
            }

          } catch (error: any) {
            logger.error(`${chainConfig.name} sequencer submit error:${error.message}`, error);
            const tx = trxList.find(o => equals(o.fromHash, order.calldata.hash));
            if (tx)
              tx.error = error;
          } finally {
            if (submitTx) {
              logger.info(`${chainConfig.name} sequencer submit success`, {
                toHash: submitTx.hash,
                fromHash: order.calldata.hash
              })
              const tx = trxList.find(o => equals(o.fromHash, order.calldata.hash));
              if (tx)
                tx.toHash = submitTx.hash;
              await this.ctx.db.Sequencer.upsert({
                hash: submitTx.hash,
                from: submitTx.from,
                to: String(submitTx.to),
                status: 1,
                chainId: submitTx.chainId,
                transactions: [order.calldata.hash] as any,
                transactionCount: 1
              });
            }
            // change
            await this.ctx.db.Transaction.update({
              status: isError ? 96 : 97
            }, {
              where: {
                hash: order.calldata.hash
              }
            })
          }
        }
      }
    }
    logger.info("Complete submission", { makerDeal: makerWaitingSending })
    return { chainId, makerDeal: makerWaitingSending };
  }
}