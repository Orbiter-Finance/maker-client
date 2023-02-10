import { chains } from 'orbiter-chaincore';
import { Factory } from "../account/factory";
import chainConfigs from '../config/chains.json';
import { expect } from 'chai';
import { ethers } from 'ethers';
import IMXAccount from '../account/imxAccount';
chains.fill(chainConfigs as any);
const privateKey = process.env["0x8a3214f28946a797088944396c476f014f88dd37"] || "";
describe("ZKSpace Test", function () {
    
    const account = Factory.createMakerAccount<IMXAccount>("", privateKey, 88);
    it("GetBalance", async function () {
        this.timeout(1000 * 60);
        const balance = await account.getBalance(); 
        console.log(balance.toString());
        console.log('ETH Balance:', ethers.utils.formatEther(balance.toString()))
        expect(balance.gt(0)).true;
    });

    it("Get USDC Balance", async function () {
        const balance = await account.getTokenBalance("0x07865c6e87b9f70255377e024ace6630c1eaa37f"); 
        console.log('DAI Balance:', ethers.utils.formatEther(balance.toString()))
        expect(balance.gt(0)).true;
    });
      it("Transfer ETH", async function () {
        this.timeout(1000 * 60 * 5);
        const tx = await account.transfer("0x0043d60e87c5dd08C86C3123340705a1556C4719", "10000000000000", {
        });
        expect(tx?.hash).not.empty;
    });
    it("Transfer Token", async function () {
        this.timeout(1000 * 60 * 5);
        const tx = await account.transferToken("0x07865c6e87b9f70255377e024ace6630c1eaa37f", "0x0043d60e87c5dd08C86C3123340705a1556C4719", "1", {
        });
        expect(tx?.hash).not.empty;
    });

});