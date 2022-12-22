import { BigNumber } from 'bignumber.js';
import dayjs from 'dayjs';
import { chains } from 'orbiter-chaincore';
import { LoggerService } from 'orbiter-chaincore/src/utils';
import { equals, isEmpty } from 'orbiter-chaincore/src/utils/core';
import Context from '../context';

import { Transaction } from '../models/Transactions';
import { getQuotationPrice } from './quotation';
import { SwapOrder, SwapOrderType } from './sequencer';

export const orderTimeoutMS = 1000 * 60 * 60;
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
    const logger = LoggerService.getLogger(fromTx.chainId.toString());
    // is support
    if (
      !this.ctx.config.ENABLE_AUTO_PAYMENT_CHAINS.split(',').includes(fromTx.memo || "")
    ) {
      logger.error(`${fromTx.hash} chain ${fromTx.memo} Payment collection is not supported`);
      return undefined;
    }
    // if (fromTx.source != 'xvm') {
    //   if (!equals(fromTx.from, '0x8A3214F28946A797088944396c476f014F88Dd37')) {
    //     logger.error(`${fromTx.hash} not xvm tx`);
    //     return undefined;
    //   }
    //   logger.info(`${fromTx.hash} xvm tx 0x8A3214F28946A797088944396c476f014F88Dd37`);
    // }
    const side = fromTx.side;
    if (side !== 0) {
      logger.error(`${fromTx.hash} ${fromTx.side} tx side incorrect`);
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
    // valid token chain & to token
    const toChainId = Number(fromTx.memo);
    const toTokenAddress = fromTx.extra['toToken'];
    const toToken = chains.getTokenByChain(toChainId, toTokenAddress);
    if (isEmpty(toToken) || !toToken) {
      logger.error(`${fromTx.hash} toToken not found`);
      return undefined;
    }

    const swapOrder: SwapOrder = {
      chainId: Number(toChainId),
      hash: "",
      from: fromTx.replySender,
      to: fromTx.replyAccount,
      token: toToken.address,
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
    // 
    // If the transaction is within half an hour, automatic payment collection will not be allowed
    if (!ValidatorService.transactionTimeValid(swapOrder.calldata.timestamp)) {
      logger.error(
        `${swapOrder.calldata.hash} Please collect manually if the transaction exceeds the specified time`
      );
      return undefined;
    }
    if (fromTx.source === 'xvm' && fromTx.extra['xvm']) {
      const xvmExtra = fromTx.extra['xvm'];
      if (xvmExtra.name != 'swap') {
        logger.error('transferPayment xvm event name error');
        return undefined;
      }
      const paramsLength = xvmExtra.params.data.length;
      if (paramsLength === 3) {
        swapOrder.type = SwapOrderType.CrossAddr;
        swapOrder.value = fromTx.expectValue;
      } else if (paramsLength === 5) {
        swapOrder.type = SwapOrderType.CrossToken;
        swapOrder.value = "0x00";
        swapOrder.calldata.slipPoint = new BigNumber(xvmExtra.params.data[4]).toNumber();
        swapOrder.calldata.crossTokenUserExpectValue = new BigNumber(xvmExtra.params.data[3]).toString();
        // The value should be calculated according to the current exchange rate
        // swapOrder.calldata.expectValue = new BigNumber(xvmExtra.params.data[3]).toString();
      }
    } else {
      swapOrder.type = SwapOrderType.UA;
      swapOrder.value = fromTx.expectValue;
    }
    if (swapOrder.type === SwapOrderType.None) {
      logger.error(`verifyToTx ${swapOrder.type} type none `);
      return undefined;
    }
    // check privateKey
    const privateKey = this.getSenderPrivateKey(swapOrder.from);
    if (isEmpty(privateKey)) {
      logger.error(`${swapOrder.from} private key no found`);
      return undefined;
    }
    return swapOrder;
  }
  public async verifyToTx(swapOrder: SwapOrder) {
    const logger = LoggerService.getLogger(swapOrder.chainId.toString());

    const privateKey = this.getSenderPrivateKey(swapOrder.from);
    if (isEmpty(privateKey)) {
      logger.error(`verifyToTx ${swapOrder.from} private key no found`);
      return undefined;
    }

    if (!ValidatorService.transactionTimeValid(swapOrder.calldata.timestamp)) {
      logger.error(
        `${swapOrder.calldata.hash} verifyToTx Please collect manually if the transaction exceeds the specified time`
      );
      return undefined;
    }

    // valid from chain & from token
    const fromChainId = Number(swapOrder.calldata.chainId);
    const fromToken = chains.getTokenByChain(fromChainId, swapOrder.calldata.token);
    if (isEmpty(fromToken) || !fromToken) {
      logger.error(`verifyToTx ${swapOrder.calldata.hash} fromToken not found`);
      return undefined;
    }

    // 
    const toToken = chains.getTokenByChain(swapOrder.chainId, swapOrder.token)
    if (isEmpty(toToken) || !toToken) {
      logger.error(`verifyToTx ${swapOrder.calldata.hash} toToken not found`);
      return undefined;
    }
    // If the value difference between "from" and "to" is too large, intercept
    const fromValueMaxUint = new BigNumber(swapOrder.calldata.value).dividedBy(new BigNumber(10).pow(fromToken.decimals));
    const fromValue = await getQuotationPrice(fromValueMaxUint.toString(), fromToken.symbol, 'usd');
    const toValueMaxUint = new BigNumber(swapOrder.value).dividedBy(new BigNumber(10).pow(toToken.decimals));
    const toValue = await getQuotationPrice(toValueMaxUint.toString(), toToken.symbol, 'usd');
    const upRate = new BigNumber(toValue).dividedBy(new BigNumber(fromValue).multipliedBy(100));
    if (upRate.gte(1)) {
      logger.error(`verifyToTx ${swapOrder.calldata.hash} There may be a risk of loss, and the transaction has been blocked`);
      return undefined;
    }
    // veify 
    const sequencerExist = await this.ctx.db.Sequencer.findOne({
      attributes: ["id"],
      raw: true,
      where: {
        from: swapOrder.calldata.hash
      }
    });
    if (sequencerExist) {
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
      privateKey,
      token: toToken
    }
  }
  public async verifyXVMCrossToken(swapOrder: SwapOrder): Promise<string | undefined> {
    const logger = LoggerService.getLogger(swapOrder.chainId.toString());
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
    // expectValue = From Token Value
    const fromValue = new BigNumber(swapOrder.calldata.expectValue).dividedBy(new BigNumber(10).pow(fromDecimal));
    const currentPriceValue = new BigNumber(await getQuotationPrice(fromValue.toString(), fromToken.symbol, toToken.symbol));

    const expectToTokenValue = new BigNumber(swapOrder.calldata.crossTokenUserExpectValue || 0).dividedBy(new BigNumber(10).pow(destDecimal));
    const expectToTokenMinValue = expectToTokenValue.minus(expectToTokenValue.multipliedBy(swapOrder.calldata.slipPoint).div(10000))
    // const expectToTokenMaxValue = expectToTokenValue.minus(expectToTokenValue.multipliedBy(swapOrder.calldata.slipPoint).div(10000))

    console.log(`expectMinValue:${expectToTokenMinValue.toString()}, currentPriceValue:${currentPriceValue.toString()}`);
    if (currentPriceValue.lt(expectToTokenMinValue)) {
      console.log('No collection when the exchange rate is lower than the minimum');
      return undefined;
    }
    if (currentPriceValue.gte(expectToTokenMinValue)) {
      if (currentPriceValue.gte(expectToTokenValue)) {
        return expectToTokenValue.multipliedBy(new BigNumber(10).pow(toToken.decimals)).toFixed(0, BigNumber.ROUND_DOWN);
      }
      return currentPriceValue.multipliedBy(new BigNumber(10).pow(toToken.decimals)).toFixed(0, BigNumber.ROUND_DOWN);
    }
  }
  private getSenderPrivateKey(from: string) {
    const privateKey = process.env[from.toLocaleLowerCase()] || "";
    return privateKey;
  }
}
