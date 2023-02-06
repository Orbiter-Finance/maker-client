import { Mutex } from 'async-mutex';
import Keyv from 'keyv';

export default class NonceManager {
    private mutex = new Mutex();
    private store: Keyv;
    constructor(address: string, private readonly refreshNonceFun: Function, option: {
        initNonce?: number,
        store?: Keyv.Store<any>
    } = {}) {
        this.store = new Keyv({
            store: option.store,
            namespace: address
        });
        this.mutex.runExclusive(async () => {
            const refreshNonce = await this.refreshNonceFun();
            const nonce = await this.store.get("nonce") || 0;
            const initNonce = option.initNonce || 0;
            const lastNonce = Math.max(refreshNonce, nonce, initNonce);
            if(lastNonce!=nonce) {
                await this.store.set('nonce', lastNonce);
            }
        });
        this.autoUpdate();
    }
    public async autoUpdate() {
        await this.mutex.waitForUnlock();
        const lastUsage = await this.store.get("lastUsage");
        let nonce = await this.store.get("nonce");
        // console.log('autoUpdate nonce,', nonce);
        if (Date.now() - lastUsage > 1000 * 10) {
            const refreshNonce = await this.refreshNonceFun()
            if (refreshNonce > nonce) {
                nonce = refreshNonce;
                await this.store.set("nonce", refreshNonce);
            }
        }
        setTimeout(this.autoUpdate.bind(this), 1000);
    }
    public async getNextNonce(): Promise<{ nonce: number, submit: Function, rollback: Function }> {
        return new Promise(async (resolve, reject) => {
            try {
                const release = await this.mutex.acquire()
                try {
                    let nonce = await this.store.get('nonce');
                    await this.store.set("lastUsage", Date.now());
                    return resolve({
                        nonce: nonce,
                        submit: async () => {
                            await this.store.set("nonce", nonce + 1);
                            release();
                        },
                        rollback: async () => {
                            await this.store.set("nonce", nonce);
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