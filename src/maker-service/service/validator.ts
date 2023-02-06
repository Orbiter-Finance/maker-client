import { BigNumber } from 'bignumber.js';
import dayjs from 'dayjs';
import { ethers } from 'ethers';
import { chains } from 'orbiter-chaincore';
import { equals, isEmpty } from 'orbiter-chaincore/src/utils/core';
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
    const logger = LoggerService.getLogger(fromTx.chainId.toString(), {
      label: String(fromTx.chainId || "")
    });
    // const logger = this.ctx.logger;
    // is support
    if (
      !this.ctx.config.ENABLE_AUTO_PAYMENT_CHAINS.split(',').includes(fromTx.memo || "")
    ) {
      logger.warn(`${fromTx.hash} chain ${fromTx.memo} Payment collection is not supported`);
      return undefined;
    }
    if (fromTx.source != 'xvm' || !fromTx.extra || isEmpty(fromTx.extra['xvm'])) {
      // logger.error(`${fromTx.hash} not xvm tx`);
      // is new chain
      if (!['520', '514', '518', '44', '4'].includes(fromTx.memo)) {
        logger.error(`${fromTx.hash} tx chainId is not supported`);
        return undefined;
      }
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
        hash: fromTx.hash,
        token: fromToken.address,
        value: fromTx.value,
        expectValue: fromTx.expectValue,
        timestamp: dayjs(fromTx.timestamp).valueOf(),
        slipPoint: 0,
      },
      type: SwapOrderType.None
    };
    if (fromTx.extra['xvm']) {
      if (fromTx.extra['xvm']['name']!='swap') {
        logger.error(`${fromTx.chainId} - ${fromTx.hash} xvm function name not eq swap`);
        return;
      }
      const params = fromTx.extra['xvm']['params'];
      swapOrder.token = params['data']['toTokenAddress'];
      const toToken = chains.getTokenByChain(toChainId, swapOrder.token);
      if (toToken) {
        // cross address
        // corss token
        if (equals(fromToken.symbol, toToken.symbol)) {
          swapOrder.type = SwapOrderType.CrossAddr;
          swapOrder.value = fromTx.expectValue;
        } else {
          swapOrder.type = SwapOrderType.CrossToken;
          swapOrder.value = "0x00";
          swapOrder.calldata.slipPoint = new BigNumber(params.data['slippage']).toNumber();
          swapOrder.calldata.expectValue = new BigNumber(params.data['expectValue']).toString();
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
      logger.error(`${fromTx.hash} toToken not found`);
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
        logger.error(`verifyFromTx ${swapOrder.calldata.hash} ${swapOrder.chainId} to address format error`);
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

    // check privateKey
    const privateKey = this.getSenderPrivateKey(swapOrder.from);
    if (isEmpty(privateKey)) {
      logger.error(`${swapOrder.from} private key no found`);
      return undefined;
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
    const fromValue = await getChainLinkPrice(fromValueMaxUint.toString(), fromToken.symbol, 'usd');
    if (fromValue.lte(0)) {
      logger.error(`${swapOrder.calldata.hash} Exchange rate not obtained FromToken ${fromToken.symbol}=>usd`);
      return undefined;
    }
    const toValueMaxUint = new BigNumber(swapOrder.value).dividedBy(new BigNumber(10).pow(toToken.decimals));
    const toValue = await getChainLinkPrice(toValueMaxUint.toString(), toToken.symbol, 'usd');
    if (toValue.lte(0)) {
      logger.error(`${swapOrder.calldata.hash} Exchange rate not obtained ToToken ${toToken.symbol}=>usd`);
      return undefined;
    }
    const upRate = new BigNumber(toValue).dividedBy(new BigNumber(fromValue).multipliedBy(100));
    if (upRate.gte(1.5)) {
      logger.error(`verifyToTx ${swapOrder.calldata.hash} There may be a risk of loss, and the transaction has been blocked (toValue ${toToken.symbol}:${toValue.toString()},fromValue ${fromToken.symbol}:${fromValue.toString()},upRate:${upRate.toString()})`);
      return undefined;
    }

    // veify 
    const sequencerExist = await this.ctx.db.Sequencer.findOne({
      attributes: ["id"],
      raw: true,
      where: {
        hash: swapOrder.calldata.hash
      }
    });
    if (sequencerExist && sequencerExist.id) {
      logger.error(`${swapOrder.calldata.hash} verifyToTx Find Sequencer Tx Exist`);
      return undefined;
    }
    const sourceTx = await this.ctx.db.Transaction.findOne({
      attributes: ['id'],
      where: {
        hash: swapOrder.calldata.hash,
        side: 0,
        status: 1
      }
    });
    if (!sourceTx) {
      logger.error(`${swapOrder.calldata.hash} No transaction waiting for payment collection found`);
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
      logger.error(`${swapOrder.calldata.hash} toToken not found`);
      return undefined;
    }
    const fromDecimal = Number(fromToken.decimals);
    const destDecimal = Number(toToken.decimals);
    if (swapOrder.type === SwapOrderType.CrossToken) {
      // expectValue = From Token Value
      // TODO: expectValue or value
      const fromValue = new BigNumber(swapOrder.calldata.expectValue).dividedBy(new BigNumber(10).pow(fromDecimal));
      const fromValuePriceValue = await getChainLinkPrice(fromValue.toString(), fromToken.symbol, toToken.symbol);
      if (fromValuePriceValue.lte(0)) {
        logger.error(`${swapOrder.calldata.hash} Exchange rate not obtained currentPriceValue ${fromToken.symbol}=>${toToken.symbol}`);
        return undefined;
      }

      const expectToTokenValue = new BigNumber(swapOrder.calldata.expectValue || 0).dividedBy(new BigNumber(10).pow(destDecimal));
      const expectToTokenMinValue = expectToTokenValue.minus(expectToTokenValue.multipliedBy(swapOrder.calldata.slipPoint).div(10000))
      return swapOrder.calldata.expectValue;
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
  private getSenderPrivateKey(from: string) {
    const privateKey = process.env[from.toLocaleLowerCase()] || "";
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
