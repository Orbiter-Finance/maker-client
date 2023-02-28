import { LoggerService } from './../utils/logger';
import { ethers, providers, Wallet } from 'ethers';
import { ERC20Abi } from '../abi';
import { TransactionRequest, TransactionResponse, TransferResponse } from './IAccount';
import OrbiterAccount from './orbiterAccount';
import { getNonceCacheStore } from '../utils/caching';
import NonceManager from '../lib/nonce';
import { isEmpty } from 'orbiter-chaincore/src/utils/core';
import config from '../config/config'
import BigNumber from 'bignumber.js';

export const RPC_NETWORK: { [key: string]: number } = {};
export default class EVMAccount extends OrbiterAccount {
  protected wallet: Wallet;
  public nonceManager: NonceManager;
  public provider: ethers.providers.Provider;
  constructor(
    protected internalId: number,
    protected readonly privateKey: string
  ) {
    super(internalId, privateKey);
    const rpc = this.chainConfig.rpc[0];
    if (rpc.includes('ws')) {
      this.provider = new providers.WebSocketProvider(rpc);
      this.provider.on('error', (...result) => {
        this.logger.error('ws error：', { result });
      })
    } else {
      this.provider = new providers.JsonRpcProvider({
        url: rpc,
      });
    }
    this.wallet = new ethers.Wallet(this.privateKey).connect(this.provider);
    this.nonceManager = new NonceManager(this.wallet.address, async () => {
      const nonce = await this.wallet.getTransactionCount("pending");
      return Number(nonce);
    }, {
      store: getNonceCacheStore(`${internalId}-${this.wallet.address}`)
    });
    this.logger = LoggerService.getLogger(internalId.toString());
  }
  async transferToken(
    token: string,
    to: string,
    value: string,
    transactionRequest: ethers.providers.TransactionRequest = {}
  ): Promise<TransferResponse> {
    const ifa = new ethers.utils.Interface(ERC20Abi);
    const data = ifa.encodeFunctionData('transfer', [to, ethers.BigNumber.from(value)]);
    transactionRequest.data = data;
    transactionRequest.to = token;
    transactionRequest.value = ethers.BigNumber.from(0);
    transactionRequest.from = this.wallet.address;
    // get erc20 getLimit
    if (!transactionRequest.gasLimit) {
      try {
        const gasLimit = await this.provider.estimateGas({
          from: transactionRequest.from,
          to: token,
          data,
          value: transactionRequest.value
        });
        transactionRequest.gasLimit = gasLimit;
      } catch (error) {
        this.logger.error(`evm transferToken estimateGas error`, error);
        transactionRequest.gasLimit = ethers.BigNumber.from(100000);
      }
    }
    const tx = await this.sendTransaction(token, transactionRequest);
    return {
      hash: tx.hash,
      nonce: tx.nonce,
      from: tx.from,
      to: to,
      token,
      value: ethers.BigNumber.from(value),
    };
  }
  async getGasPrice(transactionRequest: ethers.providers.TransactionRequest = {}) {
    try {
      const chainCustomConfig = config[this.chainConfig.internalId];
      if (transactionRequest.type === 2) {
        if (!transactionRequest.maxFeePerGas || !transactionRequest.maxPriorityFeePerGas) {
          this.logger.info(`sendTransaction exec 4 getFeeData:`);
          const feeData = await this.provider.getFeeData();
          if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
            transactionRequest.maxFeePerGas = feeData.maxFeePerGas.toHexString();
            // fix 1.5gwei
            transactionRequest.maxPriorityFeePerGas =
              feeData.maxPriorityFeePerGas.toHexString();
          }
          if (chainCustomConfig.maxGasPrice) {
            transactionRequest.maxFeePerGas = ethers.BigNumber.from(chainCustomConfig.maxGasPrice);
          }
          this.logger.info(`sendTransaction exec 4 getFeeData ok:`, {
            maxFeePerGas: transactionRequest.maxFeePerGas,
            maxPriorityFeePerGas: transactionRequest.maxPriorityFeePerGas
          });
        }
        delete transactionRequest.gasPrice;
      }

      if (transactionRequest.type === 0) {
        if (!transactionRequest.gasPrice) {
          this.logger.info(`sendTransaction exec 4 getGasPrice:${transactionRequest.gasPrice}`);
          const feeData = await this.provider.getFeeData();
          this.logger.info(`sendTransaction exec 4 feeData:`, feeData);
          transactionRequest.gasPrice = await this.provider.getGasPrice().catch(error => {
            this.logger.error(`sendTransaction exec 4 getGasPrice error:`, error);
            return ethers.BigNumber.from(0);
          })
          // tx.gasPrice = await this.wallet.getGasPrice();
          this.logger.info(`sendTransaction exec 4 getGasPrice ok:${transactionRequest.gasPrice}`);
        }
        this.logger.info(`before 1 gasPrice:${String(transactionRequest.gasPrice)}`);
        if (chainCustomConfig) {
          const gasPrice = ethers.BigNumber.from(String(transactionRequest.gasPrice || 0));
          const minPrice = ethers.BigNumber.from(chainCustomConfig.minGasPrice || 0);
          if (gasPrice.lt(minPrice)) {
            transactionRequest.gasPrice = minPrice;
          }
          this.logger.info(`before 2 gasPrice:${String(transactionRequest.gasPrice)}`);
          const gasPriceMultiple = new BigNumber(chainCustomConfig.gasPriceMultiple);
          if (gasPriceMultiple.gt(0)) {
            const newGasPrice = new BigNumber(gasPrice.toString()).multipliedBy(gasPriceMultiple)
            transactionRequest.gasPrice = ethers.BigNumber.from(newGasPrice.toFixed(0));
          }
          this.logger.info(`after 3 gasPrice:${String(transactionRequest.gasPrice)}`);
        }
      }
    } catch (error) {
      console.log('GetGasPrice error:', error);
    }
    return transactionRequest;
  }
  async getGasLimit(transactionRequest: ethers.providers.TransactionRequest = {}) {
    try {
      if (!transactionRequest.gasLimit || isEmpty(transactionRequest.gasLimit)) {
        let gasLimit: number | ethers.BigNumber = 100000;
        try {
          this.logger.info(`sendTransaction exec 5 estimateGas:`);
          gasLimit = await this.provider.estimateGas(
            transactionRequest
          );
          console.log(`${this.chainConfig.name} get gasLimit ${(gasLimit).toString()}`)
        } catch ({ message }) {
          throw new Error(
            `=> estimateGas limit error:${message}`
          );
        }
        transactionRequest.gasLimit = ethers.utils.hexlify(gasLimit);
      }
      const chainCustomConfig = config[this.chainConfig.internalId];
      // let gasLimit = ethers.BigNumber.from(0);
      this.logger.info(`before gasLimit:${transactionRequest.gasLimit.toString()}`);
      if (chainCustomConfig && chainCustomConfig.gasLimitMultiple && transactionRequest.gasLimit) {
        // gasLimit = ethers.BigNumber.from(chainCustomConfig.swapAnswerGasLimit);
        const newGasLimit = new BigNumber(transactionRequest.gasLimit.toString()).multipliedBy(chainCustomConfig.gasLimitMultiple)
        transactionRequest.gasLimit = ethers.BigNumber.from(newGasLimit.toFixed(0));
      }
      this.logger.info(`after gasLimit:${transactionRequest.gasLimit.toString()}`);
    } catch (error) {
      console.log('GetGasLimit error:', error);
    }
    return transactionRequest;
  }
  async transfer(
    to: string,
    value: string,
    transactionRequest: TransactionRequest = {}
  ): Promise<TransferResponse> {
    transactionRequest.to = to;
    transactionRequest.value = ethers.BigNumber.from(value);
    transactionRequest.from = this.wallet.address;
    // get getLimit
    if (!transactionRequest.gasLimit) {
      try {
        const gasLimit = await this.provider.estimateGas({
          from: transactionRequest.from,
          to: transactionRequest.to,
          value: transactionRequest.value
        });
        transactionRequest.gasLimit = gasLimit;
      } catch (error) {
        this.logger.error(`evm transfer estimateGas error`, error);
        transactionRequest.gasLimit = ethers.BigNumber.from(100000);
      }

    }

    const tx = await this.sendTransaction(to, transactionRequest);

    return {
      hash: tx.hash,
      nonce: tx.nonce,
      from: tx.from,
      to: tx.to,
      value: tx.value,
    };
  }
  async sendTransaction(
    to: string,
    transactionRequest: TransactionRequest = {}
  ): Promise<TransactionResponse> {
    this.logger.info(`sendTransaction exec 1:`, { to });
    let chainId: number | undefined =
      transactionRequest.chainId || RPC_NETWORK[this.internalId];
    if (!chainId) {
      chainId = await this.wallet.getChainId();
      RPC_NETWORK[this.internalId] = chainId;
    }
    const tx: ethers.providers.TransactionRequest = Object.assign(
      {
        chainId,
      },
      transactionRequest,
      {
        from: this.wallet.address,
        to,
      }
    );
    this.logger.info(`sendTransaction exec 2:`, { to });
    try {
      // nonce manager
      await this.getGasPrice(tx);
      this.logger.info(`sendTransaction exec getPrice:`, { tx });
      await this.getGasLimit(tx);
      this.logger.info(`sendTransaction exec gasLimit:`, { tx });
      // this.logger.error(`evm sendTransaction before error`, error);
      // throw new Error(`=>sendTransaction before error:${error.message}`);
      // logger.info(`${chainConfig.name} sendTransaction before nonce:${this.nonceManager._deltaCount}`);
      const { nonce, submit, rollback } = await this.nonceManager.getNextNonce();
      try {
        // const response = await this.nonceManager.sendTransaction(tx);
        // this.logger.info(`${this.chainConfig.name} sendTransaction txHash:`, response.hash);
        // logger.info(`${chainConfig.name} sendTransaction after nonce:${this.nonceManager._deltaCount}/${response.nonce}`);
        // use nonce manager disabled
        tx.nonce = nonce;
        this.logger.info(`${this.chainConfig.name} sendTransaction:`, tx);
        const signedTx = await this.wallet.signTransaction(tx);
        // // console.log('Signed Transaction:', signedTx);
        const txHash = ethers.utils.keccak256(signedTx);
        const response = await this.provider.sendTransaction(signedTx);
        this.logger.info(`${this.chainConfig.name} sendTransaction txHash:`, txHash);
        submit();
        // console.debug('Precomputed txHash:', txHash);
        // console.debug('Precomputed Nonce:', tx.nonce.toString());
        response.wait().then(tx => {
          this.logger.info(`evm ${this.chainConfig.name} sendTransaction waitForTransaction:`, tx)
        }).catch(err => {
          this.logger.error(`evm ${this.chainConfig.name} sendTransaction waitForTransaction:`, err)
        })
        return response;
      } catch (error: any) {
        this.logger.error(`rollback nonce:${error.message}`);
        rollback()
        throw error;
      }

    } catch (error) {
      this.logger.error(`${this.chainConfig.name} SendTransaction error`, error)
      throw error;
    }
  }
  public async approve(token: string, spender: string, value: string | BigNumber) {
    const erc20 = new ethers.Contract(token, ERC20Abi, this.provider).connect(this.wallet);
    return await erc20.approve(spender, value);
  }
  public async allowance(token: string, spender: string) {
    const erc20 = new ethers.Contract(token, ERC20Abi, this.provider).connect(this.wallet);
    return await erc20.allowance(this.wallet.address, spender);
  }
  public async getBalance(address?: string, token?: string): Promise<ethers.BigNumber> {
    if (token && token != this.chainConfig.nativeCurrency.address) {
      // is native
      // const chainId = await this.wallet.getChainId();
      // const issMainToken = await chains.inValidMainToken(String(chainId), token);
      return this.getTokenBalance(token, address);
    } else {
      return this.provider.getBalance(address || this.wallet.address);
    }
  }
  public async getTokenBalance(token: string, address?: string): Promise<ethers.BigNumber> {
    const erc20 = new ethers.Contract(token, ERC20Abi, this.provider);
    return erc20.balanceOf(address || this.wallet.address);
  }
}
