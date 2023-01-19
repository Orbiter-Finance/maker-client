import { chains } from 'orbiter-chaincore/src/utils';
import { ethers } from 'ethers';

import { XVMAbi } from '../abi';
import config from '../config/config'
import EVMAccount from './evmAccount';
import { TransactionRequest, TransactionResponse } from './baseAccount';

export const RPC_NETWORK: { [key: string]: number } = {};
export default class XVMAccount extends EVMAccount {
  public contract: ethers.Contract;
  public contractAddress: string;
  constructor(
    protected internalId: number,
    protected override privateKey: string,
    // protected override rpc: string,
    // public readonly contractAddress: string,
  ) {
    const chainConfig = chains.getChainInfo(internalId);
    if (!chainConfig) {
      throw new Error('XVM Config Not Found');
    }
    super(internalId, privateKey, chainConfig.rpc[0]);
    this.contractAddress = chainConfig?.xvmList[0];
    this.contract = new ethers.Contract(this.contractAddress, XVMAbi, this.provider);
  }
  async swapOK(calldata: string[] | string, transactionRequest: TransactionRequest = {}): Promise<TransactionResponse | undefined> {
    // get chain config 
    this.logger.info("exec swapOK 1")
    const chainId = await await this.wallet.getChainId();
    this.logger.info("exec swapOK 2")
    const chainConfig = chains.getChainInfo(String(chainId));
    if (!chainConfig) {
      throw new Error('Swap chainConfig not found');
    }
    this.logger.info("exec swapOK 3")
    let txType = 0;
    if ((chainConfig['features'] || []).includes("EIP1559")) {
      txType = 2;
    }
    const gasLimit = ethers.BigNumber.from(config.xvmGas[Number(chainConfig.internalId)] || 0);
    this.logger.info("exec swapOK 4")
    if (typeof calldata === 'string') {
      this.logger.info("exec swapOK single ", { txType })
      const tx = await this.sendTransaction(this.contractAddress, Object.assign({
        data: calldata,
        gasLimit: gasLimit,
        type: txType,
      }, transactionRequest));
      // await tx.wait();
      return tx;
    } else if (Array.isArray(calldata)) {
      const ifa = new ethers.utils.Interface(XVMAbi);
      const data = ifa.encodeFunctionData('multicall', [calldata]);
      this.logger.info("exec swapOK Multiple ", { txType })
      const tx = await this.sendTransaction(this.contractAddress, Object.assign({
        data,
        gasLimit: gasLimit.mul(calldata.length),
        type: txType
      }, transactionRequest));
      this.logger.info("exec swapOK Multiple success", { tx })
      // await tx.wait();
      return tx;
    } else {
      this.logger.error('SwapOK Params error', { calldata, transactionRequest })
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
    return tx;
    // send 2
    // return await this.contract.connect(this.wallet).multicall(params, transactionRequest);
  }
}
