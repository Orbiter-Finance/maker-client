import { Inject, Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import { isAddress } from 'ethers';
import BigNumber from 'bignumber.js';
import { ChainConfigService } from 'src/config/chainConfig.service';
import { ConfigService } from '@nestjs/config';
import { equals, isEmpty } from 'src/utils';
import { ChainLinkService } from 'src/service/chainlink.service';
import { SwapOrder, SwapOrderType } from '../sequencer/sequencer.interface';
import { getMakerConfig } from 'src/config/makerConfig.service';
import { bridge_transaction } from '@prisma/client';
import { AccountFactoryService } from 'src/account/factory';

@Injectable()
export class ValidatorService {
    private logger = new Logger(ValidatorService.name);
    constructor(private chainConfigService: ChainConfigService,
        private chainLinkService: ChainLinkService, private configService: ConfigService, private readonly accountFactoryService: AccountFactoryService
    ) {
    }
    public transactionTimeValid(chainId: number, timestamp: number) {
        const timeout = Date.now() - dayjs(timestamp).valueOf();
        if (timeout >= getMakerConfig(`${chainId}.TransferTimeout`)) {
            return false; // 'Please collect manually if the transaction exceeds the specified time'
        }
        return true;
    }

    public async validSourceTx(tx: bridge_transaction) {
        if (!isEmpty(tx.targetId)) {
            return {
                errno: -1,
                errmsg: `${tx.sourceId} The remittance has been made or the data is incorrect(${tx.targetId})`
            }
        }
        if (tx.status != 1) {
            return {
                errno: -1,
                errmsg: `${tx.sourceId} status incorrect (${tx.status}/1)`
            }
        }
        const targetChain = this.chainConfigService.getChainInfo(tx.targetChain);
        if (!targetChain) {
            return {
                errno: -1,
                errmsg: `${tx.sourceId} targetChain not found ${tx.targetChain}`
            }
        }

        const targetChainToken = this.chainConfigService.getTokenBySymbol(tx.targetChain, tx.targetSymbol);
        if (isEmpty(targetChainToken)) {
            return {
                errno: -1,
                errmsg: `${tx.sourceId} targetChainToken not found ${tx.targetChain}-${tx.targetSymbol}`
            }
        }
        if (!tx.targetAmount) {
            return {
                errno: -1,
                errmsg: `${tx.sourceId} targetAmount not found`
            }
        }
        const sourceChainToken = this.chainConfigService.getTokenBySymbol(tx.sourceChain, tx.sourceSymbol);
        if (isEmpty(sourceChainToken)) {
            return {
                errno: -1,
                errmsg: `${tx.sourceId} sourceChainToken not found ${tx.sourceChain}-${tx.sourceSymbol}`
            }
        }

        if (!this.transactionTimeValid(tx.sourceChain, dayjs(tx.sourceTime).valueOf())) {
            return {
                errno: -1,
                errmsg: `${tx.sourceId} Please collect manually if the transaction exceeds the specified time`
            };
        }
        const account = this.accountFactoryService.createMakerAccount(
            tx.targetMaker,
            tx.targetChain
        );
        const serialRecord = await account.getSerialRecord(tx.sourceId);
        if (serialRecord) {
            return {
                errmsg: `verifyToTx ${tx.sourceId}  serialRecord ${serialRecord} exist`,
                errno: -1
            };
        }

        const swapOrder: SwapOrder = {
            chainId: tx.targetChain,
            hash: "",
            from: tx.targetMaker,
            to: tx.targetAddress,
            // token: '',
            symbol: tx.targetSymbol,
            value: tx.targetAmount,
            nonce: 0n,
            calldata: {
                id: tx.id,
                chainId: tx.sourceChain,
                nonce: tx.sourceNonce,
                hash: tx.sourceId.toLocaleLowerCase(),
                // token: fromToken.address,
                symbol: tx.sourceSymbol,
                value: tx.sourceAmount,
                // expectValue:tx.,
                timestamp: dayjs(tx.sourceTime).valueOf(),
                // slipPoint: 0,
            },
            type: SwapOrderType.None
        };
        swapOrder.type = SwapOrderType.UA;
        // if (swapOrder.type === SwapOrderType.None) {
        //     return {
        //         errno: -1,
        //         errmsg: `verifyFromTx ${swapOrder.type} type none `
        //     };
        // }
        return {
            errno: 0,
            data: swapOrder
        }
    }

    /**
     * Veify To Tx
     */
    public async verifyToTx(swapOrder: SwapOrder) {
        const privateKey = this.getSenderPrivateKey(swapOrder.from);
        if (isEmpty(privateKey)) {
            return {
                errmsg: `${swapOrder.from} private key no found`,
                errno: -1
            };
        }
        if (swapOrder.type === SwapOrderType.None) {
            return {
                errmsg: `${swapOrder.type} type none `,
                errno: -1
            };
        }
        if (!this.transactionTimeValid(swapOrder.calldata.chainId, swapOrder.calldata.timestamp)) {
            return {
                errmsg: `${swapOrder.calldata.hash} verifyToTx Please collect manually if the transaction exceeds the specified time`,
                errno: -1
            };
        }
        if (process.env['user.blacklist'] && process.env['user.blacklist'].includes(swapOrder.to.toLocaleLowerCase())) {
            return {
                errmsg: `${swapOrder.calldata.hash} The receiving address is a blacklist address`,
                errno: -1
            };
        }

        // valid from chain & from token
        const fromChainId = Number(swapOrder.calldata.chainId);
        const fromToken = this.chainConfigService.getTokenBySymbol(fromChainId, swapOrder.calldata.symbol);
        if (isEmpty(fromToken) || !fromToken) {
            return {
                errmsg: `${swapOrder.calldata.hash} ${swapOrder.calldata.symbol} fromToken not found`,
                errno: -1
            };
        }

        // 
        const toToken = this.chainConfigService.getTokenBySymbol(swapOrder.chainId, swapOrder.symbol)
        if (isEmpty(toToken) || !toToken) {
            return {
                errmsg: `${swapOrder.calldata.hash} ${swapOrder.symbol} toToken not found`,
                errno: -1
            };
        }
        // If the value difference between "from" and "to" is too large, intercept
        const fromValueMaxUint = new BigNumber(swapOrder.calldata.value.toString()).dividedBy(new BigNumber(10).pow(fromToken.decimals));
        const fromUSDValue = await this.chainLinkService.getChainLinkPrice(fromValueMaxUint.toString(), fromToken.symbol, 'usd');
        if (fromUSDValue.lte(0)) {
            return {
                errmsg: `${swapOrder.calldata.hash} Exchange rate not obtained FromToken ${fromToken.symbol}=>usd`,
                errno: -1
            };
        }

        const toValueMaxUint = new BigNumber(swapOrder.value.toString()).dividedBy(new BigNumber(10).pow(toToken.decimals));
        const toUSDValue = await this.chainLinkService.getChainLinkPrice(toValueMaxUint.toString(), toToken.symbol, 'usd');
        if (toUSDValue.lte(0)) {
            return {
                errmsg: `${swapOrder.calldata.hash} Exchange rate not obtained ToToken ${toToken.symbol}=>usd`,
                errno: -1
            };
        }
        const upRate = new BigNumber(toUSDValue).dividedBy(new BigNumber(fromUSDValue).multipliedBy(100));
        this.logger.debug(`SourceId = ${swapOrder.calldata.hash} fromUSDValue = ${fromUSDValue.toString()}, toUSDValue = ${toUSDValue.toString()}, upRate= ${upRate.toString()}`);
        if (upRate.gte(1.5)) {
            return {
                errmsg: `verifyToTx ${swapOrder.calldata.hash} There may be a risk of loss, and the transaction has been blocked (toValue ${toToken.symbol}:${toValueMaxUint.toString()},fromValue ${fromToken.symbol}:${fromValueMaxUint.toString()},upRate:${upRate.toString()})`,
                errno: -1
            };
        }
        const account = this.accountFactoryService.createMakerAccount(
            swapOrder.from,
            swapOrder.chainId
        );
        const serialRecord = await account.getSerialRecord(swapOrder.calldata.hash);
        if (serialRecord) {
            return {
                errmsg: `verifyToTx ${swapOrder.calldata.hash}  serialRecord ${serialRecord} exist`,
                errno: -1
            };
        }
        // check privateKey
        if (!this.checkSenderPrivateKey(swapOrder.from)) {
            return {
                errmsg: `verifyToTx ${swapOrder.from} private key no found`,
                errno: -1
            };
        }
        // TODO: find db data
        // const tx = await this.ctx.db.Transaction.findOne({
        //     attributes: ['status'],
        //     where: {
        //         hash: swapOrder.calldata.hash
        //     }
        // });
        // if (!tx) {
        //     logger.error(`verifyToTx ${swapOrder.calldata.hash} data not found`);
        //     return;
        // }
        // if (tx.status != 1) {
        //     logger.error(`verifyToTx ${swapOrder.calldata.hash} data status is not 1`);
        //     return;
        // }
        return {
            errno: 0,
            address: swapOrder.from,
            privateKey,
            token: toToken
        }
    }


    // public async verifyXVMCrossToken(swapOrder: SwapOrder): Promise<BigInt | undefined> {
    //     const logger = this.logger;
    //     if (swapOrder.type != SwapOrderType.CrossToken) {
    //         logger.error(`verifyXVMCrossToken ${swapOrder.calldata.hash} type error`);
    //         return undefined;
    //     }
    //     const fromToken = this.chainConfigService.getTokenBySymbol(swapOrder.calldata.chainId, swapOrder.calldata.symbol)
    //     if (isEmpty(fromToken) || !fromToken) {
    //         logger.error(`verifyToTx ${swapOrder.calldata.hash} fromToken not found`);
    //         return undefined;
    //     }
    //     const toToken = this.chainConfigService.getTokenBySymbol(swapOrder.chainId, swapOrder.symbol);
    //     if (isEmpty(toToken) || !toToken) {
    //         logger.error(`verifyToTx ${swapOrder.calldata.hash} ${swapOrder.symbol} toToken not found`);
    //         return undefined;
    //     }
    //     const fromDecimal = Number(fromToken.decimals);
    //     const destDecimal = Number(toToken.decimals);
    //     if (swapOrder.type === SwapOrderType.CrossToken) {
    //         const fromValue = new BigNumber(swapOrder.calldata.value.toString()).dividedBy(new BigNumber(10).pow(fromDecimal));
    //         const fromValuePriceValue = await this.chainLinkService.getChainLinkPrice(fromValue.toString(), fromToken.symbol, toToken.symbol);
    //         if (fromValuePriceValue.lte(0)) {
    //             logger.error(`${swapOrder.calldata.hash} Exchange rate not obtained currentPriceValue ${fromToken.symbol}=>${toToken.symbol}`);
    //             return undefined;
    //         }
    //         const expectValue = new BigNumber(swapOrder.value.toString()).dividedBy(new BigNumber(10).pow(destDecimal));
    //         if (fromValuePriceValue.gte(expectValue)) {
    //             return swapOrder.value;
    //         }
    //         // const expectToTokenValue = new BigNumber(swapOrder.calldata.expectValue || 0).dividedBy(new BigNumber(10).pow(destDecimal));
    //         const expectToTokenMinValue = expectValue.minus(expectValue.multipliedBy(swapOrder.calldata.slipPoint).dividedBy(10000));
    //         if (fromValuePriceValue.gt(expectToTokenMinValue)) {
    //             return BigInt(expectToTokenMinValue.minus(new BigNumber(10).pow(destDecimal)).toString());
    //         }
    //     }
    //     return undefined;
    // }
    public checkSenderPrivateKey(from: string) {
        return !isEmpty(this.getSenderPrivateKey(from));
    }
    public getSenderPrivateKey(from: string) {
        const privateKey = process.env[from.toLocaleLowerCase()] || this.configService.get[from.toLocaleLowerCase()];
        return privateKey;
    }
    public isSupportXVM(chainId: number): Boolean {
        const chain = this.chainConfigService.getChainInfo(chainId);
        if (chain && chain.xvmList) {
            return chain.xvmList.length > 0;
        }
        return false;
    }
}
