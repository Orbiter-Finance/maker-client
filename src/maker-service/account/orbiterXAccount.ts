import { chains } from 'orbiter-chaincore/src/utils';
import { ethers } from 'ethers';
import { OrbiterXAbi } from '../abi';
import config from '../config/config'
import EVMAccount from './evmAccount';
import { TransactionRequest, TransactionResponse } from './IAccount';
import * as RLP from 'rlp'
export default class OrbiterXAccount extends EVMAccount {
  public contract: ethers.Contract;
  public contractAddress: string;
  constructor(
    protected internalId: number,
    protected override privateKey: string
  ) {
    super(internalId, privateKey);
    if (this.chainConfig.xvmList.length <= 0) {
      throw new Error('XVM Config Not Found');
    }
    this.contractAddress = this.chainConfig?.xvmList[0];
    this.contract = new ethers.Contract(this.contractAddress, OrbiterXAbi, this.provider);
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
    const chainCustomConfig = config[chainConfig.internalId];
    let gasLimit = ethers.BigNumber.from(0);
    if (chainCustomConfig && chainCustomConfig.swapAnswerGas) {
      gasLimit = ethers.BigNumber.from(chainCustomConfig.swapAnswerGas);
    }
    this.logger.info("exec swapOK 4")
    if (typeof calldata === 'string') {
      this.logger.info("exec swapOK single ", { txType })
      const tx = await this.sendTransaction(this.contractAddress, Object.assign({
        data: calldata,
        gasLimit: gasLimit,
        type: txType,
      }, transactionRequest));
      return tx;
    } else if (Array.isArray(calldata)) {
      const ifa = new ethers.utils.Interface(OrbiterXAbi);
      const data = ifa.encodeFunctionData('multicall', [calldata]);
      this.logger.info("exec swapOK Multiple ", { txType })
      const tx = await this.sendTransaction(this.contractAddress, Object.assign({
        data,
        gasLimit: gasLimit.mul(calldata.length),
        type: txType
      }, transactionRequest));
      this.logger.info("exec swapOK Multiple success", { tx })
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
    const ifa = new ethers.utils.Interface(OrbiterXAbi);
    const bufferList = [Buffer.from(tradeId), '1']
    const encoded = RLP.encode(bufferList) // 
    const data = ifa.encodeFunctionData('swapAnswer', [
      toAddress,
      token,
      toValue,
      encoded
    ]);
    return data;
  }
  async multicall(params: string[], transactionRequest: ethers.providers.TransactionRequest = {}) {
    // send 1
    const ifa = new ethers.utils.Interface(OrbiterXAbi);
    const data = ifa.encodeFunctionData('multicall', [params]);
    transactionRequest.data = data;
    const tx = await this.sendTransaction(this.contractAddress, transactionRequest);
    return tx;
  }
}
