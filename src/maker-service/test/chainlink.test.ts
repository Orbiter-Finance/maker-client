
import { getChainLinkPrice } from '../service/quotation';
import { expect } from 'chai';
import ChainLink from "../service/rate/chainlink";
describe("ChainLink", function () {
  it("priceFeed", async function () {
    const chainlink = new ChainLink();
    const result = await chainlink.getPriceFeed("eth", "usd");
    expect(result.toNumber()).gte(0);
  });
  it("getChainLinkPrice", async function () {
    this.timeout(1000 * 60);
    const eth2usd = await getChainLinkPrice('1', "eth", "usd");
    const usd2eth = await getChainLinkPrice(eth2usd.toString(), "usd", "eth");
    expect(usd2eth.toNumber()).eq(1);

    const eth2usdc = await getChainLinkPrice('1', "eth", "usdc");
    const usdc2eth = await getChainLinkPrice(eth2usdc.toString(), "usdc", "eth");
    console.log(eth2usdc.toString(), '==', usdc2eth.toString() );
    expect(usdc2eth.toNumber()).eq(1);

    const eth2usdt = await getChainLinkPrice('1', "eth", "usdt");
    const usdt2eth = await getChainLinkPrice(eth2usdt.toString(), "usdt", "eth");
    expect(usdt2eth.toNumber()).eq(1);

    const dai2eth = await getChainLinkPrice('100', "dai", "eth");
    const eth2dai = await getChainLinkPrice(dai2eth.toString(), "eth", "dai");
    expect(eth2dai.toNumber()).eq(100);

  });

});