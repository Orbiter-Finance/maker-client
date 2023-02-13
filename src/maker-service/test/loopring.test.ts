import { chains } from 'orbiter-chaincore';
import { Factory } from "../account/factory";
import chainConfigs from '../config/chains.json';
import { expect } from 'chai';
import { ethers } from 'ethers';
import LoopringAccount from '../account/loopringAccount';
chains.fill(chainConfigs as any);
const privateKey = process.env["0x0043d60e87c5dd08c86c3123340705a1556c4719"] || "";
describe("Loopring Test", function () {
    
    const account = Factory.createMakerAccount<LoopringAccount>("", privateKey, 99);
    it("GetBalance", async function () {
        this.timeout(1000 * 60 * 5);
        const balance = await account.getBalance(); 
        console.log('ETH Balance:', ethers.utils.formatEther(balance.toString()))
        expect(balance.gt(0)).true;
    });

    it("GetToken Balance", async function () {
        this.timeout(1000 * 60 * 5);
        const balance = await account.getTokenBalance("0xd4e71c4bb48850f5971ce40aa428b09f242d3e8a")
        console.log('Token Balance:', ethers.utils.formatUnits(balance.toString(),6 ).toString())
        expect(balance.gt(0)).true;
    });

    it("Transfer", async function () {
        this.timeout(1000 * 60 * 5);
        const tx = await account.transferToken("0x0000000000000000000000000000000000000000", "0x8a3214f28946a797088944396c476f014f88dd37", "10000000000000", {

        });
        expect(tx?.hash).not.empty;
    });

});