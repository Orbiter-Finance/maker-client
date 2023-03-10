import { BigNumber } from 'bignumber.js';
import { TransferResponse } from "../account/IAccount";
import { isEmpty, equals, groupBy } from "orbiter-chaincore/src/utils/core";
import dayjs from "dayjs";
import { Op } from "sequelize";
import Context from "../context";
import { Factory } from "../account/factory";
import orbiterXAccount from "../account/orbiterXAccount";
import { chains } from "orbiter-chaincore";
import ValidatorService, { orderTimeoutMS } from "./validator";
import { ethers } from "ethers";
import { TransactionResponse } from "../account/IAccount";
import Caching from "../utils/caching";
import { LoggerService } from "../utils/logger";
import OrbiterAccount from "../account/orbiterAccount";
import { getAmountToSend } from "../lib/oldCore";
const submissionInterval = 1000 * 60 * 1;
export interface submitResponse {
  chainId: number;
  error?: Error | string;
  makerDeal?: Array<SwapOrder>;
}
export interface CalldataType {
  chainId: number;
  hash: string;
  token: string;
  value: string;
  nonce: number;
  expectValue: string;
  timestamp: number;
  slipPoint: number;
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
  calldata: CalldataType;
  type: SwapOrderType;
  error?: Error | string | unknown;
}
interface MonitorState {
  [key: number]: {
    locked: boolean;
    lastSubmit: number;
  };
}
export default class Sequencer {
  private pending: { [key: number]: SwapOrder[] } = {};
  private monitorState: MonitorState = {};
  //
  constructor(private readonly ctx: Context) {
    this.monitor();
  }
  async readHistory() {
    const historyList = await this.ctx.db.Transaction.findAll({
      raw: true,
      attributes: [
        "source",
        "hash",
        "timestamp",
        "chainId",
        "tokenAddress",
        "value",
        "status",
        "side",
        "memo",
        "expectValue",
        "replySender",
        "replyAccount",
        "extra"
      ],
      where: {
        source: "xvm",
        status: 1,
        side: 0,
        timestamp: {
          [Op.gt]: dayjs()
            .subtract(orderTimeoutMS, "ms")
            .format("YYYY-MM-DD HH:mm")
        }
      }
    });
    this.ctx.logger.info("init read history success", {
      fromHash: historyList.map((tx) => tx.hash)
    });
    for (const tx of historyList) {
      try {
        const order = await this.ctx.validator.verifyFromTx(tx);
        order && this.push(order);
      } catch (error) {
        this.ctx.logger.error("init history verifyFromTx error:", {
          hash: tx.hash
        });
      }
    }
  }
  async exec(chainId: string) {
    const logger = LoggerService.getLogger("");
    const monitorState = this.monitorState[chainId];
    const pendingAllTxs: SwapOrder[] = this.pending[chainId];
    if (pendingAllTxs.length <= 0) {
      return undefined;
    }
    const pendingTxs = pendingAllTxs.splice(0, 50);
    const matchOrders: SwapOrder[] = [];
    try {
      monitorState.locked = true;
      // filter
      logger.info(
        `start scan pendingTxs chainId: ${chainId},nowPendingCount:${this.pending[chainId].length}, pendingTxsCount: ${pendingTxs.length}`,
        {
          hashs: pendingTxs.map((row) => row.calldata.hash)
        }
      );
      for (const order of pendingTxs) {
        try {
          if (
            !ValidatorService.transactionTimeValid(order.calldata.timestamp)
          ) {
            this.ctx.logger.info(`${order.calldata.hash} remove order`);
            continue;
          }
          if (!this.ctx.validator.checkSenderPrivateKey(order.from)) {
            pendingAllTxs.push(order);
            this.ctx.logger.error(`${order.from} Please start the private key injection program`);
            continue;
          }
          if (
            [SwapOrderType.UA, SwapOrderType.CrossAddr].includes(order.type)
          ) {
            matchOrders.push(order);
            continue;
          }
          if (order.type === SwapOrderType.CrossToken) {
            // matchOrders.
            const value = await this.ctx.validator.verifyXVMCrossToken(order);
            if (value && !isEmpty(value)) {
              order.value = String(value);
              matchOrders.push(order);
            } else {
              pendingAllTxs.push(order);
            }
          }
        } catch (error) {
          logger.info(`exec submit before order error`, {
            hash: order.calldata.hash,
            error
          });
          logger.error(error);
        }
      }
      logger.info(
        `end scan pendingTxs chainId:${chainId},nowPendingCount:${this.pending[chainId].length}, pendingTxsCount: ${pendingTxs.length}, matchOrders:${matchOrders.length}`
      );
      if (matchOrders.length > 0) {
        logger.info(`exec submit before:${matchOrders.length}`);
        const result = await this.submit(Number(chainId), matchOrders);
        console.log("submit result:", JSON.stringify(result));
      }
    } catch (error) {
      console.log(error);
      logger.error(`${chainId} submit error:`, {
        hashs: matchOrders.map((row) => row.calldata.hash)
      });
    } finally {
      monitorState.locked = false;
      monitorState.lastSubmit = Date.now();
      logger.info(
        `start scan end chainId: ${chainId},nowPendingCount:${this.pending[chainId].length}, pendingAllTxs: ${pendingAllTxs.length}, pendingTxs:${pendingTxs.length}`
      );
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
          this.ctx.logger.debug(
            `check orders:${chainId},pendingTxs:${this.pending[chainId].length}, monitorState:${monitorState.locked}, lastSubmit:${monitorState.lastSubmit}`
          );
          if (
            !monitorState.locked &&
            Date.now() - monitorState.lastSubmit > submissionInterval
          ) {
            this.exec(chainId);
          }
        }
      };
      setInterval(handle, 1000 * 10);
    } catch (error) {
      this.ctx.logger.error("monitor error", error);
    }
  }
  async push(trx: SwapOrder) {
    const chainId = trx.chainId.toString();
    if (isEmpty(this.pending[chainId])) {
      this.pending[chainId] = [];
    }
    const isExist =
      this.pending[chainId].findIndex((tx) =>
        equals(tx.calldata.hash, trx.calldata.hash)
      ) >= 0;
    if (isExist) {
      this.ctx.logger.warn(`${trx.calldata.hash} exist tradePool Array`);
      return;
    }
    this.pending[chainId].push(trx);
    const logger = LoggerService.getLogger(chainId.toString(), {
      label: chainId
    });
    logger.debug("push:", { hash: trx.calldata.hash });
    return this.pending[chainId];
  }

  async submit(
    chainId: number,
    pendingTxs: SwapOrder[]
  ): Promise<submitResponse> {
    // exec send
    try {
      const logger = LoggerService.getLogger(chainId.toString(), {
        label: chainId.toString()
      });
      logger.info("submit step 1");
      const chainConfig = chains.getChainInfo(chainId);
      if (!chainConfig) {
        return { chainId, error: "To Chain ChainConfig Not found" };
      }
      logger.info("submit step 2");
      const cache = Caching.getCache(chainId.toString());
      if (pendingTxs.length <= 0) {
        return { chainId, error: "pendingTxs less 0" };
      }
      logger.info("submit step 3");
      const senderPrivateKey = {};
      const makerBalance: {
        [key: string]: ethers.BigNumber;
      } = {};
      for (const order of pendingTxs) {
        const senderRecord = await cache.get(order.calldata.hash);
        if (!isEmpty(senderRecord)) {
          order.error = "The sending record already exists, blocking";
          logger.error(
            `${order.calldata.hash} The sending record already exists, blocking`
          );
          continue;
        }
        logger.info("submit step 3-1-1");
        const validResult = await this.ctx.validator.verifyToTx(order);
        if (!validResult) {
          order.error = "verifyToTx Fail";
          logger.error(`${order.calldata.hash} verifyToTx Fail`);
          continue;
        }
        const senderWallet = order.from;
        const sendToken = order.token.toLocaleLowerCase();
        try {
          logger.info("submit step 3-1-2");
          const account: OrbiterAccount = Factory.createMakerAccount(
            validResult.address,
            validResult.privateKey,
            chainId
          );
          // get balance
          const sendValue = ethers.BigNumber.from(order.value);
          if (makerBalance[sendToken] === undefined) {
            const token = chains.inValidMainToken(chainId, sendToken)
              ? undefined
              : sendToken;
            logger.info("submit step 3-1-3");
            //online zxy
            // makerBalance[sendToken] = await account.getBalance(senderWallet, token);
          }
          if (
            makerBalance[sendToken] &&
            makerBalance[sendToken].lt(sendValue)
          ) {
            order.error = `${senderWallet} Maker ${sendToken} Insufficient funds ${makerBalance[sendToken]}/${sendValue}`;
            logger.error(`${order.calldata.hash} transfer Insufficient funds`);
            continue;
          }
          if (makerBalance[sendToken]) {
            makerBalance[sendToken] = makerBalance[sendToken].sub(sendValue);
          }
        } catch (error) {
          logger.warn(
            `${chainId} get maker balance error ${senderWallet} - ${sendToken}`,
            error
          );
        }
        // save cache
        await cache.set(order.calldata.hash, true, 1000 * 60 * 60 * 24 * 7);
        senderPrivateKey[order.from.toLocaleLowerCase()] =
          validResult.privateKey;
      }
      logger.info("submit step 4");
      const prepareList = pendingTxs.filter((o) => isEmpty(o.error));
      const groupFromAddrList = groupBy(prepareList, "from");
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
          const account: OrbiterAccount = Factory.createMakerAccount(
            sender,
            privateKey,
            chainId
          );
          const trxList = groupFromAddrList[makerReplyAddr];
          const passOrders: Array<SwapOrder> = trxList.filter((o) =>
            isEmpty(o.error)
          );
          logger.info("submit step 5-2");
          if (passOrders.length <= 0) {
            logger.warn(`${chainConfig.name} sequencer passOrders lte 0:`, {
              passOrders
            });
            continue;
          }
          logger.info("submit step 5-3");
          await this.swapReply(chainId, account, passOrders);
          logger.info("sequencer swapReply success");
          logger.info("submit step 5-4");
        } catch (error) {
          logger.error("Revolving payment error", error);
        }
      }
      logger.info("Complete submission", { makerDeal: pendingTxs });
      return { chainId, makerDeal: pendingTxs };
    } catch (error) {
      throw error;
    }
  }
  public async swapReply(
    chainId: number,
    account: OrbiterAccount,
    passOrders: Array<SwapOrder>
  ) {
    const logger = LoggerService.getLogger(chainId.toString(), {
      label: chainId.toString()
    });
    const chainConfig = chains.getChainInfo(chainId);
    if (!chainConfig) {
      throw new Error("chainConfig not found");
    }
    let sendMainTokenValue = ethers.BigNumber.from(0);
    passOrders.forEach((order) => {
      sendMainTokenValue = chains.inValidMainToken(chainId, order.token)
        ? sendMainTokenValue.add(order.value)
        : sendMainTokenValue;
    });
    let contractTransfer: Boolean = false;
    if (passOrders.length === 1) {
      if (
        [SwapOrderType.CrossAddr, SwapOrderType.CrossToken].includes(
          passOrders[0].type
        )
      ) {
        contractTransfer = ValidatorService.isSupportXVM(chainId);
      }
    } else {
      contractTransfer = ValidatorService.isSupportXVM(chainId);
    }
    // if (passOrders.length >= 3) {
    //   contractTransfer = ValidatorService.isSupportXVM(chainId);
    // }
    logger.info(`sequencer get ready submit`, {
      passOrders,
      sendMainTokenValue,
      contractTransfer
    });
    if (contractTransfer) {
      let submitTx: TransactionResponse | undefined;
      logger.info("submit xvm step 6-1");
      const encodeDatas = passOrders.map((order) => {
        return (<orbiterXAccount>account).swapOkEncodeABI(
          order.calldata.hash,
          order.token,
          order.to,
          order.value
        );
      });
      let isError = false;
      try {
        logger.info("submit xvm step 6-1 swapOK", {
          encodeDatas,
          accountType: typeof account
        });
        submitTx = await (<orbiterXAccount>account).swapOK(
          encodeDatas.length === 1 ? encodeDatas[0] : encodeDatas,
          {
            value: sendMainTokenValue
          }
        );
        logger.info("submit xvm step 6-1 wait");
      } catch (error) {
        isError = true;
        passOrders[0].error = error;
        for (const order of passOrders) {
          this.ctx.smsService.sendAlert("SendTransactionError", {
            chain: chainId,
            msg: order.calldata.hash
          });
        }
        const errmsg = (error as Error).message;
        logger.error(`${chainId} sequencer xvm submit error:${errmsg}`, error);
      } finally {
        logger.info("submit xvm step 6-2");
        const passHashList = passOrders.map((tx) => tx.calldata.hash);
        if (submitTx) {
          logger.info(`sequencer xvm submit success`, {
            toHash: submitTx.hash,
            fromHashList: passHashList
          });
          for (const order of passOrders) {
            order.hash = submitTx.hash;
          }
          await this.ctx.db.Sequencer.upsert({
            hash: submitTx.hash,
            from: submitTx.from,
            to: String(submitTx.to),
            status: 1,
            chainId: chainId,
            transactions: passHashList as any,
            transactionCount: encodeDatas.length
          });
        }
        // change
        await this.ctx.db.Transaction.update(
          {
            status: isError ? 96 : 97
          },
          {
            where: {
              hash: passHashList.length > 1 ? passHashList : passHashList[0]
            }
          }
        );
      }
    }
    if (!contractTransfer) {
      logger.info("submit step 6-2");
      // ua
      const txType = (chainConfig["features"] || []).includes("EIP1559")
        ? 2
        : 0;
      for (const order of passOrders) {
        let submitTx: TransferResponse | undefined;
        const transferParams =
          (await account.sendCollectionGetParameters(order)) || {};
        try {
          let sendValue = order.value;
          if (order.type === SwapOrderType.CrossToken) {
            const fromToken = chains.getTokenByChain(Number(order.calldata.chainId), order.calldata.token);
            if (!fromToken) {
              throw new Error(`fromToken not found`);
            }
            // TAG: value + nonce
            // const response = getAmountToSend(order.calldata.chainId, fromToken.decimals, 0, 0, order.chainId, sendValue, order.calldata.nonce);
            // if (response?.error || !response?.state) {
            //   throw new Error('send before getAmountToSend fail');
            // }
            // sendValue = new BigNumber(response.tAmount || 0).toFixed(0);
          }
          if (chains.inValidMainToken(chainId, order.token)) {
            logger.info("submit step 6-2-1-1", {
              to: order.to,
              value: sendValue,
              txType
            });
            submitTx = await account.transfer(order.to, sendValue, {
              type: txType,
              ...transferParams
            });
            logger.info("submit step 6-2-1-1 wait", { submitTx });
          } else {
            logger.info("submit step 6-2-1-2", {
              token: order.token,
              to: order.to,
              value: sendValue,
              txType
            });
            submitTx = await account.transferToken(
              order.token,
              order.to,
              sendValue,
              {
                type: txType,
                ...transferParams
              }
            );
            logger.info("submit step 6-2-1-2 wait", { submitTx });
          }
          order.hash = submitTx ? submitTx.hash : "";
          logger.info("submit step 6-2-1-3");
        } catch (error) {
          this.ctx.smsService.sendAlert("SendTransactionError", {
            chain: chainId,
            msg: order.calldata.hash
          });
          const errmsg = (error as Error).message;
          logger.error(
            `${chainConfig.name} ${order.calldata.hash} sequencer submit error:${errmsg}`,
            error
          );
          order.error = error;
        } finally {
          logger.info("submit step 6-2-2");
          if (order.hash) {
            logger.info(`${chainConfig.name} sequencer submit success`, {
              toHash: order.hash,
              fromHash: order.calldata.hash
            });
            await this.ctx.db.Sequencer.upsert({
              hash: order.hash,
              from: order.from,
              to: String(order.to),
              status: 1,
              chainId: order.chainId,
              transactions: [order.calldata.hash] as any,
              transactionCount: 1
            });
          }
          logger.info("submit step 6-2-3");
          // change
          await this.ctx.db.Transaction.update(
            {
              status: order.error ? 96 : 97
            },
            {
              where: {
                hash: order.calldata.hash
              }
            }
          );
          logger.info("submit step 6-2-4");
        }
      }
    }
    logger.info("submit step 6-3");
    return passOrders;
  }
}
