import { ethers } from "ethers";
import { chains } from "orbiter-chaincore";
import { IChainConfig } from "orbiter-chaincore/src/types";
import { private_key_to_pubkey_hash } from 'zksync-crypto'
import { HttpGet, HttpPost } from "../utils/request";
import * as zksync from 'zksync';
import BigNumber from "bignumber.js";

export default class ZKSpaceSDK {
    public chainConfig!: IChainConfig;
    constructor(private internalId: number, private privateKey: string) {
        const chainConfig = chains.getChainInfo(internalId);
        if (!chainConfig) {
            throw new Error(`${internalId} Chain Config not found`);
        }
        this.chainConfig = chainConfig;
    }
    async getAccountInfo() {
        try {
            const { L1Wallet } = await this.getL2Wallet();
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
                data.pub_key_hash ==
                'sync:0000000000000000000000000000000000000000'
            ) {
                await this.registerAccount(account, key)
            }
            return { account, key, address: L1Wallet.address };
        } catch (error: any) {
            throw new Error(`getAccountInfo error ${error.message}`)
        }
    }
    private async getL2Wallet() {
        let l1Provider;
        let l2Provider;
        if (this.internalId === 12) {
            l1Provider = ethers.providers.getDefaultProvider('mainnet');
        } else if (this.internalId === 512) {
            l1Provider = ethers.providers.getDefaultProvider('goerli');
        }
        const L1Wallet = new ethers.Wallet(this.privateKey).connect(l1Provider);
        return { L1Wallet };
    }
    async address() {
        return await (await this.getL2Wallet()).L1Wallet.address;
    }
    async registerAccount(
        accountInfo: any,
        privateKey: Uint8Array
    ) {
        try {
            const { L1Wallet } = await this.getL2Wallet();
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
            return result;
        } catch (error) {
            throw error;
        }
    }
    async getAccountTransferFee() {
        const { L1Wallet } = await this.getL2Wallet();
        const { data } = await HttpGet(`${this.chainConfig.api.url}/account/${L1Wallet.address}/fee`);
        console.log(data, '========data');
        const ethPrice = 1 / 2000;
        const gasFee = new BigNumber(data.transfer).dividedBy(
            new BigNumber(ethPrice)
        )
        let gasFee_fix = gasFee.decimalPlaces(6, BigNumber.ROUND_UP)
        return Number(gasFee_fix)
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