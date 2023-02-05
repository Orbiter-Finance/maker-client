import { ethers } from 'ethers';
import { chains } from 'orbiter-chaincore';
import * as zksync from 'zksync';

import BaseAccount, { TransactionRequest, TransactionResponse, TransferResponse } from './IAccount';
export const RPC_NETWORK: { [key: string]: number } = {};
export default class zkSyncAccount extends BaseAccount {
  public l1Wallet: ethers.Wallet;

  constructor(
    protected internalId: number,
    protected privateKey: string,
    protected readonly zkSyncNetwork: zksync.types.Network
  ) {
    super(internalId, privateKey);
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
  ): Promise<TransferResponse> {
    throw new Error('Method not implemented.');
  }
  public async getBalance(address?: string): Promise<ethers.BigNumber> {
    return await this.getTokenBalance('0x0000000000000000000000000000000000000000', address);
  }
  public async getTokenBalance(token: string, address?: string): Promise<ethers.BigNumber> {
    if (address) {
      throw new Error('The specified address query is not supported temporarily');
    }
    const syncProvider = await zksync.getDefaultProvider(this.zkSyncNetwork);
    const syncWallet = await zksync.Wallet.fromEthSigner(
      this.l1Wallet,
      syncProvider
    );
    return syncWallet.getBalance(token, 'committed');
  }
  public async transferToken(
    token: string,
    to: string,
    value: string,
    transactionRequest?:TransactionRequest
  ): Promise<TransferResponse | undefined> {
    const chainConfig = chains.getChainInfo(this.internalId);
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
    const receipt = await response.awaitReceipt();
    if (receipt.executed  && receipt.success) {
      const txData = response.txData.tx;
      return {
        hash: response.txHash,
        from: syncWallet.address(),
        to,
        fee: ethers.BigNumber.from(txData.fee),
        value: ethers.BigNumber.from(value),
        nonce: txData.nonce,
        internalId: Number(chainConfig?.internalId)
      };
    }
    throw new Error(receipt.failReason);
  }
}
