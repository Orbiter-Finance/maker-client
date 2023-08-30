import { TransactionRequest, TransferResponse } from './IAccount';
import IAccount from './IAccount';
import { IChainConfig } from 'src/config/chainsConfig.service';
import { SwapOrder, TransferAmountTransaction } from 'src/transfer/sequencer/sequencer.interface';
import { createLoggerByName } from '../lib/logger';
import winston from 'winston'
import { StoreService } from '../transfer/store/store.service'
export default class OrbiterAccount extends IAccount {
    public logger!: winston.Logger;
    public store: StoreService;
    constructor(
        protected readonly chainConfig: IChainConfig
    ) {
        super(chainConfig.chainId);
        this.logger = createLoggerByName(`${this.chainConfig.chainId}`);
        this.store = new StoreService(chainConfig.chainId)
    }
    async connect(_privateKey: string) {
        return this;
    }
    public transfer(_to: string, value: bigint, transactionRequest?: TransactionRequest | any): Promise<TransferResponse | undefined> {
        throw new Error('Method not implemented.');
    }
    public transfers(_to: string[], value: bigint[], transactionRequest?: TransactionRequest | any): Promise<TransferResponse | undefined> {
        throw new Error('Method not implemented.');
    }
    public transferTokens(token: string, _to: string[], value: bigint[], transactionRequest?: TransactionRequest | any): Promise<TransferResponse | undefined> {
        throw new Error('Method not implemented.');
    }
    public getBalance(to?: string | undefined, token?: string | undefined): Promise<bigint> {
        throw new Error('Method not implemented.');
    }
    public getTokenBalance(token: string, to: string): Promise<bigint> {
        throw new Error('Method not implemented.');
    }
    public transferToken(token: string, to: string, value: bigint, transactionRequest?: TransactionRequest | any): Promise<TransferResponse | undefined> {
        throw new Error('Method not implemented.');
    }
    public waitForTransactionConfirmation(transactionHash: string): Promise<any> {
        throw new Error('waitForTransactionConfirmation Method not implemented.');
    }
    public async pregeneratedRequestParameters(orders: TransferAmountTransaction | TransferAmountTransaction[], transactionRequest: TransactionRequest = {}) {
        if (Array.isArray(orders)) {
            transactionRequest.serialId = [];
            for (const order of orders) {
                transactionRequest.serialId.push(order.sourceId);
            }
        } else {
            transactionRequest.serialId = orders.sourceId;
        }
        return transactionRequest
    }
}
