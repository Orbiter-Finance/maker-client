import { BigNumber, ethers } from 'ethers';
import { chains } from 'orbiter-chaincore';
import { IChainConfig } from 'orbiter-chaincore/src/types';
import * as zksync from 'zksync-web3';

import { ERC20Abi } from '../abi';

import BaseAccount, { TransactionRequest, TransactionResponse, TransferResponse } from './baseAccount';

export const RPC_NETWORK: { [key: string]: number } = {};
export default class zkSyncAccount extends BaseAccount {
  protected wallet: zksync.Wallet;
  public chainConfig!: IChainConfig;
  public provider: zksync.Provider;
  constructor(protected internalId: number,
    protected privateKey: string, protected rpc: string) {
    super(internalId, privateKey);
    const chainConfig = chains.getChainInfo(internalId);
    if (!chainConfig) {
      throw new Error(`${internalId} Chain Config not found`);
    }
    this.chainConfig = chainConfig;

    const ethProvider = ethers.getDefaultProvider('goerli');
    this.provider = new zksync.Provider(rpc);
    this.wallet = new zksync.Wallet(privateKey, this.provider, ethProvider);
  }
  async transferToken(
    token: string,
    to: string,
    value: string,
    transactionRequest: TransactionRequest = {}
  ): Promise<TransferResponse> {
    const ifa = new ethers.utils.Interface(ERC20Abi);
    const data = ifa.encodeFunctionData('transfer', [to, value]);
    const params = Object.assign(
      {
        data,
        type: 0,
      },
      transactionRequest
    );
    const response = await this.transfer(token, '0', params);
    return {
      token,
      hash: response.hash,
      from: response.from,
      to,
      value: ethers.BigNumber.from(value),
      nonce: response.nonce,
      internalId: Number(this.chainConfig?.internalId)
    };
  }
  public async transfer(
    to: string,
    value: string,
    transactionRequest: TransactionRequest = {}
  ): Promise<TransferResponse> {
    const gasPrice = await this.wallet.getGasPrice();
    const nonce = await this.wallet.getNonce();
    const detail: ethers.providers.TransactionRequest = Object.assign(
      {
        to: to,
        from: this.wallet.address,
        value: BigNumber.from(value).toHexString(),
        nonce,
        data: '0x00',
        chainId: await this.wallet.getChainId(),
      },
      transactionRequest
    );
    if (detail.type == 2) {
      detail.maxFeePerGas = detail.maxFeePerGas || gasPrice;
      detail.maxPriorityFeePerGas =
        detail.maxPriorityFeePerGas || BigNumber.from(0);
    } else {
      detail.gasPrice = gasPrice;
    }
    detail.gasLimit =
      detail.gasLimit || (await this.wallet.provider.estimateGas(detail));
    const response = await this.wallet.sendTransaction(detail);
    return {
      hash: response.hash,
      from: response.from,
      to,
      value: ethers.BigNumber.from(value),
      nonce: response.nonce,
      internalId: Number(this.chainConfig?.internalId)
    };
  }
  public getBalance(to?: string): Promise<BigNumber> {
    return this.provider.getBalance(to || this.wallet.address);
  }
  public getTokenBalance(token: string, to?: string): Promise<BigNumber> {
    const erc20 = new ethers.Contract(token, ERC20Abi, this.provider);
    return erc20.balanceOf(to || this.wallet.address);
  }
}
