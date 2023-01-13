import { BigNumber, ethers } from 'ethers';
import * as zksync from 'zksync-web3';

import { ERC20Abi } from '../abi';

import BaseAccount from './baseAccount';

export const RPC_NETWORK: { [key: string]: number } = {};
export default class zkSyncAccount extends BaseAccount {
  protected wallet: zksync.Wallet;
  public provider: zksync.Provider;
  constructor(protected internalId: number,
    protected privateKey: string, protected rpc: string) {
    super(internalId, privateKey);
    const ethProvider = ethers.getDefaultProvider('goerli');
    this.provider = new zksync.Provider(rpc);
    this.wallet = new zksync.Wallet(privateKey, this.provider, ethProvider);
  }
  async transferToken(
    token: string,
    to: string,
    value: string,
    transactionRequest: ethers.providers.TransactionRequest = {}
  ) {
    const ifa = new ethers.utils.Interface(ERC20Abi);
    const data = ifa.encodeFunctionData('transfer', [to, value]);
    const params = Object.assign(
      {
        data,
        type: 2,
      },
      transactionRequest
    );
    const response = await this.transfer(token, '0', params);
    return response;
  }
  public async transfer(
    to: string,
    value: string,
    transactionRequest: ethers.providers.TransactionRequest = {}
  ) {
    const gasPrice = await this.wallet.getGasPrice();
    const nonce = await this.wallet.getNonce();
    const detail: ethers.providers.TransactionRequest = Object.assign(
      {
        to: to,
        from: this.wallet.address,
        value: BigNumber.from(value).toHexString(),
        nonce,
        data: '0x',
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
    const result = await this.wallet.sendTransaction(detail);
    return result;
  }
  public getBalance(to?: string): Promise<BigNumber> {
    return this.provider.getBalance(to || this.wallet.address);
  }
  public getTokenBalance(token: string, to?: string): Promise<BigNumber> {
    const erc20 = new ethers.Contract(token, ERC20Abi, this.provider);
    return erc20.balanceOf(to || this.wallet.address);
  }
}
