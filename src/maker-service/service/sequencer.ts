import { isEmpty, equals, groupBy } from 'orbiter-chaincore/src/utils/core';
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
  makerDeal?: Array<SwapOrder>
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
  error?: Error | string
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
        logger.info(`exec submit before:${matchOrders.length}`);
        const result = await this.submit(Number(chainId), matchOrders);
        monitorState.locked = false;
        monitorState.lastSubmit = Date.now();
        console.log('submit result:', JSON.stringify(result));
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
      this.ctx.logger.error('monitor error', error);
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
    try {
      const logger = LoggerService.getLogger(chainId.toString(), {
        label: chainId.toString()
      });
      logger.info("submit step 1");
      const chainConfig = chains.getChainInfo(chainId);
      if (!chainConfig) {
        return { chainId, error: 'To Chain ChainConfig Not found' };
      }
      logger.info("submit step 2");
      const cache = Caching.getCache(chainId.toString());
      if (pendingTxs.length <= 0) {
        return { chainId, error: 'pendingTxs less 0' };
      }
      logger.info("submit step 3");
      const senderPrivateKey = {};
      const makerBalance: {
        [key: string]: ethers.BigNumber
      } = {}
      for (const order of pendingTxs) {
        const senderRecord = await cache.get(order.calldata.hash);
        if (!isEmpty(senderRecord)) {
          order.error = 'The sending record already exists, blocking';
          logger.error(`${order.calldata.hash} The sending record already exists, blocking`)
          continue;
        }
        logger.info("submit step 3-1-1");
        const validResult = await this.ctx.validator.verifyToTx(order);
        if (!validResult) {
          order.error = 'verifyToTx Fail';
          logger.error(`${order.calldata.hash} verifyToTx Fail`)
          continue;
        }
        try {
          logger.info("submit step 3-1-2");
          const account: BaseAccount = Factory.createMakerAccount(validResult.privateKey, chainId);
          // get balance
          const senderWallet = order.from;
          const sendToken = order.token.toLocaleLowerCase();
          const sendValue = ethers.BigNumber.from(order.value);
          if (makerBalance[sendToken] === undefined) {
            const token = chains.inValidMainToken(chainId, sendToken) ? undefined : sendToken;
            logger.info("submit step 3-1-3");
            makerBalance[sendToken] = await account.getBalance(senderWallet, token);
          }
          if (makerBalance[sendToken] && makerBalance[sendToken].lt(sendValue)) {
            order.error = `${senderWallet} Maker ${sendToken}  Insufficient funds ${makerBalance[sendToken]}/${sendValue}`;
            continue;
          }
          makerBalance[sendToken] = makerBalance[sendToken].sub(sendValue);
        } catch (error) {
          logger.error("get maker balance error", error);
        }
        // save cache
        await cache.set(order.calldata.hash, true, orderTimeoutMS);
        senderPrivateKey[order.from.toLocaleLowerCase()] = validResult.privateKey;
      }

      logger.info("submit step 4");

      const prepareList = pendingTxs.filter(o => isEmpty(o.error));
      const groupFromAddrList = groupBy(prepareList, 'from');
      logger.info("submit step 5");
      for (const makerReplyAddr in groupFromAddrList) {
        try {
          const sender = makerReplyAddr.toLocaleLowerCase();
          const privateKey = senderPrivateKey[sender];
          if (!privateKey) {
            logger.error(`${makerReplyAddr} privateKey is null`);
            continue;
          }
          logger.info("submit step 5-1");
          const account: BaseAccount = Factory.createMakerAccount(privateKey, chainId);
          const trxList = groupFromAddrList[makerReplyAddr];
          const passOrders: Array<SwapOrder> = trxList.filter(o => isEmpty(o.error));
          logger.info("submit step 5-2");
          if (passOrders.length <= 0) {
            logger.warn(`${chainConfig.name} sequencer passOrders lte 0:`, { passOrders });
            continue;
          }
          logger.info("submit step 5-3");
          await this.swapReply(chainId, account, passOrders);
          logger.info(`${chainId} sequencer submit success`, { passOrders });
          logger.info("submit step 5-4");
        } catch (error) {
          logger.error("Revolving payment error", error);
        }
      }
      logger.info("Complete submission", { makerDeal: pendingTxs })
      return { chainId, makerDeal: pendingTxs };
    } catch (error) {
      throw error;
    }
  }
  public async swapReply(chainId: number, account: BaseAccount, passOrders: Array<SwapOrder>) {
    const logger = LoggerService.getLogger(chainId.toString(), {
      label: chainId.toString()
    });
    const chainConfig = chains.getChainInfo(chainId);
    if (!chainConfig) {
      throw new Error('chainConfig not found');
    }
    let sendMainTokenValue = ethers.BigNumber.from(0);
    passOrders.forEach(order => {
      sendMainTokenValue = chains.inValidMainToken(chainId, order.token) ? sendMainTokenValue.add(order.value) : sendMainTokenValue;
    })
    let submitTx: TransactionResponse | undefined;
    let isXVMReply = ValidatorService.isSupportXVM(chainId);
    if (isXVMReply && passOrders.length === 1) {
      isXVMReply = false;
    }
    logger.info(`sequencer get ready submit`, { passOrders, sendMainTokenValue, isXVMReply });
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
        passOrders[0].error = error;
        logger.error(`sequencer xvm submit error:${error.message}`, error);
      } finally {
        const passHashList = passOrders.map(tx => tx.calldata.hash);
        if (submitTx) {
          logger.info(`sequencer xvm submit success`, {
            toHash: submitTx.hash,
            fromHashList: passHashList
          })
          for (const order of passOrders) {
            order.hash = submitTx.hash;
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
          order.error = error;
        } finally {
          if (submitTx) {
            logger.info(`${chainConfig.name} sequencer submit success`, {
              toHash: submitTx.hash,
              fromHash: order.calldata.hash
            })
            order.hash = submitTx.hash;
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
    return passOrders;
  }
}