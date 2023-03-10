import { ethers } from 'ethers';
import { ImmutableX, Config } from '@imtbl/core-sdk';
import { createStarkSigner } from '@imtbl/core-sdk';
import OrbiterAccount from './orbiterAccount';
import { TransactionRequest, TransferResponse } from './IAccount';
import { generateLegacyStarkPrivateKey } from '@imtbl/core-sdk';
import { equals } from 'orbiter-chaincore/src/utils/core';
export default class IMXAccount extends OrbiterAccount {
    private L1Wallet: ethers.Wallet;
    private client: ImmutableX;
    constructor(
        protected internalId: number,
        protected privateKey: string
    ) {
        super(internalId, privateKey);
        const L1Provider = ethers.getDefaultProvider(internalId === 8 ? "mainnet" : "goerli");
        this.L1Wallet = new ethers.Wallet(this.privateKey).connect(L1Provider);
        this.client = new ImmutableX(internalId === 8 ? Config.PRODUCTION : Config.SANDBOX);
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
            return await this.getTokenBalance(this.chainConfig.nativeCurrency.symbol, address);
        }
    }
    public async getTokenBalance(token: string, address?: string): Promise<ethers.BigNumber> {
        const result = await this.client.getBalance({
            owner: address || this.L1Wallet.address,
            address: token
        });
        return ethers.BigNumber.from(result.balance);
    }

    public async transferToken(
        token: string,
        to: string,
        value: string,
        transactionRequest?: TransactionRequest
    ): Promise<TransferResponse | undefined> {
        const unsignedTransferRequest: any = {
            type: '',
            receiver: to,
            amount: value, // Denominated in wei
        }
        if (equals(this.chainConfig.nativeCurrency.address, token)) {
            unsignedTransferRequest.type = 'ETH';
        } else {
            unsignedTransferRequest.type = 'ERC20';
            unsignedTransferRequest.tokenAddress = token;
        }
        const starkKey = await generateLegacyStarkPrivateKey(this.L1Wallet);
        const starkSigner = await createStarkSigner(starkKey);
        const walletConnection: any = { ethSigner: this.L1Wallet, starkSigner };
        const response = await this.client.transfer(walletConnection, unsignedTransferRequest);
        this.logger.info('transfer response:', response);
        return {
            hash: String(response.transfer_id),
            from: this.L1Wallet.address,
            to,
            value: ethers.BigNumber.from(value),
            nonce: 0,
            token
        };
    }
}

