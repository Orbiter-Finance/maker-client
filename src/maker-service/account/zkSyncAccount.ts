import { ethers } from 'ethers';
import * as zksync from 'zksync';

import BaseAccount, { TransactionResponse } from './baseAccount';
export const RPC_NETWORK: { [key: string]: number } = {};
export default class zkSyncAccount extends BaseAccount {
  public l1Wallet: ethers.Wallet;
  
  constructor(
    protected privateKey: string,
    protected readonly zkSyncNetwork: zksync.types.Network
  ) {
    super(privateKey);
    let l1Provider;
    if (zkSyncNetwork === 'mainnet') {
      l1Provider = ethers.providers.getDefaultProvider('mainnet');
    } else if (zkSyncNetwork === 'goerli') {
      l1Provider = ethers.providers.getDefaultProvider('goerli');
    }
    this.l1Wallet = new ethers.Wallet(privateKey).connect(l1Provider);
  }
  public transfer(
    to: string,
    value: string,
    transactionRequest?: ethers.providers.TransactionRequest
  ): Promise<ethers.providers.TransactionResponse> {
    throw new Error('Method not implemented.');
  }
  public getBalance(to: string): Promise<ethers.BigNumber> {
    throw new Error('Method not implemented.');
  }
  public getTokenBalance(token: string, to: string): Promise<ethers.BigNumber> {
    throw new Error('Method not implemented.');
  }
  public async transferToken(
    token: string,
    to: string,
    value: string,
    transactionRequest?: ethers.providers.TransactionRequest
  ): Promise<TransactionResponse> {
    const syncProvider = await zksync.getDefaultProvider(this.zkSyncNetwork);
    const syncWallet = await zksync.Wallet.fromEthSigner(
      this.l1Wallet,
      syncProvider
    );
    const amount = zksync.utils.closestPackableTransactionAmount(value);
    const response = await syncWallet.syncTransfer({
      to,
      token,
      // nonce: 307,
      amount,
    });
    return {
      hash: response.txHash,
      from: syncWallet.address.toString(),
    } as  any;
  }
}
