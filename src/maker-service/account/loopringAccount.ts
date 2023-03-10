import { ethers } from 'ethers';
import OrbiterAccount from './orbiterAccount';
import { TransferResponse } from './IAccount';
import fs from 'fs';
import {
    ConnectorNames,
    ExchangeAPI,
    generateKeyPair,
    UserAPI,
} from '@loopring-web/loopring-sdk'
import { equals } from 'orbiter-chaincore/src/utils/core';
import { HttpGet } from '../utils/request';
import { chains } from 'orbiter-chaincore';
import { writeFile } from 'fs/promises';
import path from 'path/posix';
import { outputJSONSync } from 'fs-extra';
import Web3 from 'web3';
import PrivateKeyProvider from 'truffle-privatekey-provider';
import { LoopringSendTokenRequest } from '../types';
import { SwapOrder } from '../service/sequencer';
export default class LoopringAccount extends OrbiterAccount {
    private L1Wallet: ethers.Wallet;
    private client: ExchangeAPI;
    constructor(
        protected internalId: number,
        protected privateKey: string
    ) {
        super(internalId, privateKey);

        this.L1Wallet = new ethers.Wallet(this.privateKey)
        this.client = new ExchangeAPI({ chainId: Number(this.chainConfig.networkId) })
        this.client.getTokens().then(({ tokensMap }) => {
            const tokenList = Object.keys(tokensMap).map((symbol) => {
                const token = tokensMap[symbol];
                return {
                    address: token.address,
                    decimals: token.decimals,
                    symbol: token.symbol,
                    id: token.tokenId,
                    name: token.name,
                    type: token.type
                }
            });
            outputJSONSync(
                path.join(
                    process.cwd(),
                    "runtime",
                    `tokens/${this.chainConfig.internalId}.json`,
                ),
                tokenList,
            );

        })
    }
    public async transfer(
        to: string,
        value: string,
        transactionRequest?: LoopringSendTokenRequest
    ): Promise<TransferResponse | undefined> {
        return await this.transferToken(String(this.chainConfig.nativeCurrency.address), to, value, transactionRequest);
    }

    public async getBalance(address?: string, token?: string): Promise<ethers.BigNumber> {
        if (token && token != this.chainConfig.nativeCurrency.address) {
            return await this.getTokenBalance(token, address);
        } else {
            return await this.getTokenBalance(this.chainConfig.nativeCurrency.address, address);
        }
    }
    public async getTokenBalance(token: string, address?: string): Promise<ethers.BigNumber> {
        address = address || this.L1Wallet.address;
        const tokenInfo = chains.getTokenByChain(this.internalId, token);
        if (!tokenInfo) {
            throw new Error(`${token} token not found`);
        }
        const { accInfo } = await this.client.getAccount({ owner: address });
        const balances = await HttpGet(`${this.chainConfig.api.url}/api/v3/user/balances`, {
            accountId: accInfo.accountId,
            tokens: tokenInfo.id
        });
        if (balances.length > 0) {
            return ethers.BigNumber.from(balances[0].total);
        }
        return ethers.BigNumber.from(0);
    }

    public async transferToken(
        token: string,
        to: string,
        value: string,
        transactionRequest?: LoopringSendTokenRequest
    ): Promise<TransferResponse | undefined> {
        const tokenInfo = chains.getTokenByChain(this.internalId, token);
        if (!tokenInfo) {
            throw new Error(`${token} token not found`);
        }
        const userApi = new UserAPI({
            chainId: Number(this.chainConfig.networkId)
        });
        const fromAddress = this.L1Wallet.address;
        const { accInfo } = await this.client.getAccount({ owner: fromAddress });
        if (!accInfo) {
            throw Error('account unlocked')
        }
        const providerChain = chains.getChainInfo(this.chainConfig.networkId);
        if (!providerChain || !providerChain.rpc || providerChain.rpc.length <= 0) {
            throw new Error('LoopringAccount not config rpc');
        }
        const provider = new PrivateKeyProvider(this.privateKey, providerChain?.rpc[0]);
        const web3 = new Web3(provider);
        const { exchangeInfo } = await this.client.getExchangeInfo();
        const eddsaKey = await generateKeyPair({
            web3,
            address: accInfo.owner,
            keySeed: accInfo.keySeed,
            walletType: ConnectorNames.Unknown,
            chainId: Number(this.chainConfig.networkId),
        })
        const { apiKey } = await userApi.getUserApiKey(
            {
                accountId: accInfo.accountId,
            },
            eddsaKey.sk
        )
        if (!apiKey) {
            throw Error('Get Loopring ApiKey Error')
        }
        // step 3 get storageId
        const storageId = await userApi.getNextStorageId(
            {
                accountId: accInfo.accountId,
                sellTokenId: Number(tokenInfo.id)
            },
            apiKey
        )
        const sendNonce = storageId.offchainId;
        const ts = Math.round(new Date().getTime() / 1000) + 30 * 86400
        // step 4 transfer
        const OriginTransferRequestV3 = {
            exchange: exchangeInfo.exchangeAddress,
            payerAddr: fromAddress,
            payerId: accInfo.accountId,
            payeeAddr: to,
            payeeId: 0,
            storageId: sendNonce,
            token: {
                tokenId: tokenInfo.id,
                volume: value,
            },
            maxFee: {
                tokenId: transactionRequest?.feeTokenId || 0,
                volume: transactionRequest?.maxFee || '940000000000000',
            },
            validUntil: ts,
            memo: transactionRequest?.memo,
        }
        const transactionResult = await userApi.submitInternalTransfer({
            request: <any>OriginTransferRequestV3,
            web3: web3 as any,
            chainId: Number(this.chainConfig.networkId),
            walletType: ConnectorNames.Unknown,
            eddsaKey: eddsaKey.sk,
            apiKey: apiKey,
            isHWAddr: false,
        })
        this.logger.info('transfer response:', transactionResult);
        if (transactionResult) {
            return {
                hash: transactionResult['hash'],
                to: to,
                from: fromAddress,
                nonce: transactionResult['storageId'],
                token: token,
                data: transactionRequest?.memo,
                value: ethers.BigNumber.from(value),
            };
        }
    }

    public async sendCollectionGetParameters(order: SwapOrder) {
        return {
            memo: order.calldata.nonce
        }
    }
}
