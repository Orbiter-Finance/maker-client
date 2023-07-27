import { Global, Injectable } from '@nestjs/common';
import { BigNumber } from 'bignumber.js';
import { JsonRpcProvider, ethers } from "ethers";
import abis from '../abi';
@Injectable()
export class ChainLinkService {
    private pairs: { [key: string]: string } = {
        'eth/usd': "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
        'dai/usd': "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9",
        'usdc/usd': "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
        'usdt/usd': "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
    }
    public async getPriceFeed(source: string, target: string) {
        const keyName = `${source}/${target}`;
        // TODO: cache
        // const caching = Caching.getCache('chainlink');
        // const result = await caching.get(keyName);
        // if (result) {
        //     return new BigNumber(result);
        // }
        if (source === target) {
            return new BigNumber(1);
        }
        const id = `${source}/${target}`.toLocaleLowerCase();
        const addr = this.pairs[id];
        if  (!addr) {
            console.error(`ChainLink Not found pairs ${source}=>${target}`);
            return new BigNumber(0);
        }
        const provider = new JsonRpcProvider("https://ethereum.publicnode.com");
        const priceFeed = new ethers.Contract(addr, abis['ChainLinkAggregatorV3'], provider);
        // We get the data from the last round of the contract 
        const roundData = await priceFeed.latestRoundData();
        // Determine how many decimals the price feed has (10**decimals)
        const decimals = Number(await priceFeed.decimals());
        // We convert the price to a number and return it
        const decimalsNum = Math.pow(10, decimals);
        const value = new BigNumber(String(roundData.answer)).dividedBy(decimalsNum);
        // caching.set(keyName, value.toString(), 1000 * 60 * 1);
        return value;
    }

    async getChainLinkPrice(
        value: string,
        fromCurrency: string,
        toCurrency = 'usd',
    ): Promise<BigNumber> {

        fromCurrency = fromCurrency.toLocaleLowerCase();
        toCurrency = toCurrency.toLocaleLowerCase();
        if (fromCurrency === toCurrency) {
            return new BigNumber(0);
        }
        const afterValue = new BigNumber(value);
        // 1
        let priceRate = await this.getPriceFeed(fromCurrency, toCurrency);
        if (priceRate.gt(0)) {
            return afterValue.multipliedBy(priceRate);
        }
        // 2
        priceRate = await this.getPriceFeed(toCurrency, fromCurrency);
        if (priceRate.gt(0)) {
            return afterValue.multipliedBy(new BigNumber(1).dividedBy(priceRate));
        }
        // 3
        const toUSDRate = await this.getPriceFeed(toCurrency, 'usd');
        const fromUSDRate = await this.getPriceFeed(fromCurrency, 'usd');
        if (toUSDRate.gt(0) && fromUSDRate.gt(0)) {
            const usdtRate = fromUSDRate.multipliedBy(new BigNumber(1).dividedBy(toUSDRate))
                .toString();
            return afterValue.multipliedBy(usdtRate);
        }
        return new BigNumber(0);
    }

}