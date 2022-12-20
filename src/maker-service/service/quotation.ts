import BigNumber from 'bignumber.js';

import Caching from '../utils/caching';

// import BinanceService from "./market/binance";
// import CoinGeckoService from "./market/coingecko";
import CoinbaseService from './rate/coinbase';

export async function getQuotationPrice(
  value: string,
  fromCurrency: string,
  toCurrency = 'usd'
): Promise<number> {
  fromCurrency = fromCurrency.toLocaleLowerCase();
  toCurrency = toCurrency.toLocaleLowerCase();
  const cache = Caching.getCache('rate:usd');
  const afterValue = new BigNumber(value);
  let result = await cache.get(`${fromCurrency}:${toCurrency}`);
  if (result && result.rate) {
    return afterValue.multipliedBy(Number(result.rate)).toNumber();
  }
  result = await cache.get(`${toCurrency}:${fromCurrency}`);
  if (result && result.rate) {
    return afterValue.multipliedBy(1 / Number(result.rate)).toNumber();
  }
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
export default class Quotation {
  async subscribe() {
    await new CoinbaseService().start();
    // await new CoinGeckoService().start();
    // await new BinanceService(this.ctx).subscribe();
  }
}
