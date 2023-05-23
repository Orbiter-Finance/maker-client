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
    public static txPool: { [makerAddress_internalId: string]: any[] } = {};
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
    public transferMultiToken(params:[{
        token: string,
        to: string,
        value: string
    }], transactionRequest?: TransactionRequest | any): Promise<TransferResponse | undefined> {
        throw new Error('Method not implemented.');
    }
    public async sendCollectionGetParameters(order: SwapOrder) {
        return {}
    }
    public async storeTx(params: IPoolTx[]): Promise<number> {
        const poolKey = `${this.accountAddress.toLowerCase()}_${this.internalId}`;
        try {
            const txPoolList: IPoolTx[] = await this.getTxPool();
            const newList: IPoolTx[] = [];
            for (const param of params) {
                if (txPoolList.find(item => item.id === param.id)) {
                    this.logger.error(`ID already exists ${param.id}`);
                } else {
                    newList.push({ createTime: new Date().valueOf(), ...param });
                }
            }
            OrbiterAccount.txPool[poolKey] = [...txPoolList, ...newList];
            this.logger.info(`store tx success ${newList.map(item => item.id).join(', ')}`);
            return newList.length;
        } catch (e) {
            this.logger.error(`${this.chainConfig.name} store tx error: ${e.message}`);
            return 0;
        }
    }
    public async deleteTx(idList: string[], isAlarm?: boolean): Promise<number> {
        const poolKey = `${this.accountAddress.toLowerCase()}_${this.internalId}`;
        try {
            const txPoolList: IPoolTx[] = await this.getTxPool();
            const leftTxList: IPoolTx[] = txPoolList.filter(item => {
                return !idList.find(id => String(id) === String(item.id));
            });
            const deleteTxList: IPoolTx[] = txPoolList.filter(item => {
                return !!idList.find(id => String(id) === String(item.id));
            });
            OrbiterAccount.txPool[poolKey] = leftTxList;
            if (deleteTxList.length) {
                if (isAlarm) {
                    const msg: string = `${this.accountAddress.toLowerCase()} ${this.chainConfig.name} delete pool tx ${deleteTxList.map(item => item.id).join(', ')}`;
                    this.logger.error(msg);
                    telegramBot.sendMessage('delete_pool', msg);
                } else {
                    this.logger.info(`${this.chainConfig.name} consume pool tx ${deleteTxList.map(item => item.id).join(', ')}, left count ${leftTxList.length}`);
                }
            }
            return deleteTxList.length;
        } catch (e) {
            this.logger.error(`${this.chainConfig.name} delete tx error: ${e.message}`);
            return 0;
        }
    }
    public async getTxPool(): Promise<IPoolTx[]> {
        const poolKey = `${this.accountAddress.toLowerCase()}_${this.internalId}`;
        return JSON.parse(JSON.stringify(OrbiterAccount.txPool[poolKey] || []))
    }
}
