import { chains } from 'orbiter-chaincore';
import { Factory } from "../account/factory";
import chainConfigs from '../config/chains.json';
import { expect } from 'chai';
import { ethers } from 'ethers';
import ZKSpaceAccount from '../account/zksAccount';
chains.fill(chainConfigs as any);
const privateKey = process.env["0x0043d60e87c5dd08c86c3123340705a1556c4719"] || "";
describe("ZKSpace Test", function () {
    
    const account = Factory.createMakerAccount<ZKSpaceAccount>("", privateKey, 512);
    it("GetBalance", async function () {
        this.timeout(1000 * 60);
        const balance = await account.getBalance(); 
        console.log(balance.toString());
        console.log('ETH Balance:', ethers.utils.formatEther(balance.toString()))
        expect(balance.gt(0)).true;
    });

    // it("Get DAI Balance", async function () {
    //     const balance = await account.getTokenBalance("0x5c221e77624690fff6dd741493d735a17716c26b"); 
    //     console.log('DAI Balance:', ethers.utils.formatEther(balance.toString()))
    //     expect(balance.gt(0)).true;
    // });

    it("Transfer", async function () {
        this.timeout(1000 * 60 * 5);
        const tx = await account.transferToken(0, "0x8a3214f28946a797088944396c476f014f88dd37", "10000000000000", {

        });
        expect(tx?.hash).not.empty;
        // const sendTx = await zkspaceTransfer();
        
    });

});