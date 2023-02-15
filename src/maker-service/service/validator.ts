import { BigNumber } from 'bignumber.js';
import dayjs from 'dayjs';
import { ethers } from 'ethers';
import { chains } from 'orbiter-chaincore';
import { equals, isEmpty } from 'orbiter-chaincore/src/utils/core';
import sequelize, { Op } from 'sequelize';
import Context from '../context';

import { Transaction } from '../models/Transactions';
import { LoggerService } from '../utils/logger';
import { getChainLinkPrice } from './quotation';
import { SwapOrder, SwapOrderType } from './sequencer';

export const orderTimeoutMS = 1000 * 60 * 30;
export default class ValidatorService {
  constructor(private readonly ctx: Context) { }
  public static transactionTimeValid(timestamp: number) {
    const timeout = Date.now() - dayjs(timestamp).valueOf();
    if (timeout >= orderTimeoutMS) {
      return false; // 'Please collect manually if the transaction exceeds the specified time'
    }
    return true;
  }
  public async verifyFromTx(fromTx: Transaction): Promise<SwapOrder | undefined> {
    const logger = LoggerService.getLogger("");
    if (
      !this.ctx.config.ENABLE_AUTO_PAYMENT_CHAINS.split(',').includes(fromTx.memo || "")
    ) {
      logger.error(`${fromTx.hash} chain ${fromTx.memo} Payment collection is not supported`);
      return undefined;
    }
    if (fromTx.source != 'xvm' || !fromTx.extra || isEmpty(fromTx.extra['xvm'])) {
      logger.warn(`${fromTx.hash} not OrbiterX tx 1`);
      if (!['development', 'test'].includes(this.ctx.NODE_ENV)) {
        console.log('stop...')
      }
      // return;
    }
    if (!(fromTx.extra && fromTx.extra['xvm'] && fromTx.extra['xvm']['name'] == 'swap')) {
      logger.warn(`${fromTx.hash} not OrbiterX tx 2`);
      if (!['development', 'test'].includes(this.ctx.NODE_ENV)) {
        console.log('stop...')
      }
      // return;
    }

    const side = fromTx.side;
    if (side !== 0) {
      logger.error(`${fromTx.hash} ${fromTx.side} tx side incorrect`);
      return undefined;
    }
    if (fromTx.status !== 1) {
      logger.error(`${fromTx.hash} ${fromTx.status} tx status incorrect`);
      return undefined;
    }

    if (isEmpty(fromTx.tokenAddress) || !fromTx.tokenAddress) {
      logger.error(`${fromTx.hash} token address not found`);
      return undefined;
    }
    if (!fromTx.extra) {
      logger.error(`${fromTx.hash} extra not found`);
      return undefined;
    }
    if (!fromTx.expectValue) {
      logger.error(`${fromTx.hash} expectValue not found`);
      return undefined;
    }
    // valid from chain & from token
    const fromChainId = Number(fromTx.chainId);
    const fromToken = chains.getTokenByChain(fromChainId, fromTx.tokenAddress);
    if (isEmpty(fromToken) || !fromToken) {
      logger.error(`${fromTx.chainId} - ${fromTx.hash} fromChain fromToken not found`);
      return undefined;
    }
    // find db data
    const tx = await this.ctx.db.Transaction.findOne({
      attributes:['status'],
      where: {
        hash: fromTx.hash
      }
    });
    if (!tx) {
      logger.error(`verifyFromTx ${fromTx.hash} data not found`);
      return;
    }
    if (tx.status!=1) {
      logger.error(`verifyFromTx ${fromTx.hash} data status is not 1`);
      return;
    }
    const toChainId = Number(fromTx.memo);
    const swapOrder: SwapOrder = {
      chainId: Number(toChainId),
      hash: "",
      from: fromTx.replySender,
      to: fromTx.replyAccount,
      token: '',
      value: "",
      calldata: {
        chainId: Number(fromChainId),
        nonce: Number(fromTx.nonce),
        hash: fromTx.hash.toLocaleLowerCase(),
        token: fromToken.address,
        value: fromTx.value,
        expectValue: fromTx.expectValue,
        timestamp: dayjs(fromTx.timestamp).valueOf(),
        slipPoint: 0,
      },
      type: SwapOrderType.None
    };
    if (fromTx.extra['xvm']) {
      if (fromTx.extra['xvm']['name'] != 'swap') {
        logger.error(`${fromTx.chainId} - ${fromTx.hash} xvm function name not eq swap`);
        return;
      }
      const params = fromTx.extra['xvm']['params'];
      swapOrder.token = params['data']['toTokenAddress'];
      const toToken = chains.getTokenByChain(toChainId, swapOrder.token);
      if (params.data['toWalletAddress']) {
        swapOrder.to = params.data['toWalletAddress'];
      }
      if (toToken) {
        if (equals(fromToken.symbol, toToken.symbol)) {
          // cross address
          swapOrder.type = SwapOrderType.CrossAddr;
          swapOrder.value = fromTx.expectValue;
        } else {
          // corss token
          swapOrder.type = SwapOrderType.CrossToken;
          swapOrder.value = new BigNumber(params.data['expectValue']).toString();
          swapOrder.calldata.slipPoint = new BigNumber(params.data['slippage']).toNumber();
          // swapOrder.calldata.expectValue = new BigNumber(params.data['expectValue']).toString();
        }
      }

    } else {
      // ua
      swapOrder.token = fromTx.extra['ua']['toTokenAddress'];
      swapOrder.type = SwapOrderType.UA;
      swapOrder.value = fromTx.expectValue;
    }
    if (isEmpty(swapOrder.token) || !swapOrder.token) {
      logger.error(`${fromTx.chainId} - ${fromTx.hash} toTokenAddress not found`);
      return undefined;
    }

    // valid token chain & to token
    const toToken = chains.getTokenByChain(toChainId, swapOrder.token);
    if (isEmpty(toToken) || !toToken) {
      logger.error(`${fromTx.chainId} ${fromTx.hash} ${swapOrder.token} toToken not found`);
      return undefined;
    }

    // 
    // If the transaction is within half an hour, automatic payment collection will not be allowed
    if (!ValidatorService.transactionTimeValid(swapOrder.calldata.timestamp)) {
      logger.error(
        `${swapOrder.calldata.hash} Please collect manually if the transaction exceeds the specified time`
      );
      return undefined;
    }
    if (swapOrder.type === SwapOrderType.None) {
      logger.error(`verifyFromTx ${swapOrder.type} type none `);
      return undefined;
    }
    const chainConfig = chains.getChainInfo(swapOrder.chainId);
    if (!chainConfig) {
      logger.error(`verifyFromTx ${swapOrder.calldata.hash} ${swapOrder.chainId} chainConfig not found`);
      return undefined;
    }
    const isEVM = (chainConfig['features'] || []).includes("EVM");
    if (isEVM) {
      if (!ethers.utils.isAddress(swapOrder.to)) {
        logger.error(`verifyFromTx ${swapOrder.calldata.hash} ${swapOrder.to} to address format error`);
        return undefined;
      }
      if (!ethers.utils.isAddress(swapOrder.token)) {
        logger.error(`verifyFromTx ${swapOrder.calldata.hash} ${swapOrder.chainId} token address format error`);
        return undefined;
      }
      if (!ethers.utils.isAddress(swapOrder.from)) {
        logger.error(`verifyFromTx ${swapOrder.calldata.hash} ${swapOrder.chainId} from address format error`);
        return undefined;
      }
    }


    return swapOrder;
  }
  /**
   * Veify To Tx
   */
  public async verifyToTx(swapOrder: SwapOrder) {
    const logger = LoggerService.getLogger(swapOrder.chainId.toString(), {
      label: String(swapOrder.chainId || "")
    });
    // const logger = this.ctx.logger;
    const privateKey = this.getSenderPrivateKey(swapOrder.from);
    if (isEmpty(privateKey)) {
      logger.error(`verifyToTx ${swapOrder.from} private key no found`);
      return undefined;
    }
    if (swapOrder.type === SwapOrderType.None) {
      logger.error(`verifyToTx ${swapOrder.type} type none `);
      return undefined;
    }
    if (!ValidatorService.transactionTimeValid(swapOrder.calldata.timestamp)) {
      logger.error(
        `${swapOrder.calldata.hash} verifyToTx Please collect manually if the transaction exceeds the specified time`
      );
      return undefined;
    }
    if (process.env['user.blacklist'] && process.env['user.blacklist'].includes(swapOrder.to.toLocaleLowerCase())) {
      logger.error(
        `${swapOrder.calldata.hash} The receiving address is a blacklist address`
      );
      return undefined;
    }

    // valid from chain & from token
    const fromChainId = Number(swapOrder.calldata.chainId);
    const fromToken = chains.getTokenByChain(fromChainId, swapOrder.calldata.token);
    if (isEmpty(fromToken) || !fromToken) {
      logger.error(`verifyToTx ${swapOrder.calldata.hash} ${swapOrder.calldata.token} fromToken not found`);
      return undefined;
    }

    // 
    const toToken = chains.getTokenByChain(swapOrder.chainId, swapOrder.token)
    if (isEmpty(toToken) || !toToken) {
      logger.error(`verifyToTx ${swapOrder.calldata.hash} ${swapOrder.token} toToken not found`);
      return undefined;
    }
    // If the value difference between "from" and "to" is too large, intercept
    const fromValueMaxUint = new BigNumber(swapOrder.calldata.value).dividedBy(new BigNumber(10).pow(fromToken.decimals));
    const fromUSDValue = await getChainLinkPrice(fromValueMaxUint.toString(), fromToken.symbol, 'usd');
    if (fromUSDValue.lte(0)) {
      logger.error(`${swapOrder.calldata.hash} Exchange rate not obtained FromToken ${fromToken.symbol}=>usd`);
      return undefined;
    }
    const toValueMaxUint = new BigNumber(swapOrder.value).dividedBy(new BigNumber(10).pow(toToken.decimals));
    const toUSDValue = await getChainLinkPrice(toValueMaxUint.toString(), toToken.symbol, 'usd');
    if (toUSDValue.lte(0)) {
      logger.error(`${swapOrder.calldata.hash} Exchange rate not obtained ToToken ${toToken.symbol}=>usd`);
      return undefined;
    }
    console.log(`fromUSDValue:${fromUSDValue.toString()}`);
    console.log(`toUSDValue:${toUSDValue.toString()}`);
    const upRate = new BigNumber(toUSDValue).dividedBy(new BigNumber(fromUSDValue).multipliedBy(100));
    console.log('upRate:', upRate.toString());
    if (upRate.gte(1.5)) {
      logger.error(`verifyToTx ${swapOrder.calldata.hash} There may be a risk of loss, and the transaction has been blocked (toValue ${toToken.symbol}:${toValueMaxUint.toString()},fromValue ${fromToken.symbol}:${fromValueMaxUint.toString()},upRate:${upRate.toString()})`);
      return undefined;
    }

    // veify 
    const sequencerExist = await this.ctx.db.Sequencer.findOne({
      attributes: ["id"],
      raw: true,
      where:<any> {
        [Op.or]: [sequelize.fn('JSON_CONTAINS', sequelize.col('transactions'), sequelize.fn('JSON_Array', swapOrder.calldata.hash.toLocaleLowerCase()))]
      }
    });
    if (sequencerExist && sequencerExist.id) {
      logger.error(`${swapOrder.calldata.hash} verifyToTx Find Sequencer Tx Exist`);
      return undefined;
    }
    //
    const sourceTx = await this.ctx.db.Transaction.findOne({
      attributes: ['id'],
      where: {
        hash: swapOrder.calldata.hash,
        side: 0,
        status: 1
      }
    });
    if (!sourceTx) {
      logger.error(`${swapOrder.calldata.hash} No transaction waiting for payment collection found(from db)`);
      return undefined;
    }
    // check privateKey
    if (!this.checkSenderPrivateKey(swapOrder.from)) {
      logger.error(`verifyToTx ${swapOrder.from} private key no found`);
      return undefined;
    }
    return {
      address: swapOrder.from,
      privateKey,
      token: toToken
    }
  }
  public async verifyXVMCrossToken(swapOrder: SwapOrder): Promise<string | undefined> {
    const logger = LoggerService.getLogger(swapOrder.chainId.toString(), {
      label: String(swapOrder.chainId || "")
    });
    if (swapOrder.type != SwapOrderType.CrossToken) {
      logger.error(`verifyXVMCrossToken ${swapOrder.calldata.hash} type error`);
      return undefined;
    }
    const fromToken = chains.getTokenByChain(swapOrder.calldata.chainId, swapOrder.calldata.token)
    if (isEmpty(fromToken) || !fromToken) {
      logger.error(`verifyToTx ${swapOrder.calldata.hash} fromToken not found`);
      return undefined;
    }
    const toToken = chains.getTokenByChain(swapOrder.chainId, swapOrder.token);
    if (isEmpty(toToken) || !toToken) {
      logger.error(`verifyToTx ${swapOrder.calldata.hash} ${swapOrder.token} toToken not found`);
      return undefined;
    }
    const fromDecimal = Number(fromToken.decimals);
    const destDecimal = Number(toToken.decimals);
    if (swapOrder.type === SwapOrderType.CrossToken) {
      const fromValue = new BigNumber(swapOrder.calldata.value).dividedBy(new BigNumber(10).pow(fromDecimal));
      const fromValuePriceValue = await getChainLinkPrice(fromValue.toString(), fromToken.symbol, toToken.symbol);
      if (fromValuePriceValue.lte(0)) {
        logger.error(`${swapOrder.calldata.hash} Exchange rate not obtained currentPriceValue ${fromToken.symbol}=>${toToken.symbol}`);
        return undefined;
      }
      const expectValue = new BigNumber(swapOrder.value).dividedBy(new BigNumber(10).pow(destDecimal));
      if (fromValuePriceValue.gte(expectValue)) {
        return swapOrder.value;
      }
      // const expectToTokenValue = new BigNumber(swapOrder.calldata.expectValue || 0).dividedBy(new BigNumber(10).pow(destDecimal));
      const expectToTokenMinValue = expectValue.minus(expectValue.multipliedBy(swapOrder.calldata.slipPoint).dividedBy(10000));
      if(fromValuePriceValue.gt(expectToTokenMinValue)) {
        return expectToTokenMinValue.minus(new BigNumber(10).pow(destDecimal)).toString();
      }
      return undefined;
      // if (fromValuePriceValue.gt(expectToTokenMinValue)) {
      //   logger.info(`${swapOrder.calldata.hash} No collection when the exchange rate is lower than the minimum ${fromToken.symbol}=>${toToken.symbol} (${fromValuePriceValue.toString()}/${expectToTokenMinValue.toString()})`);
      //   return undefined;
      // }

      // if (currentPriceValue.gte(expectToTokenMinValue)) {
      //   if (currentPriceValue.gte(expectToTokenValue)) {
      //     return expectToTokenValue.multipliedBy(new BigNumber(10).pow(toToken.decimals)).toFixed(0, BigNumber.ROUND_DOWN);
      //   }
      //   return currentPriceValue.multipliedBy(new BigNumber(10).pow(toToken.decimals)).toFixed(0, BigNumber.ROUND_DOWN);
      // }
    } else {
      return swapOrder.value;
    }
  }
  public checkSenderPrivateKey(from: string) {
    return !isEmpty(this.getSenderPrivateKey(from));
  }
  private getSenderPrivateKey(from: string) {
    const privateKey = process.env[from.toLocaleLowerCase()] || this.ctx.config["keys"][from.toLocaleLowerCase()];
    return privateKey;
  }
  public static isSupportXVM(chainId: number): Boolean {
    const chain = chains.getChainInfo(chainId);
    if (chain && chain.xvmList) {
      return chain.xvmList.length > 0;
    }
    return false;
  }
}
