import { Inject, Logger } from '@nestjs/common';
import { TransactionRequest, TransferResponse } from './IAccount';
import IAccount from './IAccount';
import { IChainConfig } from 'src/config/chainConfig.service';
import { Level } from 'level';
import { SwapOrder } from 'src/transfer/sequencer/sequencer.interface';
export default class OrbiterAccount extends IAccount {
    public logger = new Logger(OrbiterAccount.name);
    public levelDB: Level;
    constructor(
        protected readonly chainConfig: IChainConfig
    ) {
        super(+chainConfig.internalId);
        this.levelDB = new Level(`/Users/kakui/projects/maker-client/runtime/transfer/${chainConfig.internalId}`);
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
    public async paymentBefore(orders: SwapOrder | SwapOrder[], transactionRequest: TransactionRequest = {}) {
        if (Array.isArray(orders)) {
            transactionRequest.serialId = [];
            for (const order of orders) {
                transactionRequest.serialId.push(order.calldata.hash);
            }
        } else {
            transactionRequest.serialId = orders.calldata.hash;
        }
        return transactionRequest
    }
    public async getSerialRecord(serialId: string) {
        try {
            const data = await this.levelDB.get(serialId);
            return data;
        } catch (error) {
            return null;
        }
    }
}
