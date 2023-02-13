import { ethers } from 'ethers';
import OrbiterAccount from './orbiterAccount';
import { TransactionRequest, TransferResponse } from './IAccount';
import { generateLegacyStarkPrivateKey } from '@imtbl/core-sdk';
import {
  ChainId,
  ConnectorNames,
  ExchangeAPI,
  generateKeyPair,
  GlobalAPI,
  UserAPI,
  VALID_UNTIL,
} from '@loopring-web/loopring-sdk'
import { equals } from 'orbiter-chaincore/src/utils/core';
export default class LoopringAccount extends OrbiterAccount {
    private L1Wallet: ethers.Wallet;
    private client: ExchangeAPI;
    constructor(
        protected internalId: number,
        protected privateKey: string
    ) {
        super(internalId, privateKey);
        const L1Provider = ethers.getDefaultProvider(internalId === 9 ? "mainnet" : "goerli");
        this.L1Wallet = new ethers.Wallet(this.privateKey).connect(L1Provider);
        this.client = new ExchangeAPI({ chainId: Number(this.chainConfig.networkId) })
    }
    public async transfer(
        to: string,
        value: string,
        transactionRequest?: ethers.providers.TransactionRequest
    ): Promise<TransferResponse | undefined> {
        return await this.transferToken(String(this.chainConfig.nativeCurrency.address), to, value, transactionRequest);
    }

    public async getBalance(address?: string, token?: string): Promise<ethers.BigNumber> {
        if (token && token != this.chainConfig.nativeCurrency.address) {
            return await this.getTokenBalance(token, address);
        } else {
            address=  address || this.L1Wallet.address;
            console.log(this.client, '===client', address);
            const result =await this.client.getEthBalances({
                owner: address
            });
            console.log(result, '===ok');
            return await this.getTokenBalance(this.chainConfig.nativeCurrency.symbol, address);
        }
    }
    public async getTokenBalance(token: string, address?: string): Promise<ethers.BigNumber> {
        // const result = await this.client.getBalance({
        //     owner: address || this.L1Wallet.address,
        //     address: token
        // });
        return ethers.BigNumber.from(0);
    }

    public async transferToken(
        token: string,
        to: string,
        value: string,
        transactionRequest?: TransactionRequest
    ): Promise<TransferResponse | undefined> {

    }
}


export class Loopring {
    
}