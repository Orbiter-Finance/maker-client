import path from 'path';

import Keyv from 'keyv';
import KeyvFile from 'keyv-file';
export default class Caching {
  public static caches: { [key: string]: CachingType } = {};
  public static getCache(key: string, options: any = {}): CachingType {
    if (Caching.caches[key]) {
      return Caching.caches[key];
    }
    const storeConfigs = Object.assign(
      {
        filename: path.join(process.cwd(),'runtime/cache', `${key}.json`), // the file path to store the data
        expiredCheckDelay: 24 * 3600 * 1000, // ms, check and remove expired data in each ms
        writeDelay: 100, // ms, batch write to disk in a specific duration, enhance write performance.
        encode: JSON.stringify, // serialize function
        decode: JSON.parse, // deserialize function
      },
      options
    );
    Caching.caches[key] = new Keyv({
      store: new KeyvFile(storeConfigs),
    });
    return Caching.caches[key];
  }
}
export type CachingType = Keyv;
