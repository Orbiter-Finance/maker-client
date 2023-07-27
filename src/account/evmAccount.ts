import { ethers, Interface, isError, JsonRpcProvider, keccak256, Wallet } from 'ethers';
import abis from '../abi'
const ERC20Abi = abis['ERC20Abi'];
import { TransactionRequest, TransactionResponse, TransferResponse } from './IAccount';
import OrbiterAccount from './orbiterAccount';
import NonceManager from '../lib/nonce';
import BigNumber from 'bignumber.js';
import { ChainConfigService, IChainConfig } from 'src/config/chainconfig.service';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { TransactionFailedError, TransactionSendBeforeError } from './IAccount.interface';
import { getMakerConfig } from 'src/config/makerConfig.service';
import { JSONStringify } from 'src/utils';
export const RPC_NETWORK: { [key: string]: number } = {};
export default class EVMAccount extends OrbiterAccount {
  protected wallet: Wallet;
  public nonceManager: NonceManager;
  public provider: JsonRpcProvider;
  public chainConfigService: ChainConfigService;
  constructor(
    protected chainConfig: IChainConfig
  ) {
    super(chainConfig);
    this.logger = new Logger(`${this.chainConfig.name} - ${this.chainConfig.internalId}`);
    const rpc = this.chainConfig.rpc[0];
    this.provider = new JsonRpcProvider(rpc);
  }
  async connect(privateKey: string) {
    this.wallet = new ethers.Wallet(privateKey).connect(this.provider);
    if (!this.nonceManager) {
      this.nonceManager = new NonceManager(this.wallet.address, async () => {
        const nonce = await this.wallet.getNonce("pending");
        return Number(nonce);
      });
      await this.nonceManager.forceRefreshNonce();
    }
    return this;
  }
  async transferToken(
    token: string,
    to: string,
    value: bigint,
    transactionRequest: TransactionRequest = {}
  ): Promise<TransferResponse> {
    try {
      const balance = await this.getTokenBalance(token);
      if (balance < value) {
        throw new TransactionSendBeforeError(`The sender ${token} has insufficient balance`);
      }
      const ifa = new Interface(ERC20Abi);
      const data = ifa.encodeFunctionData('transfer', [to, value]);
      transactionRequest.data = data;
      transactionRequest.to = token;
      transactionRequest.value = 0n;
      transactionRequest.from = this.wallet.address;
      // get erc20 getLimit
      await this.getGasPrice(transactionRequest);
    } catch (error) {
      throw new TransactionSendBeforeError(error.message);
    }
    const tx = await this.sendTransaction(token, transactionRequest);
    return {
      hash: tx.hash,
      nonce: tx.nonce,
      from: tx.from,
      to: to,
      token,
      value,
      _response: tx
    };
  }
  async getGasPrice(transactionRequest: TransactionRequest = {}) {
    try {
      const chainCustomConfig = getMakerConfig(this.chainConfig.internalId.toString()) || {};
      if (!transactionRequest.gasLimit) {
        const gasLimit = await this.provider.estimateGas({
          from: transactionRequest.from,
          to: transactionRequest.to,
          data: transactionRequest.data,
          value: transactionRequest.value
        });
        transactionRequest.gasLimit = gasLimit;
      }
      let isEIP1559 = false;
      const feeData = await this.provider.getFeeData();
      if (transactionRequest.type === 0) {
        isEIP1559 = false;
      } else if (transactionRequest.type === 2) {
        isEIP1559 = true;
      } else {
        if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
          isEIP1559 = true;
        }
      }
      if (isEIP1559) {
        let maxFeePerGas = chainCustomConfig.MinFeePerGas || 0;
        let maxPriorityFeePerGas = chainCustomConfig.MinPriorityFeePerGas || 0;
        if (!transactionRequest.maxFeePerGas || !transactionRequest.maxPriorityFeePerGas) {
          if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
            maxFeePerGas = Number(feeData.maxFeePerGas);
            maxPriorityFeePerGas = Number(feeData.maxPriorityFeePerGas);
          }
          transactionRequest.type = 2;
          transactionRequest.maxFeePerGas = Math.max(chainCustomConfig.MinFeePerGas, maxFeePerGas);
          transactionRequest.maxPriorityFeePerGas = Math.max(chainCustomConfig.MinPriorityFeePerGas, maxPriorityFeePerGas);
        }
        // delete transactionRequest.gasPrice;
      } else {
        let maxFeePerGas = transactionRequest.gasPrice || 0n;
        if (!maxFeePerGas || +maxFeePerGas.toString() <= 0) {
          maxFeePerGas = feeData.gasPrice;
        }
        transactionRequest.type = 0;
        transactionRequest.gasPrice = Math.max(chainCustomConfig.MinFeePerGas, +maxFeePerGas.toString());
      }
      return transactionRequest;
    } catch (error) {
      throw error;
    }
  }

  async transfer(
    to: string,
    value: bigint,
    transactionRequest: TransactionRequest = {}
  ): Promise<TransferResponse> {
    try {
      const balance = await this.getBalance();
      if (balance < value) {
        throw new TransactionSendBeforeError(`The sender has insufficient balance`);
      }
      transactionRequest.to = to;
      transactionRequest.value = value as any;
      transactionRequest.from = this.wallet.address;
      // get getLimit
      await this.getGasPrice(transactionRequest);

    } catch (error) {
      throw new TransactionSendBeforeError(error.message);
    }
    const tx = await this.sendTransaction(to, transactionRequest);
    return {
      hash: tx.hash,
      nonce: tx.nonce,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      _response: tx
    };
  }

  async transfers(tos: string[], values: bigint[], transactionRequest: TransactionRequest = {}) {
    let router;
    try {
      if (tos.length !== values.length) {
        throw new TransactionSendBeforeError(`to and values are inconsistent in length`);
      }
      router = Object.keys(this.chainConfig.contract).find((addr) => this.chainConfig.contract[addr] === 'OrbiterXRouter');
      if (!router) {
        throw new TransactionSendBeforeError(`transferTokens router not config`);
      }
      const totalValue = values.reduce((accumulator, currentValue) => accumulator + currentValue, 0n);
      // 
      const balance = await this.getBalance();
      if (balance < totalValue) {
        throw new TransactionSendBeforeError(`The sender has insufficient balance`);
      }
      if (!abis['OrbiterXRouter']) {
        throw new TransactionSendBeforeError(`OrbiterXRouter ABI Not Found`);
      }
      const ifa = new Interface(abis['OrbiterXRouter']);
      transactionRequest.value = totalValue;
      transactionRequest.to = router;
      transactionRequest.data = ifa.encodeFunctionData('transfers', [tos, values]);
      await this.getGasPrice(transactionRequest);
    } catch (error) {
      throw new TransactionSendBeforeError(error.message);
    }
    const tx = await this.sendTransaction(router, transactionRequest);
    return tx;
  }

  public async transferTokens(token: string, tos: string[], values: bigint[], transactionRequest: TransactionRequest = {}): Promise<TransferResponse | undefined> {
    let router;
    try {
      if (tos.length !== values.length) {
        throw new TransactionSendBeforeError(`to and values are inconsistent in length`);
      }
      router = Object.keys(this.chainConfig.contract).find((addr) => this.chainConfig.contract[addr] === 'OrbiterXRouter');
      if (!router) {
        throw new TransactionSendBeforeError(`transferTokens router not config`);
      }
      const totalValue = values.reduce((accumulator, currentValue) => accumulator + currentValue, 0n);
      const balance = await this.getTokenBalance(token);
      if (balance < totalValue) {
        throw new TransactionSendBeforeError(`The sender ${token} has insufficient balance`);
      }
      if (!abis['OrbiterXRouter']) {
        throw new TransactionSendBeforeError(`OrbiterXRouter ABI Not Found`);
      }
      const ifa = new Interface(abis['OrbiterXRouter']);
      const data = ifa.encodeFunctionData('transferTokens', [token, tos, values]);
      transactionRequest.data = data;
      transactionRequest.to = router;
      await this.getGasPrice(transactionRequest);
    } catch (error) {
      throw new TransactionSendBeforeError(error.message);
    }
    const tx = await this.sendTransaction(router, transactionRequest);
    return tx;
  }
  async sendTransaction(
    to: string,
    transactionRequest: TransactionRequest = {}
  ): Promise<TransactionResponse> {

    let serialIds = [];
    if (transactionRequest.serialId) {
      serialIds = typeof transactionRequest.serialId === 'string' ? [transactionRequest.serialId] : transactionRequest.serialId;
      for (const serialId of serialIds) {
        const result = await this.getSerialRecord(serialId);
        if (result) {
          throw new Error(`${serialId} There are running records value = ${result}`);
        }
      }
    }
    let chainId: number | undefined =
      Number(transactionRequest.chainId || RPC_NETWORK[this.internalId]);
    if (!chainId) {
      chainId = +this.chainConfig.chainId;
      // chainId = await this.wallet.getChainId();
      // const network = await this.wallet.provider.getNetwork();
      RPC_NETWORK[this.internalId] = chainId;
    }

    const tx: TransactionRequest = {
      chainId,
      ...transactionRequest,
      from: this.wallet.address,
      to,
    };
    const { nonce, submit, rollback } = await this.nonceManager.getNextNonce();
    let txHash;
    try {
      tx.nonce = nonce;
      if (tx.value) {
        tx.value = new BigNumber(String(tx.value)).toFixed(0);
      }
      this.logger.log(`${this.chainConfig.name} sendTransaction:`, tx);
      const signedTx = await this.wallet.signTransaction(tx);
      txHash = keccak256(signedTx);
      const response = await this.provider.broadcastTransaction(signedTx);
      this.logger.log(`${this.chainConfig.name} sendTransaction txHash:${txHash}`);

      for (const serialId of serialIds) {
        await this.levelDB.put(serialId, txHash);
      }

      submit();
      response.wait().then(tx => {
        this.logger.log(`evm ${this.chainConfig.name} sendTransaction waitForTransaction: ${JSONStringify(tx)}`)
      }).catch(err => {
        this.logger.error(`evm ${this.chainConfig.name} sendTransaction waitForTransaction:`, err)
      })
      return response;
    } catch (error) {
      this.logger.error(`broadcastTransaction tx error:${txHash} - ${error.message}`, error);
      // rollback()
      if (isError(error, 'NONCE_EXPIRED')) {
        throw new TransactionSendBeforeError(error.message);
      }
      throw new TransactionFailedError(error.message);
    }
  }
  public async approve(token: string, spender: string, value: string | BigNumber) {
    const erc20 = new ethers.Contract(token, ERC20Abi, this.provider).connect(this.wallet);
    return await erc20['approve'](spender, value);
  }
  public async allowance(token: string, spender: string) {
    const erc20 = new ethers.Contract(token, ERC20Abi, this.provider).connect(this.wallet);
    return await erc20['allowance'](this.wallet.address, spender);
  }
  public async getBalance(address?: string, token?: string): Promise<bigint> {
    if (token && token != this.chainConfig.nativeCurrency.address) {
      // is native
      // const chainId = await this.wallet.getChainId();
      // const issMainToken = await chains.inValidMainToken(String(chainId), token);
      return this.getTokenBalance(token, address);
    } else {
      return this.provider.getBalance(address || this.wallet.address);
    }
  }
  public async getTokenBalance(token: string, address?: string): Promise<bigint> {
    const erc20 = new ethers.Contract(token, ERC20Abi, this.provider);
    return erc20.balanceOf(address || this.wallet.address);
  }
}