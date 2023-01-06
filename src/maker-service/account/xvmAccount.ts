import { chains } from 'orbiter-chaincore/src/utils';
import { ethers } from 'ethers';

import { XVMAbi } from '../abi';
import config from '../config/config'
import EVMAccount from './evmAccount';
import { TransactionRequest, TransactionResponse } from './baseAccount';

export const RPC_NETWORK: { [key: string]: number } = {};
export default class XVMAccount extends EVMAccount {
  public contract: ethers.Contract;
  constructor(
    protected override privateKey: string,
    protected override rpc: string,
    public readonly contractAddress: string,
  ) {
    super(privateKey, rpc);
    this.contract = new ethers.Contract(this.contractAddress, XVMAbi, this.provider);
  }
  async swapOK(calldata: string[] | string, transactionRequest: TransactionRequest = {}): Promise<TransactionResponse> {
    // get chain config 
    const chainId = await await this.wallet.getChainId();
    const chainConfig = chains.getChainInfo(String(chainId));
    if (!chainConfig) {
      throw new Error('Swap chainConfig not found');
    }
    let txType = 0;
    if ((chainConfig['features'] || []).includes("EIP1559")) {
      txType = 2;
    }
    const gasLimit = config.xvmGas[Number(chainConfig.internalId)] || 0;
    if (typeof calldata === 'string') {
      const tx = await this.sendTransaction(this.contractAddress, Object.assign({
        data: calldata,
        gasLimit: ethers.BigNumber.from(gasLimit),
        type: txType,
      }, transactionRequest));
      // await tx.wait();
      return tx;
    } else {
      const ifa = new ethers.utils.Interface(XVMAbi);
      const data = ifa.encodeFunctionData('multicall', [calldata]);
      const tx = await this.sendTransaction(this.contractAddress, Object.assign({
        data,
        gasLimit: ethers.BigNumber.from(gasLimit).mul(calldata.length),
        type: txType
      }, transactionRequest));
      // await tx.wait();
      return tx;
    }
  }
  swapOkEncodeABI(
    tradeId: string,
    token: string,
    toAddress: string,
    toValue: string
  ): string {
    const ifa = new ethers.utils.Interface(XVMAbi);
    const data = ifa.encodeFunctionData('swapOK', [
      tradeId,
      token,
      toAddress,
      toValue,
    ]);
    return data;
  }
  swapFailEncodeABI(
    tradeId: string,
    token: string,
    toAddress: string,
    toValue: string
  ): string {
    const ifa = new ethers.utils.Interface(XVMAbi);
    const data = ifa.encodeFunctionData('swapFail', [
      tradeId,
      token,
      toAddress,
      toValue,
    ]);
    return data;
  }
  async swapFail(
    tradeId: string,
    token: string,
    toAddress: string,
    toValue: string
  ) {
    const ifa = new ethers.utils.Interface(XVMAbi);
    const data = ifa.encodeFunctionData('swapFail', [
      tradeId,
      token,
      toAddress,
      toValue,
    ]);
    const result = await this.sendTransaction(this.contractAddress, {
      value: toValue,
      data,
      type: 2,
    });
    return result;
  }
  async multicall(params: string[], transactionRequest: ethers.providers.TransactionRequest = {}) {
    // send 1
    const ifa = new ethers.utils.Interface(XVMAbi);
    const data = ifa.encodeFunctionData('multicall', [params]);
    transactionRequest.data = data;
    const tx = await this.sendTransaction(this.contractAddress, transactionRequest);
    // await tx.wait();
    return tx;
    // send 2
    // return await this.contract.connect(this.wallet).multicall(params, transactionRequest);
  }
}
