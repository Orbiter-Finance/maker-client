import { BigNumber } from 'bignumber.js';
import { ethers } from 'ethers';
import { chains } from 'orbiter-chaincore';
import * as zksync from 'zksync';
import NonceManager from '../lib/nonce';
import { sign_musig } from 'zksync-crypto'
import ZKSpaceSDK from '../lib/zkspace';
import { getNonceCacheStore } from '../utils/caching';
import { HttpGet, HttpPost } from '../utils/request';
import OrbiterAccount from './orbiterAccount';
import { TransactionRequest, TransactionResponse, TransferResponse } from './IAccount';
export const RPC_NETWORK: { [key: string]: number } = {};
export default class ZKSpaceAccount extends OrbiterAccount {
    private nonceManager: NonceManager;
    private wallet: ZKSpaceSDK;
    constructor(
        protected internalId: number,
        protected privateKey: string
    ) {
        super(internalId, privateKey);
        const l1Wallet = new ethers.Wallet(this.privateKey);
        this.wallet = new ZKSpaceSDK(internalId, privateKey);
        this.nonceManager = new NonceManager(l1Wallet.address, async () => {
            const account = await this.wallet.getAccountInfo();
            const nonce = account["nonce"];
            return Number(nonce);
        }, {
            store: getNonceCacheStore(`${internalId}-${l1Wallet.address}`)
        });
    }
    public async transfer(
        to: string,
        value: string,
        transactionRequest?: ethers.providers.TransactionRequest
    ): Promise<TransferResponse | undefined> {
        return await this.transferToken(String(this.chainConfig.nativeCurrency.address), to, value, transactionRequest);
    }

    public async getBalance(address?: string): Promise<ethers.BigNumber> {
        return await this.getTokenBalance(Number(this.chainConfig.nativeCurrency.id), address);
    }
    public async getTokenBalance(tokenOrId: string | number, address?: string): Promise<ethers.BigNumber> {
        const tokenInfo = await chains.getTokenByChain(Number(this.chainConfig.internalId), tokenOrId);
        if (!tokenInfo) {
            throw new Error('Token information does not exist');
        }
        address = address || this.wallet.getAddress();
        const result = await this.wallet.getBalances(address);
        if (result.success && result.data) {
            const balances = result.data.balances.tokens;
            const item = balances.find(row => row.id === tokenInfo.id);
            if (item) {
                const value = new BigNumber(item.amount).multipliedBy(10 ** tokenInfo.decimals);
                return ethers.BigNumber.from(value.toString());
            }

        }
        return ethers.BigNumber.from(0);
    }

    public async transferToken(
        tokenOrId: string | number,
        to: string,
        value: string,
        transactionRequest?: TransactionRequest
    ): Promise<TransferResponse | undefined> {
        const tokenInfo = await chains.getTokenByChain(Number(this.chainConfig.internalId), tokenOrId);
        if (!tokenInfo) {
            throw new Error('Token information does not exist');
        }
        let feeNum = await this.wallet.getAccountTransferFee();
        const transferValue =
            zksync.utils.closestPackableTransactionAmount(value);
        const feeTokenId = 0;
        // TODO:fix goerli fee  error Incorrect calculation of fee
        if (Number(this.chainConfig.internalId) === 512) {
            feeNum = feeNum * 12;
        }
        // feeNum = 0.0012;
        const fee = ethers.BigNumber.from(new BigNumber(feeNum).multipliedBy(10 ** 18).toFixed(0));
        const { nonce, submit, rollback } = await this.nonceManager.getNextNonce();
        try {
            const result = await this.wallet.sendTransaction(to, {
                feeTokenId,
                tokenId: Number(tokenInfo.id),
                nonce,
                fee,
                value: transferValue
            });
            submit();
            return result as TransferResponse;
        } catch (error) {
            this.logger.error('sendTransaction error', error);
            rollback();
        }

    }
}

