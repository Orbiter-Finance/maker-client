import { BigNumber } from 'bignumber.js';
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

    transactionRequest.from = this.wallet.address;
    transactionRequest.to = chainConfig.xvmList[0];

    this.logger.info("exec swapOK 4")
    transactionRequest.type = txType;
    if (typeof calldata === 'string') {
      transactionRequest.data = calldata;
      this.logger.info("exec swapOK single ", { txType })
    } else if (Array.isArray(calldata)) {
      const ifa = new ethers.utils.Interface(OrbiterXAbi);
      const data = ifa.encodeFunctionData('multicall', [calldata]);
      this.logger.info("exec swapOK Multiple ", { txType })
      transactionRequest.data = data;
    }
    const chainCustomConfig = config[this.chainConfig.internalId] || {};
    if (!transactionRequest.gasLimit) {
      try {
        const gasLimit = await this.provider.estimateGas({
          from: transactionRequest.from,
          to: transactionRequest.to,
          data: transactionRequest.data,
          value: transactionRequest.value
        });
        transactionRequest.gasLimit = gasLimit;
      } catch (error) {
        this.logger.error(`OrbiterX SwapAnswer estimateGas error`, error);
        let gasLimit  = ethers.BigNumber.from(100000);
        if (chainCustomConfig.swapAnswerGasLimit) {
          const addGas = new BigNumber(chainCustomConfig.swapAnswerGasLimit).multipliedBy(Array.isArray(calldata) ? calldata.length : 1)
          gasLimit = ethers.BigNumber.from(addGas.toFixed(0));
        };
        transactionRequest.gasLimit = gasLimit;
      }
    }
    // gasLimitMultiple
    if (chainCustomConfig.gasLimitMultiple) {
      const newGasLimit = new BigNumber(transactionRequest.gasLimit.toString()).multipliedBy(chainCustomConfig.gasLimitMultiple)
      transactionRequest.gasLimit = ethers.BigNumber.from(newGasLimit.toFixed(0));
    }

    this.logger.info("exec swapOK ready send ", { transactionRequest })
    const tx = await this.sendTransaction(this.contractAddress, transactionRequest);
    this.logger.info("exec swapOK  send after", { transactionRequest })
    return tx;
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
