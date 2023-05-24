import { LoggerService } from '../utils/logger';
import { chains } from 'orbiter-chaincore';
import { IPoolTx, TransactionRequest, TransferResponse } from './IAccount';
import { LoggerType } from 'orbiter-chaincore/src/packages/winstonX';
import { IChainConfig } from 'orbiter-chaincore/src/types';
import IAccount from './IAccount';
import { BigNumber } from 'ethers';
import { SwapOrder } from '../service/sequencer';
import { telegramBot } from "../lib/telegram";
export default class OrbiterAccount extends IAccount {
    public static txPool: { [makerAddress_internalId: string]: any[] } = {};   // Retrying transaction pools
    public logger: LoggerType;
    public chainConfig!: IChainConfig;
    public accountAddress: string;
    constructor(
        protected internalId: number,
        protected readonly privateKey: string
    ) {
        super(internalId, privateKey);
        const chainConfig = chains.getChainInfo(internalId);
        if (!chainConfig) {
            throw new Error(`${internalId} Chain Config not found`);
        }
        this.chainConfig = chainConfig;
        this.logger = LoggerService.getLogger(internalId.toString());
    }
    public transfer(to: string, value: string, transactionRequest?: TransactionRequest | any): Promise<TransferResponse | undefined> {
        throw new Error('Method not implemented.');
    }
    public getBalance(to?: string | undefined, token?: string | undefined): Promise<BigNumber> {
        throw new Error('Method not implemented.');
    }
    public getTokenBalance(token: string, to: string): Promise<BigNumber> {
        throw new Error('Method not implemented.');
    }
    public transferToken(token: string, to: string, value: string, transactionRequest?: TransactionRequest | any): Promise<TransferResponse | undefined> {
        throw new Error('Method not implemented.');
    }
    public transferMultiToken(params: IPoolTx[], retry?: any): Promise<TransferResponse | undefined> {
        throw new Error('Method not implemented.');
    }
    public async sendCollectionGetParameters(order: SwapOrder) {
        return {}
    }
}
