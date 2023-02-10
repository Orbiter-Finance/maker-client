import { chains } from 'orbiter-chaincore';
import { Factory } from "../account/factory";
import zkSyncAccount from '../account/zkSyncAccount';
import chainConfigs from '../config/chains.json';
import { expect } from 'chai';
import { ethers } from 'ethers';
chains.fill(chainConfigs as any);
const privateKey = process.env["0x0043d60e87c5dd08c86c3123340705a1556c4719"] || "";
describe("ZkSync Test", function () {
    
    const account = Factory.createMakerAccount<zkSyncAccount>("", privateKey, 33);
    it("GetBalance", async function () {
        const balance = await account.getBalance(); 
        console.log('ETH Balance:', ethers.utils.formatEther(balance.toString()))
        expect(balance.gt(0)).true;
    });

    it("Get DAI Balance", async function () {
        const balance = await account.getTokenBalance("0x5c221e77624690fff6dd741493d735a17716c26b"); 
        console.log('DAI Balance:', ethers.utils.formatEther(balance.toString()))
        expect(balance.gt(0)).true;
    });

    it("Transfer", async function () {
        this.timeout(1000 * 60 * 5);
        // const result1 = await getAmountFlag(1, '15129000000009002');
        // const result2 = await getAmountFlag(6, '9998001669');
        // console.log(result1, '==result1')
        // console.log(result2, '==result2')
        // const fromNonce = getAmountFlag(3, "9980000010000000");
        // console.log(fromNonce, '==fromNonce')
        const sendTx = await account.transferToken("0x0000000000000000000000000000000000000000", "0x8A3214F28946A797088944396c476f014F88Dd37", "9990000065000000", {
        });
        console.log(sendTx, '==sendTx');
        
    });

});