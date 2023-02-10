import { ethers } from 'ethers';
import { chains } from 'orbiter-chaincore';
import * as zksync from 'zksync';
import NonceManager from '../lib/nonce';
import { getNonceCacheStore } from '../utils/caching';
import OrbiterAccount from './orbiterAccount';

import { TransactionRequest, TransactionResponse, TransferResponse } from './IAccount';
export const RPC_NETWORK: { [key: string]: number } = {};
export default class ZKSyncAccount extends OrbiterAccount {
  private nonceManager: NonceManager;
  constructor(
    protected internalId: number,
    protected privateKey: string
  ) {
    super(internalId, privateKey);
    const l1Wallet = new ethers.Wallet(this.privateKey);
    this.nonceManager = new NonceManager(l1Wallet.address, async () => {
      const { wallet } = await this.getL2Wallet();
      const nonce = await wallet.getNonce("committed");
      return Number(nonce);
    }, {
      store: getNonceCacheStore(`${internalId}-${l1Wallet.address}`)
    });
  }
  private async getL2Wallet() {
    let l1Provider;
    let l2Provider;
    if (this.internalId === 3) {
      l1Provider = ethers.providers.getDefaultProvider('mainnet');
      l2Provider = await zksync.getDefaultProvider('mainnet');
    } else if (this.internalId === 33) {
      l1Provider = ethers.providers.getDefaultProvider('rinkeby');
      // l2Provider = await zksync.getDefaultProvider('goerli');
      l2Provider = await zksync.Provider.newHttpProvider('https://goerli-api.zksync.io/jsrpc')
    }
    const l1Wallet = new ethers.Wallet(this.privateKey).connect(l1Provider);
    const L2Wallet = await zksync.Wallet.fromEthSigner(
      l1Wallet,
      l2Provider
    )
    return { wallet: L2Wallet };
  }
  public async transfer(
    to: string,
    value: string,
    transactionRequest?: ethers.providers.TransactionRequest
  ): Promise<TransferResponse |undefined> {
    return await this.transferToken(String(this.chainConfig.nativeCurrency.address), to, value, transactionRequest);

  }
  public async getBalance(address?: string): Promise<ethers.BigNumber> {
    return await this.getTokenBalance(this.chainConfig.nativeCurrency.address, address);
  }
  public async getTokenBalance(token: string, address?: string): Promise<ethers.BigNumber> {
    if (address) {
      throw new Error('The specified address query is not supported temporarily');
    }
    const { wallet } = await this.getL2Wallet();
    return wallet.getBalance(token, 'committed');
  }
  public async transferToken(
    token: string,
    to: string,
    value: string,
    transactionRequest?: TransactionRequest
  ): Promise<TransferResponse | undefined> {
    const chainConfig = chains.getChainInfo(this.internalId);
    const { wallet } = await this.getL2Wallet();
    const { nonce, submit, rollback } = await this.nonceManager.getNextNonce();
    const amount = zksync.utils.closestPackableTransactionAmount(value);
    let response;
    try {
      response = await wallet.syncTransfer({
        to,
        token,
        nonce,
        amount,
      });
      submit();
    } catch (error) {
      this.logger.error('rollback nonce:', error);
      rollback()
      throw error;
    }
    if (response) {
      response.awaitReceipt().then(tx => {
        this.logger.info(`${this.chainConfig.name} sendTransaction waitForTransaction:`, tx)
      }).catch(err => {
        this.logger.error(`${this.chainConfig.name} sendTransaction Error:`, err)
      })
    }
    const txData = response.txData.tx;
    return {
      hash: response.txHash,
      from: wallet.address(),
      to,
      fee: ethers.BigNumber.from(txData.fee),
      value: ethers.BigNumber.from(value),
      nonce: txData.nonce,
      internalId: Number(chainConfig?.internalId)
    };
  }
}
