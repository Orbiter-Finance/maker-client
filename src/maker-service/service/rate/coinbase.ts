import Caching, { CachingType } from '../../utils/caching';
import { LoggerService } from '../../utils/logger';
import fetch from 'cross-fetch';
export default class CoinbaseService {
  private cache: CachingType = Caching.getCache('rate:usd');
  public async getRates(currency: string) {
    const url = process.env['NODE_ENV'] !== 'development' ? `https://api.coinbase.com/v2/exchange-rates?currency=${currency}` : `http://coinbase.okaynode.com/v2/exchange-rates?currency=${currency}`;
    const { data } = await fetch(
      url
    ).then((res:any) => res.json());
    return data;
  }
  public async refreshExchangeRate() {
    const { currency, rates } = await this.getRates('usd');
    for (const symbol in rates) {
      await this.cache.set(
        `${symbol}:${currency}`.toLocaleLowerCase(),
        {
          rate: 1 / rates[symbol],
          lastUpdated: Date.now(),
        },
        1000 * 60 * 5
      );
    }
  }

  public start() {
    const logger = LoggerService.getLogger("");
    setInterval(() => {
      this.refreshExchangeRate().catch(error => {
        logger.error('refreshExchangeRate error:', error);
      });
    }, 5000);
  }
}
