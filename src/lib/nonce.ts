import { Mutex } from 'async-mutex';
import Keyv from 'keyv';
import KeyvFile from 'keyv-file';
import path from 'path';

export default class NonceManager {
    private mutex = new Mutex();
    private store: Keyv;
    constructor(private readonly key: string, private readonly refreshNonceFun: Function, option: {
        initNonce?: number,
        store?: Keyv.Store<any>
    } = {}) {
        if (!option.store) {
            option.store = new KeyvFile({
                filename: path.join(process.cwd(), 'runtime', 'nonce', `${key}.json`), // the file path to store the data
                expiredCheckDelay: 24 * 3600 * 1000, // ms, check and remove expired data in each ms
                writeDelay: 100, // ms, batch write to disk in a specific duration, enhance write perfor
            })
        }
        this.store = new Keyv({
            store: option.store,
            namespace: key
        });
        this.mutex.acquire()
            .then(async (release) => {
                // ...
                const refreshNonce = await this.refreshNonceFun();
                const nonce = await this.store.get("nonce") || 0;
                const initNonce = option.initNonce || 0;
                const maxNonce = Math.max(refreshNonce, nonce, initNonce);
                if (maxNonce != nonce)
                    await this.setNonce(maxNonce);
                release();
            });
        this.autoUpdate();
    }
    public async setNonce(nonce: number) {
        await this.store.set('nonce', nonce);
    }
    public async forceRefreshNonce() {
        const nonce = await this.refreshNonceFun();
        await this.setNonce(nonce);
    }
    public async autoUpdate() {
        const lastUsage = await this.store.get("lastUsage");
        let nonce = await this.store.get("nonce");
        // console.log('autoUpdate nonce,', nonce);
        if (Date.now() - lastUsage > 1000 * 60 * 5) {
            const refreshNonce = await this.refreshNonceFun()
            if (refreshNonce > nonce) {
                nonce = refreshNonce;
                await this.setNonce(refreshNonce);
            }
        }
        setTimeout(this.autoUpdate.bind(this), 1000 * 60);
    }
    public async getNextNonce(): Promise<{ nonce: number, submit: Function, rollback: Function }> {
        return new Promise(async (resolve, reject) => {
            try {
                const release = await this.mutex.acquire()
                try {
                    const networkNonce = await this.refreshNonceFun();
                    let nonce = await this.store.get('nonce');
                    if (networkNonce > nonce) {
                        nonce = networkNonce;
                        await this.store.set("nonce", nonce);
                    } else {
                        // check nonce 
                    }
                    return resolve({
                        nonce: nonce,
                        submit: async () => {
                            await this.store.set("lastUsage", Date.now());
                            await this.setNonce(nonce + 1);
                            release();
                        },
                        rollback: async () => {
                            await this.setNonce(nonce);
                            release();
                        }
                    })
                } catch (error) {
                    release();
                    reject(error);
                }
            } catch (error) {
                reject(error);
            }
        })

    }
}