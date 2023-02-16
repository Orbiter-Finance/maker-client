import { chains } from 'orbiter-chaincore';
import { Factory } from "../account/factory";
import OrbiterXAccount from '../account/orbiterXAccount'
import chainConfigs from '../config/chains.json';
import { expect } from 'chai';
import { ethers } from 'ethers';
import * as RLP from 'rlp'
chains.fill(chainConfigs as any);
const privateKey = process.env["0x0043d60e87c5dd08c86c3123340705a1556c4719"] || "";
describe("OrbiterX Test", function () {
    
    const account = Factory.createMakerAccount<OrbiterXAccount>("", privateKey, 5);
    it("GetBalance", async function () {
        const balance = await account.getBalance(); 
        console.log('ETH Balance:', ethers.utils.formatEther(balance.toString()))
        expect(balance.gt(0)).true;
    });

    it("SwapOK", async function () {
        this.timeout(1000 * 60 * 5);
        const res = RLP.decode('0xe2a04909c9f132df8ca4d9efeb59b725c5bf4d5795c141d92ad80e4bb5518c61b05b01');
        console.log(res[0].toString('hex'), '===res')
        const tradeId = `0x${res[0].toString('hex')}`;
        const opId = Number(res[1]);
        console.log('tradeId:', tradeId);
        console.log(opId, '==opId');
        // expect(tradeId).eq('0xff9c0f8bc8c6caddac7f420d8f7fbcff05d93cc20b095536924443ea973c7943');
        // expect(opId).eq(1);
        // const  data = account.swapOkEncodeABI("ff9c0f8bc8c6caddac7f420d8f7fbcff05d93cc20b095536924443ea973c7943", "0x6b56404816A1CB8ab8E8863222d8C1666De942d5", "0x8A3214F28946A797088944396c476f014F88Dd37", "39994");
        // const sendTx = await account.swapOK(data)
        // console.log('sendTx:', sendTx)
    });

});