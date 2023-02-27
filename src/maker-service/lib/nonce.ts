import { Mutex } from 'async-mutex';
import Keyv from 'keyv';

export default class NonceManager {
    private mutex = new Mutex();
    private store: Keyv;
    constructor(key: string, private readonly refreshNonceFun: Function, option: {
        initNonce?: number,
        store?: Keyv.Store<any>
    } = {}) {
        this.store = new Keyv({
            store: option.store,
            namespace: key
        });
        this.mutex.runExclusive(async () => {
            const refreshNonce = await this.refreshNonceFun();
            const nonce = await this.store.get("nonce") || 0;
            const initNonce = option.initNonce || 0;
            const lastNonce = Math.max(refreshNonce, nonce, initNonce);
            if (lastNonce != nonce) {
                await this.store.set('nonce', lastNonce);
            }
        });
        this.autoUpdate();
    }
    public async setNonce(nonce: number) {
        await this.store.set('nonce', nonce);
    }
    public async autoUpdate() {
        await this.mutex.waitForUnlock();
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