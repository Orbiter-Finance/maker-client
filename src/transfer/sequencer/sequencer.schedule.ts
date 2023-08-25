import { Token } from './../../config/chainConfig.service';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/sequelize';
import { Mutex } from 'async-mutex';
import { ChainConfigService } from 'src/config/chainConfig.service';
import { TransfersModel, BridgeTransactionModel } from 'src/models';
import { SequencerService } from './sequencer.service'
import { ValidatorService } from '../validator/validator.service'
import { MonitorState, SwapOrder, TransferAmountTransaction } from './sequencer.interface';
import { MakerConfigService, getMakerConfig } from 'src/config/makerConfig.service';
import { JSONStringify, arePropertyValuesConsistent, clone, equals, groupBy, isEmpty, sleep, uniq } from 'src/utils';
import { StoreService } from '../store/store.service';
import { Op } from 'sequelize';
import { AccountFactoryService } from 'src/account/factory';
import BigNumber from 'bignumber.js';
import { take } from 'lodash';
import OrbiterAccount from 'src/account/orbiterAccount';
import { TransactionSendBeforeError } from 'src/account/IAccount.interface';
import { createLoggerByName } from 'src/lib/logger';
@Injectable()
export class SequencerScheduleService {
    private readonly logger = createLoggerByName(SequencerService.name);
    private stores: Map<string, StoreService> = new Map(); // chainId + owner
    private storesState: { [key: string]: MonitorState } = {

    };
    constructor(private readonly chainConfigService: ChainConfigService, private readonly validatorService: ValidatorService, @InjectModel(TransfersModel) private transfersModel: typeof TransfersModel,
        @InjectModel(BridgeTransactionModel) private bridgeTransactionModel: typeof BridgeTransactionModel, private sequencerService: SequencerService,
        private makerConfig: MakerConfigService,
        private accountFactoryService: AccountFactoryService) {
        this.checkDBTransactionRecords();
        // this.validatorService.validatingValueMatches("ETH", "1", "ETH", "2")
    }
    @Cron('*/5 * * * * *')
    private checkDBTransactionRecords() {
        const owners = ['0xafcfbb382b28dae47b76224f24ee29be2c823648', '0xe4edb277e41dc89ab076a1f049f4a3efa700bce8']
        for (const chain of this.chainConfigService.getAllChains()) {
            for (const owner of owners) {
                // targetChainId + owner
                const key = `${chain.chainId}-${owner}`.toLocaleLowerCase();
                if (!this.stores.has(key)) {
                    this.stores.set(key, new StoreService(chain.chainId));
                }
                if (!this.storesState[key]) {
                    this.storesState[key] = {
                        lock: new Mutex(),
                        lastSubmit: Date.now(),
                    };
                }

                const store = this.stores.get(key);
                // read db history
                this.readDBTransactionRecords(store, owner).catch(error => {
                    this.logger.error(`checkDBTransactionRecords -> readDBTransactionRecords error`, error);
                })
            }
        }
    }
    private async readDBTransactionRecords(store: StoreService, owner: string) {
        const records = await this.bridgeTransactionModel.findAll({
            raw: true,
            attributes: ['id', 'transactionId', 'sourceId', 'targetId', 'sourceChain', 'targetChain', 'sourceAmount', 'targetAmount',
                'sourceMaker', 'targetMaker', 'sourceAddress', 'targetAddress', 'sourceSymbol', 'targetSymbol', 'sourceNonce', 'sourceToken', 'targetToken', 'responseMaker'],
            where: {
                status: 0,
                targetChain: store.chainId,
                sourceMaker: owner,
                // version: "2-0",
                id: {
                    [Op.gt]: store.lastId
                }
            }
        });
        if (records.length > 0) {
            for (const tx of records) {
                const result = await store.addTransactions(tx as any);
                this.logger.info(`${tx.sourceId} store addTransactions ${JSON.stringify(result)}`)
                if (+tx.id > store.lastId) {
                    store.lastId = +tx.id;
                }
            }
        }
    }
    @Cron('*/5 * * * * *')
    private checkStoreWaitSend() {
        const storeKeys = this.stores.keys();
        for (const k of storeKeys) {
            const store = this.stores.get(k);
            const wthData = store.getSymbolsWithData();
            if (wthData.length > 0) {
                this.checkStoreReadySend(k, store)
            }
        }
    }
    private async checkStoreReadySend(key: string, store: StoreService) {
        const batchTransferCount = this.makerConfig.get(`${store.chainId}.BatchTransferCount`) || 1;
        const lock: Mutex = this.storesState[key].lock;
        if (lock.isLocked()) {
            return;
        }
        lock.runExclusive(async () => {
            this.logger.debug(`checkStoreReadySend ${key}`);
            const wthData = store.getSymbolsWithData();
            for (const row of wthData) {
                const isBatchTransaction = row.size >= batchTransferCount && batchTransferCount > 1;
                if (isBatchTransaction) {
                    this.logger.debug(`checkStoreReadySend ${key} -> batchSendTransaction`);
                    await this.batchSendTransaction(row.id, store).catch(error => {
                        this.logger.error('checkStoreReadySend -> batchSendTransaction error', error.stack)
                    })
                } else {
                    this.logger.debug(`checkStoreReadySend ${key} -> singleSendTransaction`);
                    await this.singleSendTransaction(row.id, store).catch(error => {
                        this.logger.error('checkStoreReadySend -> singleSendTransaction error', error.stack)
                    })
                }
            }
            this.storesState[key].lastSubmit = Date.now();
        });
    }
    async batchSendTransaction(token: string, store: StoreService) {
        const transfers = await store.getTransactionsByToken(token);
        if (!arePropertyValuesConsistent<TransferAmountTransaction>(transfers, 'targetToken')) {
            throw new Error(`batchSendTransaction targetToken inconsistent`);
        }
        const { result, errors } = await this.validatorService.transactionGetPrivateKeys(store.chainId, token, transfers);
        if (isEmpty(result) && errors.length > 0) {
            this.logger.error(`${token} batchSendTransaction transactionGetPrivateKeys warn ${JSON.stringify(errors || {})}`);
            return;
        }
        const promiseMaps = Object.keys(result).map(sender => {
            const { account, transfers } = result[sender];
            if (transfers.length == 1) {
                const transfer: TransferAmountTransaction = transfers[0];
                return this.sequencerService.singleSendTransactionByTransfer(transfer.targetToken, store, transfer.sourceId);
            }
            if (transfers.length > 0) {
                return this.sequencerService.batchSendTransactionByTransfer(token, store, account, transfers);
            }
            return null;
        })
        return await Promise.all(promiseMaps)
    }

    async singleSendTransaction(token: string, store: StoreService) {
        const tokenTxList = await store.getTargetTokenTxIdList(token);
        for (const hash of tokenTxList) {
            this.sequencerService.singleSendTransactionByTransfer(token, store, hash);
        }
    }


}