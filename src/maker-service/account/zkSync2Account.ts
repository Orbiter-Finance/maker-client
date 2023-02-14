import { BigNumber, ethers } from 'ethers';
import * as zksync from 'zksync-web3';

import { ERC20Abi } from '../abi';
import NonceManager from '../lib/nonce';
import { getNonceCacheStore } from '../utils/caching';
import OrbiterAccount from './orbiterAccount';

import { TransactionRequest, TransferResponse } from './IAccount';

export default class zkSyncAccount extends OrbiterAccount {
  protected wallet: zksync.Wallet;
  public provider: zksync.Provider;
  private nonceManager: NonceManager;
  constructor(protected internalId: number,
    protected privateKey: string) {
    super(internalId, privateKey);
    const ethProvider = ethers.getDefaultProvider('goerli');
    this.provider = new zksync.Provider(this.chainConfig.rpc[0]);
    this.wallet = new zksync.Wallet(privateKey, this.provider, ethProvider);
    this.nonceManager = new NonceManager(this.wallet.address, async () => {
      const nonce = await this.wallet.getNonce();
      return Number(nonce);
    }, {
      store: getNonceCacheStore(`${internalId}-${this.wallet.address}`)
    });
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
    };
  }
  public async transfer(
    to: string,
    value: string,
    transactionRequest: TransactionRequest = {}
  ): Promise<TransferResponse> {
    const { nonce, submit, rollback } = await this.nonceManager.getNextNonce();
    try {
      const gasPrice = await this.wallet.getGasPrice();
      // const nonce = await this.wallet.getNonce();
      const detail: ethers.providers.TransactionRequest = Object.assign(
        {
          to: to,
          from: this.wallet.address,
          value: BigNumber.from(value).toHexString(),
          nonce,
          // data: '0x00',
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
      this.logger.info('transfer response:', response);
      submit()
      return {
        hash: response.hash,
        from: response.from,
        to,
        value: ethers.BigNumber.from(value),
        nonce: response.nonce,
      };
    } catch (error:any) {
      this.logger.error(`rollback nonce:${error.message}`);
      rollback();
      throw error;
    }
  }
  public async getBalance(address?: string, token?: string): Promise<ethers.BigNumber> {
    if (token && token != this.chainConfig.nativeCurrency.address) {
      return  this.getTokenBalance(token, address);
    } else {
      return this.provider.getBalance(address || this.wallet.address);
    }
  }
  public getTokenBalance(token: string, to?: string): Promise<BigNumber> {
    const erc20 = new ethers.Contract(token, ERC20Abi, this.provider);
    return erc20.balanceOf(to || this.wallet.address);
  }
}
