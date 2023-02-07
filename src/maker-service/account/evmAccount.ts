import { LoggerService } from './../utils/logger';
import { BigNumber, ethers, providers, Wallet } from 'ethers';
import { ERC20Abi } from '../abi';
import { TransactionRequest, TransactionResponse, TransferResponse } from './IAccount';
import OrbiterAccount from './Account';
import { getNonceCacheStore } from '../utils/caching';
import NonceManager from '../lib/nonce';
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
      this.provider.on('debug', (...result) => {
        this.logger.error('ws debug', { result });
      })
    } else {
      this.provider = new providers.JsonRpcProvider({
        url: rpc,
      });
    }
    this.wallet = new ethers.Wallet(this.privateKey).connect(this.provider);
    // this.nonceManager = new NonceManager(this.wallet, this);
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
    const params = Object.assign(
      {
        data,
      },
      transactionRequest
    );
    params.value = ethers.BigNumber.from(0);
    const tx = await this.sendTransaction(token, params);
    return {
      hash: tx.hash,
      internalId: Number(this.internalId),
      nonce: tx.nonce,
      from: tx.from,
      to: to,
      token,
      value: ethers.BigNumber.from(value),
      wait: tx.wait
    };
  }
  async transfer(
    to: string,
    value: string,
    transactionRequest: TransactionRequest = {}
  ): Promise<TransferResponse> {
    transactionRequest.value = ethers.BigNumber.from(value);
    const tx = await this.sendTransaction(to, transactionRequest);
    return {
      hash: tx.hash,
      internalId: Number(this.internalId),
      nonce: tx.nonce,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      wait: tx.wait
    };
  }
  async sendTransaction(
    to: string,
    transactionRequest: ethers.providers.TransactionRequest = {}
  ): Promise<TransactionResponse> {
    this.logger.info(`sendTransaction exec 1:`, { to });
    let chainId: number | undefined =
      transactionRequest.chainId || RPC_NETWORK[this.internalId];
    let tx: ethers.providers.TransactionRequest = {};
    if (!chainId) {
      chainId = await this.wallet.getChainId();
      RPC_NETWORK[this.internalId] = chainId;
    }
    this.logger.info(`sendTransaction exec 2:`, { to });
    try {
      try {
        // nonce manager
        tx = Object.assign(
          {
            chainId,
          },
          transactionRequest,
          {
            from: this.wallet.address,
            to,
          }
        );
        this.logger.info(`sendTransaction exec 3:`, { tx });
        // use nonce manager disabled
        // if (!tx.nonce) {
        //   tx.nonce = await this.provider.getTransactionCount(
        //     this.wallet.address,
        //     'pending'
        //   );
        // }
        try {
          if (tx.type === 2) {
            if (!tx.maxFeePerGas || !tx.maxPriorityFeePerGas) {
              this.logger.info(`sendTransaction exec 4 getFeeData:`);
              const feeData = await this.provider.getFeeData();
              if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
                tx.maxFeePerGas = feeData.maxFeePerGas.toHexString();
                // fix 1.5gwei
                tx.maxPriorityFeePerGas =
                  feeData.maxPriorityFeePerGas.toHexString();
              }
              this.logger.info(`sendTransaction exec 4 getFeeData ok:`, {
                maxFeePerGas: tx.maxFeePerGas,
                maxPriorityFeePerGas: tx.maxPriorityFeePerGas
              });
            }
          } else {
            if (!tx.gasPrice) {
              this.logger.info(`sendTransaction exec 4 getGasPrice:${tx.gasPrice}`);
              const feeData = await this.provider.getFeeData();
              this.logger.info(`sendTransaction exec 4 feeData:`, feeData);
              tx.gasPrice = await this.provider.getGasPrice().catch(error => {
                this.logger.error(`sendTransaction exec 4 getGasPrice error:`, error);
                return 0;
              })
              // tx.gasPrice = await this.wallet.getGasPrice();
              this.logger.info(`sendTransaction exec 4 getGasPrice ok:${tx.gasPrice}`);
            }

          }
        } catch ({ message }) {
          throw new Error(
            `=> getGasPrice error:${message}`
          );
        }
        this.logger.info(`sendTransaction exec 3:`, { to });
        try {
          if (!tx.gasLimit) {
            this.logger.info(`sendTransaction exec 5 estimateGas:`);
            let gasLimit: number | BigNumber = await this.provider.estimateGas(
              tx
            );
            console.log(`${this.chainConfig.name} get gasLimit ${(gasLimit).toString()}`)
            gasLimit = Number((gasLimit.toNumber() * 2).toFixed(0));
            tx.gasLimit = ethers.utils.hexlify(gasLimit);
          }
        } catch ({ message }) {
          throw new Error(
            `=> estimateGas limit error:${message}`
          );
        }
      } catch (error: any) {
        this.logger.error(`evm sendTransaction before error`, error);
        throw new Error(`=>sendTransaction before error:${error.message}`);
      }
      // logger.info(`${chainConfig.name} sendTransaction before nonce:${this.nonceManager._deltaCount}`);
      this.logger.info(`${this.chainConfig.name} sendTransaction before:`, tx);
      const { nonce, submit, rollback } = await this.nonceManager.getNextNonce();
      try {
        // const response = await this.nonceManager.sendTransaction(tx);
        // this.logger.info(`${this.chainConfig.name} sendTransaction txHash:`, response.hash);
        // logger.info(`${chainConfig.name} sendTransaction after nonce:${this.nonceManager._deltaCount}/${response.nonce}`);
        // use nonce manager disabled
        tx.nonce = nonce;
        console.debug('Transaction Data:', JSON.stringify(tx));
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
        }).catch(err=> {
          this.logger.error(`evm ${this.chainConfig.name} sendTransaction waitForTransaction:`, err)
        })
        return response;
      } catch (error) {
        this.logger.error('rollback nonce:', error);
        rollback()
        throw error;
      }

    } catch (error) {
      this.logger.error(`${this.chainConfig.name} Core SendTransaction error`, error)
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
  public async getBalance(address?: string, token?: string): Promise<BigNumber> {
    if (token) {
      // is native
      // const chainId = await this.wallet.getChainId();
      // const issMainToken = await chains.inValidMainToken(String(chainId), token);
      return this.getTokenBalance(token, address);
    } else {
      return this.provider.getBalance(address || this.wallet.address);
    }
  }
  public async getTokenBalance(token: string, address?: string): Promise<BigNumber> {
    const erc20 = new ethers.Contract(token, ERC20Abi, this.provider);
    return erc20.balanceOf(address || this.wallet.address);
  }
}
