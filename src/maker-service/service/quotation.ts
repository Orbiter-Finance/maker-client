import BigNumber from 'bignumber.js';
import Caching from '../utils/caching';
import ChainLink from './rate/chainlink';
import CoinbaseService from './rate/coinbase';

export async function getQuotationPrice(
  value: string,
  fromCurrency: string,
  toCurrency = 'usd'
): Promise<number> {
  fromCurrency = fromCurrency.toLocaleLowerCase();
  toCurrency = toCurrency.toLocaleLowerCase();
  const afterValue = new BigNumber(value);
  const cache = await Caching.getCache(`rate:usd`);
  // 1
  let result = await cache.get(`${fromCurrency}:${toCurrency}`);
  if (result && result.rate) {
    return afterValue.multipliedBy(Number(result.rate)).toNumber();
  }
  // 2
  result = await cache.get(`${toCurrency}:${fromCurrency}`);
  if (result && result.rate) {
    return afterValue.multipliedBy(1 / Number(result.rate)).toNumber();
  }
  // 3
  const toUSDRate = await cache.get(`${toCurrency}:usd`);
  const fromUSDRate = await cache.get(`${fromCurrency}:usd`);
  if (toUSDRate && fromUSDRate) {
    const usdtRate = new BigNumber(fromUSDRate.rate)
      .multipliedBy(1 / Number(toUSDRate.rate))
      .toString();
    return afterValue.multipliedBy(usdtRate).toNumber();
  }

  return 0;
}
export async function getChainLinkPrice(
  value: string,
  fromCurrency: string,
  toCurrency = 'usd',
): Promise<BigNumber> {

  fromCurrency = fromCurrency.toLocaleLowerCase();
  toCurrency = toCurrency.toLocaleLowerCase();
  if (fromCurrency === toCurrency) {
    return new BigNumber(0);
  }
  const afterValue = new BigNumber(value);
  const chainLink = new ChainLink();
  // 1
  let priceRate = await chainLink.getPriceFeed(fromCurrency, toCurrency);
  if (priceRate.gt(0)) {
    return afterValue.multipliedBy(priceRate);
  }
  // 2
  priceRate = await chainLink.getPriceFeed(toCurrency, fromCurrency);
  if (priceRate.gt(0)) {
    return afterValue.multipliedBy(new BigNumber(1).dividedBy(priceRate));
  }
  // 3
  const toUSDRate = await chainLink.getPriceFeed(toCurrency, 'usd');
  const fromUSDRate = await chainLink.getPriceFeed(fromCurrency, 'usd');
  if (toUSDRate.gt(0) && fromUSDRate.gt(0)) {
    const usdtRate = fromUSDRate.multipliedBy(new BigNumber(1).dividedBy(toUSDRate))
      .toString();
    return afterValue.multipliedBy(usdtRate);
  }
  return new BigNumber(0);
}

export default class Quotation {
  async subscribe() {
    await new CoinbaseService().start();
    // await new CoinGeckoService().start();
    // await new BinanceService(this.ctx).subscribe();
  }
}
