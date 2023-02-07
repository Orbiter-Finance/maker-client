import { BigNumber } from 'bignumber.js';
import { ethers } from 'ethers';
import { chains } from 'orbiter-chaincore';
import * as zksync from 'zksync';
import NonceManager from '../lib/nonce';
import ZKSpaceSDK from '../lib/zkspace';
import { getNonceCacheStore } from '../utils/caching';
import { HttpGet, HttpPost } from '../utils/request';
import OrbiterAccount from './Account';
import { TransactionRequest, TransactionResponse, TransferResponse } from './IAccount';
export const RPC_NETWORK: { [key: string]: number } = {};
export default class ZKSpaceAccount extends OrbiterAccount {
    private nonceManager: NonceManager;
    private wallet:ZKSpaceSDK;
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
    public transfer(
        to: string,
        value: string,
        transactionRequest?: ethers.providers.TransactionRequest
    ): Promise<TransferResponse> {
        throw new Error('Method not implemented.');
    }

    public async getBalance(address?: string): Promise<ethers.BigNumber> {
        return await this.getTokenBalance(0, address);
    }
    public async getTokenBalance(tokenOrId: string | number, address?: string): Promise<ethers.BigNumber> {
        const tokenInfo = await chains.getTokenByChain(Number(this.chainConfig.internalId), tokenOrId);
        if (!tokenInfo) {
            throw new Error('Token information does not exist');
        }
        const account = await this.wallet.getAccountInfo();
        address = address || account.address;
        const result = await HttpGet(`${this.chainConfig.api.url}/account/${address}/balances`);
        if (result.success && result.data) {
            const balances = result.data.balances.tokens;
            const item = balances.find(row => row.id === tokenInfo.id);
            const value = new BigNumber(item.amount).multipliedBy(10 ** tokenInfo.decimals);
            return ethers.BigNumber.from(value.toString());
        }
        return ethers.BigNumber.from(0);
    }



    public async transferToken(
        tokenOrId: string | number,
        to: string,
        value: string,
        transactionRequest?: TransactionRequest
    ): Promise<TransferResponse | undefined> {
        const account:any = await this.wallet.getAccountInfo();
        if (!account) {
            throw new Error('account not found')
        }
        const tokenInfo = await chains.getTokenByChain(Number(this.chainConfig.internalId), tokenOrId);
        if (!tokenInfo) {
            throw new Error('Token information does not exist');
        }
        const fee = await this.wallet.getAccountTransferFee();
        console.log(fee, '=====feee');
        const transferValue =
            zksync.utils.closestPackableTransactionAmount(value);
        const feeTokenId = 0;
        const transferFee = zksync.utils.closestPackableTransactionFee(
            ethers.utils.parseUnits(fee.toString(), 18)
        )
        // prod = 13
        const zksNetworkID = 10;
        const sendNonce = 0;
        const msgBytes = ethers.utils.concat([
            '0x05',
            zksync.utils.numberToBytesBE(account.id, 4),
            account.address,
            to,
            zksync.utils.numberToBytesBE(Number(tokenInfo.id), 2),
            zksync.utils.packAmountChecked(transferValue),
            zksync.utils.numberToBytesBE(feeTokenId, 1),
            zksync.utils.packFeeChecked(transferFee),
            zksync.utils.numberToBytesBE(zksNetworkID, 1),
            zksync.utils.numberToBytesBE(sendNonce, 4),
        ])
        // const signaturePacked = sign_musig(privateKey, msgBytes)
        // const pubKey = ethers.utils
        //     .hexlify(signaturePacked.slice(0, 32))
        //     .substr(2)
        // const l2Signature = ethers.utils
        //     .hexlify(signaturePacked.slice(32))
        //     .substr(2)
        // const tx = {
        //     accountId: accountInfo.id,
        //     to: toAddress,
        //     tokenSymbol: tokenInfo.symbol,
        //     tokenAmount: ethers.utils.formatUnits(
        //         transferValue,
        //         tokenInfo.decimals
        //     ),
        //     feeSymbol: 'ETH',
        //     fee: fee.toString(),
        //     zksNetworkID,
        //     nonce: result_nonce,
        // }
        // const l2Msg =
        //     `Transfer ${tx.tokenAmount} ${tx.tokenSymbol}\n` +
        //     `To: ${tx.to.toLowerCase()}\n` +
        //     `Chain Id: ${tx.zksNetworkID}\n` +
        //     `Nonce: ${tx.nonce}\n` +
        //     `Fee: ${tx.fee} ${tx.feeSymbol}\n` +
        //     `Account Id: ${tx.accountId}`
        // const ethSignature = await wallet.signMessage(l2Msg)
        // const txParams = {
        //     type: 'Transfer',
        //     accountId: accountInfo.id,
        //     from: makerAddress,
        //     to: toAddress,
        //     token: tokenId,
        //     amount: transferValue.toString(),
        //     feeToken: feeTokenId,
        //     fee: transferFee.toString(),
        //     chainId: zksNetworkID,
        //     nonce: result_nonce,
        //     signature: {
        //         pubKey: pubKey,
        //         signature: l2Signature,
        //     },
        // }
        // const req = {
        //     signature: {
        //         type: 'EthereumSignature',
        //         signature: ethSignature,
        //     },
        //     fastProcessing: false,
        //     tx: txParams,
        // }

        return undefined;
        // const chainConfig = chains.getChainInfo(this.internalId);
        // const { wallet } = await this.getL2Wallet();
        // const { nonce, submit, rollback } = await this.nonceManager.getNextNonce();
        // const amount = zksync.utils.closestPackableTransactionAmount(value);
        // let response;
        // try {
        //     response = await wallet.syncTransfer({
        //         to,
        //         token,
        //         nonce,
        //         amount,
        //     });
        //     console.log('zksync response', response);
        //     submit();
        // } catch (error) {
        //     this.logger.error('rollback nonce:', error);
        //     rollback()
        //     throw error;
        // }
        // if (response) {
        //     response.awaitReceipt().then(tx => {
        //         this.logger.info(`zkSync ${this.chainConfig.name} sendTransaction waitForTransaction:`, tx)
        //     }).catch(err => {
        //         this.logger.error(`zkSync ${this.chainConfig.name} sendTransaction Error:`, err)
        //     })
        // }
        // const txData = response.txData.tx;
        // return {
        //     hash: response.txHash,
        //     from: wallet.address(),
        //     to,
        //     fee: ethers.BigNumber.from(txData.fee),
        //     value: ethers.BigNumber.from(value),
        //     nonce: txData.nonce,
        //     internalId: Number(chainConfig?.internalId)
        // };
    }
}

