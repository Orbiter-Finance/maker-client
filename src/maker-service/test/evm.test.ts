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
    
    const account = Factory.createMakerAccount<OrbiterXAccount>("", privateKey, 22);
    it("GetBalance", async function () {
        const balance = await account.getBalance(); 
        console.log('ETH Balance:', ethers.utils.formatEther(balance.toString()))
        expect(balance.gt(0)).true;
    });
    it("SwapOK", async function () {
        this.timeout(1000 * 60 * 5);
       
        const  data = account.swapOkEncodeABI("0x940dbcb04cd7cd92054412d1787dd0865a4c272b85edfefad8b6fb0a087fa7fd", "0x6b56404816A1CB8ab8E8863222d8C1666De942d5", "0x8A3214F28946A797088944396c476f014F88Dd37", "39994");
        const sendTx = await account.swapOK(data)
        console.log('sendTx:', sendTx)

        //  const res = RLP.decode('0xf845b84230783934306462636230346364376364393230353434313264313738376464303836356134633237326238356564666566616438623666623061303837666137666431');
        //  const tradeId = Buffer.from(res[0]).toString();
        //  const opId = Buffer.from(res[1]).toString();
        // console.log('tradeId:', tradeId);
        // console.log(opId, '==opId');
        // console.log(Number(opId), '==opId2');
        
        // expect(tradeId).eq('0xff9c0f8bc8c6caddac7f420d8f7fbcff05d93cc20b095536924443ea973c7943');
        // expect(opId).eq(1);
    });

});