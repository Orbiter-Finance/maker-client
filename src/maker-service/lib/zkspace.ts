import { ethers } from "ethers";
import { chains } from "orbiter-chaincore";
import { IChainConfig } from "orbiter-chaincore/src/types";
import { private_key_to_pubkey_hash } from 'zksync-crypto'
import { HttpGet, HttpPost } from "../utils/request";
import * as zksync from 'zksync';
import BigNumber from "bignumber.js";
import { getQuotationPrice } from "../service/quotation";
import { ZKSpaceSendTokenRequest } from "../account/IAccount";
import { sign_musig } from 'zksync-crypto'

export default class ZKSpaceSDK {
    public chainConfig!: IChainConfig;
    public L1Wallet: ethers.Wallet;
    constructor(private internalId: number, privateKey: string) {
        const chainConfig = chains.getChainInfo(internalId);
        if (!chainConfig) {
            throw new Error(`${internalId} Chain Config not found`);
        }
        this.chainConfig = chainConfig;
        this.L1Wallet = new ethers.Wallet(privateKey);
    }
    async getAccountInfo() {
        try {
            const L1Wallet = this.L1Wallet;
            const { data } = await HttpGet(`${this.chainConfig.api.url}/account/${L1Wallet.address}/info`);
            const account = {
                ...data
            };
            const msg =
                'Access ZKSwap account.\n\nOnly sign this message for a trusted client!'
            const signature = await L1Wallet.signMessage(msg)
            const seed = ethers.utils.arrayify(signature)
            const key = await zksync.crypto.privateKeyFromSeed(seed)
            if (
                account.pub_key_hash ==
                'sync:0000000000000000000000000000000000000000' || account.id === 0
            ) {
                await this.registerAccount(account, key)
            }
            return { ...account, key, address: L1Wallet.address };
        } catch (error: any) {
            throw new Error(`getAccountInfo error ${error.message}`)
        }
    }
    getAddress() {
        return this.L1Wallet.address;
    }
    async registerAccount(
        accountInfo: any,
        privateKey: Uint8Array
    ) {
        try {
            const L1Wallet = this.L1Wallet;
            const pubKeyHash = ethers.utils
                .hexlify(private_key_to_pubkey_hash(privateKey))
                .substr(2)

            const hexlifiedAccountId = toHex(accountInfo.id, 4)

            const hexlifiedNonce = toHex(accountInfo.nonce, 4)

            // Don't move here any way and don't format it anyway!!!
            let resgiterMsg = `Register ZKSwap pubkey:

${pubKeyHash}
nonce: ${hexlifiedNonce}
account id: ${hexlifiedAccountId}

Only sign this message for a trusted client!`
            const registerSignature = await L1Wallet.signMessage(resgiterMsg)
            const result = await HttpPost(`${this.chainConfig.api.url}/tx`, {
                signature: null,
                fastProcessing: null,
                extraParams: null,
                tx: {
                    account: L1Wallet.address,
                    accountId: accountInfo.id,
                    ethSignature: registerSignature,
                    newPkHash: `sync:` + pubKeyHash,
                    nonce: 0,
                    type: 'ChangePubKey',
                },
            }, {
                'zk-account': L1Wallet.address,
            });
            if (result['success']) {
                return result;
            }
            throw new Error(`registerAccount: ${result.error.message}`);
        } catch (error) {
            throw error;
        }
    }
    async getAccountTransferFee() {
        const L1Wallet = this.L1Wallet;
        const { data } = await HttpGet(`${this.chainConfig.api.url}/account/${L1Wallet.address}/fee`);
        const ethPrice = await getQuotationPrice("1", "ETH", "USD") || 2000;
        const gasFee = new BigNumber(data.transfer).dividedBy(
            new BigNumber(ethPrice)
        )
        const gasFee_fix = gasFee.decimalPlaces(6, BigNumber.ROUND_UP)
        return Number(gasFee_fix)
    }
    async getBalances(address: string) {
        const result = await HttpGet(`${this.chainConfig.api.url}/account/${address}/balances`);
        return result
    }
    async sendTransaction(to: string,
        transactionRequest: ZKSpaceSendTokenRequest) {
        // prod = 13 goerli = 129 rinkeby = 133
        const account: any = await this.getAccountInfo();
        if (!account) {
            throw new Error('account not found')
        }
        const zksNetworkID = Number(this.chainConfig.networkId);
        const feeToken = chains.getTokenByChain(this.internalId, transactionRequest.feeTokenId);
        if (!feeToken) {
            throw new Error('feeToken not found')
        }
        const sendToken = chains.getTokenByChain(this.internalId, transactionRequest.tokenId);
        if (!sendToken) {
            throw new Error('sendToken not found')
        }
        const sendNonce = transactionRequest.nonce || account.nonce;
        const fromAddress = this.L1Wallet.address;
        const sendValue = ethers.BigNumber.from(transactionRequest.value?.toString());
        const sendFee = zksync.utils.closestPackableTransactionFee(
            transactionRequest.fee
        )
        const msgBytes = ethers.utils.concat([
            '0x05',
            zksync.utils.numberToBytesBE(account.id, 4),
            fromAddress,
            to,
            zksync.utils.numberToBytesBE(Number(sendToken.id), 2),
            zksync.utils.packAmountChecked(sendValue),
            zksync.utils.numberToBytesBE(Number(feeToken.id), 1),
            zksync.utils.packFeeChecked(sendFee),
            zksync.utils.numberToBytesBE(zksNetworkID, 1),
            zksync.utils.numberToBytesBE(sendNonce, 4),
        ])
        const signaturePacked = sign_musig(account.key, msgBytes)
        const pubKey = ethers.utils
            .hexlify(signaturePacked.slice(0, 32))
            .substr(2)
        const l2Signature = ethers.utils
            .hexlify(signaturePacked.slice(32))
            .substr(2)
        const l2Msg =
            `Transfer ${new BigNumber(sendValue.toString()).dividedBy(10 ** sendToken.decimals)} ${sendToken.symbol}\n` +
            `To: ${to.toLowerCase()}\n` +
            `Chain Id: ${zksNetworkID}\n` +
            `Nonce: ${sendNonce}\n` +
            `Fee: ${new BigNumber(sendFee.toString()).dividedBy(10 ** feeToken.decimals)} ${feeToken.symbol}\n` +
            `Account Id: ${account.id}`
        const ethSignature = await this.L1Wallet.signMessage(l2Msg);
        const tx = {
            type: 'Transfer',
            accountId: account.id,
            from: fromAddress,
            to: to,
            token: sendToken.id,
            amount: sendValue.toString(),
            feeToken: feeToken.id,
            fee: sendFee.toString(),
            chainId: zksNetworkID,
            nonce: sendNonce,
            signature: {
                pubKey: pubKey,
                signature: l2Signature,
            },
        }
        const result = await HttpPost(`${this.chainConfig.api.url}/tx`, {
            tx,
            signature: {
                type: 'EthereumSignature',
                signature: ethSignature,
            },
            fastProcessing: false
        });
        if (!result["success"]) {
            throw new Error(result.error.message);
        }
        return {
            from: fromAddress,
            to,
            hash: `0x${result["data"].substr(8)}`,
            nonce: sendNonce,
            value: sendValue,
            fee: sendFee,
            token: sendToken.address
        }
    }
}


export function toHex(num, length) {
    var charArray = ['a', 'b', 'c', 'd', 'e', 'f']
    let strArr = Array(length * 2).fill('0')
    var i = length * 2 - 1
    while (num > 15) {
        var yushu = num % 16
        if (yushu >= 10) {
            let index = yushu % 10
            strArr[i--] = charArray[index]
        } else {
            strArr[i--] = yushu.toString()
        }
        num = Math.floor(num / 16)
    }

    if (num != 0) {
        if (num >= 10) {
            let index = num % 10
            strArr[i--] = charArray[index]
        } else {
            strArr[i--] = num.toString()
        }
    }
    strArr.unshift('0x')
    var hex = strArr.join('')
    return hex
}