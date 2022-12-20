import CoinGecko from 'coingecko-api';

import Caching, { CachingType } from '../../utils/caching';
export default class CoinGeckoService {
  private client: CoinGecko = new CoinGecko();
  private cache: CachingType = Caching.getCache('coinGecko');
  public async refreshMarkets() {
    const vsCurrency = 'usd';
    const { success, data: coins } = await this.client.coins.markets({
      ids: 'bitcoin,tether,ethereum,usd-coin',
      vs_currency: vsCurrency,
    });
    if (success) {
      for (const coin of coins) {
        await this.cache.set(
          `${coin.symbol}:${vsCurrency}`.toLocaleLowerCase(),
          {
            rate: coin.current_price,
            lastUpdated: coin.last_updated,
          },
          1000 * 60 * 10
        );
      }
    }
  }
  public async refreshExchangeRate() {
    const { success, data } = await this.client.exchangeRates.all();
    if (success) {
      const rates = data['rates'];
      for (const symbol in rates) {
        const row = rates[symbol];
        await this.cache.set(
          `${symbol}:btc`.toLocaleLowerCase(),
          {
            rate: row.value,
            lastUpdated: Date.now(),
          },
          1000 * 60 * 10
        );
      }
    }
  }

  public async start() {
    const { code, success } = await this.client.ping();
    if (code === 200 && success === true) {
      // await this.refreshExchangeRate();
      await this.refreshMarkets();
      // ref
      setInterval(() => {
        if (Date.now() % 10 === 0) {
          void this.refreshMarkets();
          console.log('refreshMarkets----', new Date());
        }
        if (Date.now() % 60 === 0) {
          void this.refreshExchangeRate();
          console.log('refreshExchangeRate-----', new Date());
        }
      }, 5000);
    }
  }
}
