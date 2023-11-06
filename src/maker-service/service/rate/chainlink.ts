import { BigNumber } from 'bignumber.js';
import { ethers } from "ethers";
import Caching from '../../utils/caching';
import { chains } from 'orbiter-chaincore';
export default class ChainLink {
    private pairs: { [key: string]: string } = {
        'eth/usd': "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
        'dai/usd': "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9",
        'usdc/usd': "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
        'usdt/usd': "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
    }
    private aggregatorV3InterfaceABI = [
        {
            inputs: [],
            name: 'decimals',
            outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
            stateMutability: 'view',
            type: 'function'
        },
        {
            inputs: [],
            name: 'description',
            outputs: [{ internalType: 'string', name: '', type: 'string' }],
            stateMutability: 'view',
            type: 'function'
        },
        {
            inputs: [{ internalType: 'uint80', name: '_roundId', type: 'uint80' }],
            name: 'getRoundData',
            outputs: [
                { internalType: 'uint80', name: 'roundId', type: 'uint80' },
                { internalType: 'int256', name: 'answer', type: 'int256' },
                { internalType: 'uint256', name: 'startedAt', type: 'uint256' },
                { internalType: 'uint256', name: 'updatedAt', type: 'uint256' },
                { internalType: 'uint80', name: 'answeredInRound', type: 'uint80' }
            ],
            stateMutability: 'view',
            type: 'function'
        },
        {
            inputs: [],
            name: 'latestRoundData',
            outputs: [
                { internalType: 'uint80', name: 'roundId', type: 'uint80' },
                { internalType: 'int256', name: 'answer', type: 'int256' },
                { internalType: 'uint256', name: 'startedAt', type: 'uint256' },
                { internalType: 'uint256', name: 'updatedAt', type: 'uint256' },
                { internalType: 'uint80', name: 'answeredInRound', type: 'uint80' }
            ],
            stateMutability: 'view',
            type: 'function'
        },
        {
            inputs: [],
            name: 'version',
            outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
            stateMutability: 'view',
            type: 'function'
        }
    ];
    constructor() {
    }
    public async getPriceFeed(source: string, target: string) {
        const keyName = `${source}/${target}`;
        const caching = Caching.getCache('chainlink');
        const result = await caching.get(keyName);
        if (result) {
            return new BigNumber(result);
        }
        if (source === target) {
            return new BigNumber(1);
        }
        const id = `${source}/${target}`.toLocaleLowerCase();
        const addr = this.pairs[id];
        if  (!addr) {
            console.log(`ChainLink Not found pairs ${source}=>${target}`);
            return new BigNumber(0);
        }
        const chainInfo = await chains.getChainInfo(1);
        if  (!chainInfo) {
            throw new Error('chainlink use mainnet rpc chainInfo not found');
        }
        const provider = new ethers.providers.JsonRpcProvider(chainInfo.rpc[0]);
        const priceFeed = new ethers.Contract(addr, this.aggregatorV3InterfaceABI, provider);
        // We get the data from the last round of the contract 
        const roundData = await priceFeed.latestRoundData();
        // Determine how many decimals the price feed has (10**decimals)
        const decimals = await priceFeed.decimals();
        // We convert the price to a number and return it
        const value = new BigNumber((roundData.answer.toString() / Math.pow(10, decimals)));
        caching.set(keyName, value.toString(), 1000 * 60 * 1);
        return value;
    }

}