import { chains } from 'orbiter-chaincore';
import { Factory } from "../account/factory";
import zkSyncAccount from '../account/zkSyncAccount';
import chainConfigs from '../config/chains.json';
import { expect } from 'chai';
import { ethers } from 'ethers';
import EVMAccount from '../account/evmAccount';
chains.fill(chainConfigs as any);
const privateKey = process.env["0x0043d60e87c5dd08c86c3123340705a1556c4719"] || "";
describe("ZkSync Test", function () {
    
    const account = Factory.createMakerAccount<EVMAccount>("", privateKey, 519);
    it("GetBalance", async function () {
        this.timeout(1000 * 60 * 5);
        const balance = await account.getBalance(); 
        console.log('ETH Balance:', ethers.utils.formatEther(balance.toString()))
        expect(balance.gt(0)).true;
    });


});