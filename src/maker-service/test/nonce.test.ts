import NonceManager from '../lib/nonce';

import { expect } from 'chai';
import KeyvFile from 'keyv-file';
import path from 'path';
describe("Nonce.test.ts", function () {
    const address = '0x8A3214F28946A797088944396c476f014F88Dd37';
    const nonceManager = new NonceManager(address, () => {
        return 300;
    }, {
        store: new KeyvFile({
            filename: path.join(process.cwd(), 'runtime', 'nonce', `${address}.json`), // the file path to store the data
            expiredCheckDelay: 24 * 3600 * 1000, // ms, check and remove expired data in each ms
            writeDelay: 100, // ms, batch write to disk in a specific duration, enhance write perfor
        })
    });
    it("create nonce manager", async function () {
        expect(nonceManager).not.empty;
    });
    it("get next nonce", async function () {
        this.timeout(1000 * 60 * 5);
        // for (let i = 0; i < 10; i++) {
        //     nonceManager.getNextNonce().then(({ nonce, done, rollback }) => {
        //         if (nonce === 305) {
        //             return rollback();
        //         }
        //         console.log(`send tx  nonce:`, nonce, '===rollback', rollback);
        //         console.log('--------------------------end')
        //         setTimeout(() => {
        //             done()
        //         }, 2000)
        //     })
        // }

        setInterval(() => {

        }, 1000)

        // const nextNonce = await nonceManager.getNextNonce();
        // console.log(nextNonce, '======nextNonce')
    });

});