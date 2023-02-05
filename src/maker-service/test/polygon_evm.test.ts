import { chains } from 'orbiter-chaincore';
import EVMAccount from "../account/evmAccount";
import { Factory } from "../account/factory";
import chainConfigs from '../config/chains.json';
chains.fill(chainConfigs as any);
describe("Polygon ZKEVM", function () {

    it("GetBalance", async function () {
        this.timeout(1000 * 60);
        const account = Factory.createMakerAccount<EVMAccount>("", "XXXXX", 517);
        const balance = await account.getBalance(); 
        console.log('balance', balance);
    });

});