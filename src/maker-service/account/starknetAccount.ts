import { BigNumberish, ethers } from 'ethers';
import NonceManager from '../lib/nonce';
import { Account, Contract, defaultProvider, ec, json, number, Provider, stark, hash, uint256 } from 'starknet';
import { IPoolTx, TransactionRequest, TransferResponse } from './IAccount';
import OrbiterAccount from './orbiterAccount';
import { getNonceCacheStore } from '../utils/caching';
import { StarknetErc20ABI } from '../abi';
import { telegramBot } from "../lib/telegram";

export default class StarknetAccount extends OrbiterAccount {
    public account: Account;
    private nonceManager: NonceManager;
    constructor(
        protected internalId: number,
        protected privateKey: string,
        address: string
    ) {
        super(internalId, privateKey);
        // get address
        this.account = new Account(
            this.getProviderV4(),
            address,
            ec.getKeyPair(this.privateKey)
        )
        this.nonceManager = new NonceManager(address, async () => {
            const nonce = await this.account.getNonce();
            return Number(nonce);
        }, {
            store: getNonceCacheStore(`${internalId}-${address}`)
        });
        this.accountAddress = this.account.address.toLowerCase();
    }
    public async transfer(
        to: string,
        value: string,
        transactionRequest?: TransactionRequest
    ): Promise<TransferResponse | undefined> {
        const mainToken = await this.chainConfig.nativeCurrency.address;
        return await this.transferToken(mainToken, to, value, transactionRequest);
    }
    public getProviderV4() {
        const rpcFirst = this.chainConfig.rpc[0];
        const provider = rpcFirst === undefined ?
            defaultProvider :
            new Provider({
                sequencer: {
                    network: <any>(Number(this.chainConfig.internalId) === 4 ? 'mainnet-alpha' : 'georli-alpha'), // for testnet you can use defaultProvider
                }, rpc: { nodeUrl: rpcFirst }
            });
        return provider;
    }
    public async getBalance(address?: string, token?: string): Promise<ethers.BigNumber> {
        if (token && token != this.chainConfig.nativeCurrency.address) {
            return await this.getTokenBalance(token, address);
        } else {
            return await this.getTokenBalance(this.chainConfig.nativeCurrency.address, address);
        }
    }
    public async getTokenBalance(token: string, address?: string): Promise<ethers.BigNumber> {
        if (!token) {
            return ethers.BigNumber.from(0);
        }
        const provider = this.getProviderV4()
        const erc20 = new Contract(StarknetErc20ABI, token, provider)
        // erc20.connect(this.account);
        const balanceBeforeTransfer = await erc20.balanceOf(address || this.account.address);
        return ethers.BigNumber.from(number.toBN(balanceBeforeTransfer.balance.low).toString());
    }
    public async transferToken(
        token: string,
        to: string,
        value: string,
        transactionRequest?: TransactionRequest
    ): Promise<TransferResponse | undefined> {
        const nonceInfo = await this.nonceManager.getNextNonce();
        const { nonce } = nonceInfo;
        return await this.handleTransfer([], {
            contractAddress: token,
            entrypoint: 'transfer',
            nonce,
            calldata: stark.compileCalldata({
                recipient: to,
                amount: getUint256CalldataFromBN(value)
            })
        }, nonceInfo);
    }

    public async transferMultiToken(
        params: IPoolTx[],
        retry?: any
    ): Promise<TransferResponse | undefined> {
        const transferParams: IPoolTx[] = JSON.parse(JSON.stringify(params));
        const nonceInfo = await this.nonceManager.getNextNonce();
        const { nonce } = nonceInfo;
        const invocationList: any[] = [];
        for (const param of transferParams) {
            const { token, to, value } = param;
            invocationList.push({
                contractAddress: token,
                entrypoint: 'transfer',
                nonce,
                calldata: stark.compileCalldata({
                    recipient: to,
                    amount: getUint256CalldataFromBN(value)
                })
            });
        }
        this.logger.info(`starknet transfer multi: ${invocationList.length}`);
        return await this.handleTransfer(transferParams, invocationList, nonceInfo, retry);
    }

    private async handleTransfer(params: IPoolTx[], invocation, nonceInfo, retry?) {
        const { nonce, submit, rollback } = nonceInfo;
        const provider = this.getProviderV4();
        let maxFee = number.toBN(0.009 * 10 ** 18);
        try {
            const { suggestedMaxFee } = await this.account.estimateFee(invocation);
            if (suggestedMaxFee.gt(maxFee))
                maxFee = suggestedMaxFee;
        } catch (error) {
            this.logger.error('starknet estimateFee error:', error);
        }
        try {
            this.logger.info(`starknet_nonce: ${nonce}, maxFee: ${maxFee}`);
            const executeHash = await this.account.execute(
                invocation, undefined, {
                    nonce,
                    maxFee
                }
            );
            this.logger.info(`starknet transfer fromHash: ${JSON.stringify(params.map(item => item.id))}`);
            this.logger.info(`starknet transfer toHash: ${executeHash?.transaction_hash}`);
            // console.log(`Waiting for Tx to be Accepted on Starknet - Transfer...`, executeHash.transaction_hash);
            provider.waitForTransaction(executeHash.transaction_hash).then(async (tx) => {
                this.logger.info(`waitForTransaction SUCCESS:`, tx);
            }, ({ response }) => {
                const { tx_status, tx_failure_reason } = response;
                if (tx_status === 'REJECTED' && tx_failure_reason.error_message.includes('Invalid transaction nonce. Expected: ')) {
                    const nonce = tx_failure_reason.error_message.split('Expected: ')[1].split(',')[0];
                    this.nonceManager.setNonce(Number(nonce));
                    this.logger.info(`Starknet reset nonce:${nonce}`);
                }
                telegramBot.sendMessage('starknet_reject', `waitForTransaction reject: hash ${executeHash.transaction_hash} respone ${JSON.stringify(response)}`);
                this.logger.error(`waitForTransaction reject:`, { hash: executeHash.transaction_hash, response });
            }).catch(err => {
                this.logger.error(`waitForTransaction error:`, err);
            })
            submit()
            return {
                hash: executeHash.transaction_hash,
                from: this.account.address,
                to: "",
                nonce: nonce,
            };
        } catch (error: any) {
            this.logger.error(`rollback nonce:${error.message}`);
            if (retry) {
                if (error.message.indexOf('StarkNet Alpha throughput limit reached') !== -1 ||
                    error.message.indexOf('Bad Gateway') !== -1) {
                    retry(params.map(item => item.id));
                } else if (error.message.indexOf('Invalid transaction nonce. Expected:') !== -1
                    && error.message.indexOf('got:') !== -1) {
                    const arr: string[] = error.message.split(', got: ');
                    const nonce1 = arr[0].replace(/[^0-9]/g, "");
                    const nonce2 = arr[1].replace(/[^0-9]/g, "");
                    if (Number(nonce) !== Number(nonce1) && Number(nonce) !== Number(nonce2)) {
                        this.logger.error(`starknet sequencer error: ${nonce} != ${nonce1}, ${nonce} != ${nonce2}`);
                        retry(params.map(item => item.id));
                    }
                }
            }
            rollback();
            throw error;
        }
    }

    public static async calculateContractAddressFromHash(privateKey: string) {

        const starkKeyPair = ec.getKeyPair(privateKey);
        const starkKeyPub = ec.getStarkKey(starkKeyPair);
        // class hash of ./Account.json. 
        // Starknet.js currently doesn't have the functionality to calculate the class hash
        const precalculatedAddress = hash.calculateContractAddressFromHash(
            starkKeyPub, // salt
            "0x25ec026985a3bf9d0cc1fe17326b245dfdc3ff89b8fde106542a3ea56c5a918",
            stark.compileCalldata({
                implementation: "0x1a7820094feaf82d53f53f214b81292d717e7bb9a92bb2488092cd306f3993f",
                selector: hash.getSelectorFromName("initialize"),
                calldata: stark.compileCalldata({ signer: starkKeyPub, guardian: "0" }),
            }),
            0
        );
        // console.log("pre-calculated address: ", precalculatedAddress);
        return precalculatedAddress;
    }
}
export function getUint256CalldataFromBN(bn: BigNumberish) {
    return { type: 'struct' as const, ...uint256.bnToUint256(String(bn)) }
}