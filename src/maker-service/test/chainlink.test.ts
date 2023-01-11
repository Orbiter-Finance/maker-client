
import { expect } from 'chai';
import ChainLink from "../service/rate/chainlink";
describe("ChainLink", function () {
  it("priceFeed", async function () {
    const chainlink = new ChainLink();
    const result = await chainlink.getPriceFeed("eth", "usd");
    expect(result.toNumber()).gte(0);
  });

});