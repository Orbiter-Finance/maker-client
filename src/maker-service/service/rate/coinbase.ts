import Caching, { CachingType } from '../../utils/caching';
export default class CoinbaseService {
  private cache: CachingType = Caching.getCache('rate:usd');
  public async getRates(currency: string) {
    const url = process.env['NODE_ENV'] !== 'development' ? `https://api.coinbase.com/v2/exchange-rates?currency=${currency}` : `http://coinbase.okaynode.com/v2/exchange-rates?currency=${currency}`;
    const { data } = await fetch(
      url
    ).then((res) => res.json());
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

  public async start() {
    setInterval(() => {
      void this.refreshExchangeRate();
    }, 5000);
  }
}
