import { Spot } from '@binance/connector';

import Context from '../../context';
import Caching from '../../utils/caching';
export default class BinanceService {
  constructor(private readonly ctx: Context) {}
  public subscribe() {
    {
      const wsHost = 'wss://stream.binance.com:9443';
      const client = new Spot('', '', {
        wsURL: wsHost, // If optional base URL is not provided, wsURL defaults to wss://stream.binance.com:9443
      });
      const cache = Caching.getCache('binance');
      const callbacks = {
        open: () => {
          this.ctx.logger.error(`binance service ws open: ${wsHost}`);
        },
        close: () => {
          this.ctx.logger.error(`binance service ws close`);
        },
        message: async (data) => {
          data = JSON.parse(data);
          const result = data['data'];
          await cache.set(result['s'], {
            id: result['s'],
            price: result['c'],
            timestamp: result['E'],
          });
        },
      };
      client.combinedStreams(['ethusdt@miniTicker'], callbacks);
    }
  }
}
