import { chains } from 'orbiter-chaincore';
process.env.STARKNET_PROVIDER_BASE_URL = "https://alpha4.starknet.io";

import StarknetAccount from '../account/starknetAccount';
chains.fill(require('../config/chains.json'));
const privateKey = process.env["privateKey"] || "";
const address = "";
const account = new StarknetAccount(44, privateKey, address);
// protected static getNetworkFromName(name: NetworkName): "https://alpha-mainnet.starknet.io" | "https://alpha4.starknet.io";

async function init() {
    const result = await account.getTokenBalance("0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7");
    console.log(result.toString(), '===result');
    const tx = await account.transferToken("0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7", "0x050e5ba067562e87b47d87542159e16a627e85b00de331a53b471cee1a4e5a4f", "1000000000000");
    console.log(tx, 'response');
    
}
init().then(result => {
    console.log(result, '==init');
}).catch(error=> {
    console.log(error);
})