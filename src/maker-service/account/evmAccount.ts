import { NonceManager } from '@ethersproject/experimental';
import { BigNumber, ethers, providers, Wallet } from 'ethers';
import { chains, logger } from 'orbiter-chaincore';

import { ERC20Abi } from '../abi';

import BaseAccount from './baseAccount';
export const RPC_NETWORK: { [key: string]: number } = {};
export default class EVMAccount extends BaseAccount {
  protected wallet: Wallet;
  public nonceManager: NonceManager;
  public provider: ethers.providers.Provider;
  constructor(
    protected readonly privateKey: string,
    protected readonly rpc: string
  ) {
    super(privateKey);
    if (this.rpc.includes('ws')) {
      this.provider = new providers.WebSocketProvider(this.rpc);
    } else {
      this.provider = new providers.JsonRpcProvider(this.rpc);
    }
    this.wallet = new ethers.Wallet(this.privateKey).connect(this.provider);
    this.nonceManager = new NonceManager(this.wallet);
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
    params.value = '0x';
    const response = await this.sendTransaction(token, params);
    return response;
  }
  async transfer(
    to: string,
    value: string,
    transactionRequest: ethers.providers.TransactionRequest = {}
  ) {
    transactionRequest.value = value;
    return this.sendTransaction(to, transactionRequest);
  }
  async sendTransaction(
    to: string,
    transactionRequest: ethers.providers.TransactionRequest = {}
  ): Promise<ethers.providers.TransactionResponse> {
    let chainId: number | undefined =
      transactionRequest.chainId || RPC_NETWORK[this.rpc];
    let tx: ethers.providers.TransactionRequest = {};
    if (!chainId) {
      chainId = await this.wallet.getChainId();
      RPC_NETWORK[this.rpc] = chainId;
    }

    const chainConfig = chains.getChainByChainId(String(chainId));
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
              const feeData = await this.provider.getFeeData();
              if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
                tx.maxFeePerGas = feeData.maxFeePerGas.toHexString();
                // fix 1.5gwei
                tx.maxPriorityFeePerGas =
                  feeData.maxPriorityFeePerGas.toHexString();
              }
            }
          } else {
            tx.gasPrice = tx.gasPrice || (await this.wallet.getGasPrice());
            // if (!tx.gasPrice) {
            //   const feeData = await this.provider.getFeeData();
            //   tx.gasPrice = BigNumber.from(feeData.gasPrice?.toString());
            // }
          }
        } catch ({ message }) {
          throw new Error(
            `=> getGasPrice error:${message}`
          );
        }
        try {
          if (!tx.gasLimit) {
            let gasLimit: number | BigNumber = await this.provider.estimateGas(
              tx
            );
            gasLimit = Number((gasLimit.toNumber() * 2).toFixed(0));
            tx.gasLimit = ethers.utils.hexlify(gasLimit);
          }
        } catch ({ message }) {
          throw new Error(
            `=> estimateGas limit error:${message}`
          );
        }
      } catch ({ message }) {
        // logger.error(`evm sendTransaction before error:${error.message}`, error);
        throw new Error(`=>sendTransaction before error:${message}`);
      }
      logger.info(`${chainConfig.name} sendTransaction:`, tx);
      const response = await this.nonceManager.sendTransaction(tx);
      console.debug(`${chainConfig.name} txHash:`, response.hash);
      // use nonce manager disabled
      // console.debug('Transaction Data:', JSON.stringify(tx));
      // const signedTx = await this.wallet.signTransaction(tx);
      // // console.log('Signed Transaction:', signedTx);
      // const txHash = ethers.utils.keccak256(signedTx);
      // const response = await this.provider.sendTransaction(signedTx);
      // console.debug('Precomputed txHash:', txHash);
      // console.debug('Precomputed Nonce:', tx.nonce.toString());
      return response;
    } catch ({ message }) {
      throw new Error(
        `=>evm ${chainConfig.name} sendTransaction error:${message}`
      );
    }
  }
  public async approve(token: string, spender: string, value: string | BigNumber) {
    const erc20 = new ethers.Contract(token, ERC20Abi, this.provider).connect(this.wallet);
    return await erc20.approve(spender, value);
  }
  public getBalance(to?: string): Promise<BigNumber> {
    return this.provider.getBalance(to || this.wallet.address);
  }
  public getTokenBalance(token: string, to?: string): Promise<BigNumber> {
    const erc20 = new ethers.Contract(token, ERC20Abi, this.provider);
    return erc20.balanceOf(to || this.wallet.address);
  }
}
