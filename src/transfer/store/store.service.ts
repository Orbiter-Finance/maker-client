import { Injectable } from '@nestjs/common';
import levelup from 'levelup';
import leveldown from 'leveldown';
import { TransferAmountTransaction } from '../sequencer/sequencer.interface';
import { Mutex } from 'async-mutex';
import { cloneDeep } from 'src/utils';

export class StoreService {
    private static levels: Map<string, levelup> = new Map();
    private symbolRelHash: Map<string, Set<string>> = new Map();
    private transactions: Map<string, TransferAmountTransaction> = new Map(); // key = symbol
    public lastId: number = 0;
    public static WalletLock: { [key: string]: Mutex } = {}; // key = chainId + address
    constructor(public readonly chainId: string) {
        if (!StoreService.levels.has(chainId)) {
            StoreService.levels.set(chainId, levelup(leveldown(`./runtime/${chainId}`)))
        }
    }
    public async accountRunExclusive(address: string, callback: () => Promise<any>) {
        address = address.toLocaleLowerCase();
        const key = `${this.chainId}-${address}`.toLocaleLowerCase();
        if (!StoreService.WalletLock[key]) {
            StoreService.WalletLock[key] = new Mutex();
        }
        const mutex = StoreService.WalletLock[key];
        return await mutex.runExclusive(callback);
    }
    public async getSerialRecord(serialId: string) {
        try {
            const level = StoreService.levels.get(this.chainId);
            const data = await level.get(serialId);
            return data;
        } catch (error) {
            return null;
        }
    }
    public async saveSerialRecord(datas: Array<{ key: string, data: string }>) {
        const batchData = [];
        const level = StoreService.levels.get(this.chainId);
        for (const row of datas) {
            batchData.push({ type: 'put', key: row.key, value: row.data })
        }
        return await level.batch(batchData)
    }
    public async setSerialRecord(key: string, value: string) {
        const level = StoreService.levels.get(this.chainId);
        return await level.put(key, value)
    }
    public async deleteSerialRecord(hash: string) {
        const level = StoreService.levels.get(this.chainId);
        await level.del(hash);
    }
    public async removeTransactionAndSetSerial(token: string, hash: string, targeId?: string): Promise<any> {
        const transfer = this.getTransaction(hash);
        const rollback = async () => {
            await this.addTransactions(transfer);
            await this.deleteSerialRecord(hash);
        }
        try {
            await this.removeTransaction(token, hash);
            await this.setSerialRecord(hash, targeId || '1');
            return {
                rollback
            };
        } catch (error) {
            await rollback()
            throw error;
        }
    }
    public async removeTransactionsAndSetSerial(token: string, hashs: Array<string>, targeId?: string): Promise<any> {
        const bakTransfers = hashs.map(id=> this.getTransaction(id));
        if (bakTransfers.length != hashs.length) {
            throw new Error('The deleted data has inconsistent length')
        }
        const rollback = async () => {
            while (bakTransfers.length > 0) {
                const transfer = bakTransfers.splice(0, 1);
                await this.addTransactions(transfer[0]);
                await this.deleteSerialRecord(transfer[0].sourceId);
            }
        }
        const commitTransfers = cloneDeep(bakTransfers);
        const commit = async () => {
            while (commitTransfers.length > 0) {
                const transfer = commitTransfers.splice(0, 1);
                await this.removeTransaction(token, transfer[0].sourceId);
                await this.setSerialRecord(transfer[0].sourceId, '1');
            }
        }
        try {
            await commit();
            return {
                rollback
            };
        } catch (error) {
            await rollback()
            throw error;
        }
    }

    public async saveSerialRelTxHash(ids: string[], txHash: string) {
        const batchData = [];
        const level = StoreService.levels.get(this.chainId);
        for (const id of ids) {
            batchData.push({ type: 'put', key: id, value: txHash })
        }
        return await level.batch(batchData)
    }

    public async addTransactions(tx: TransferAmountTransaction) {
        const key = `${tx.targetToken}`.toLocaleLowerCase();
        if (!this.symbolRelHash.has(key)) {
            this.symbolRelHash.set(key, new Set());
        }
        if (this.symbolRelHash.get(key).has(tx.sourceId)) {
            return { code: '-1', errmsg: `${tx.sourceId} exist` }
        }
        // Payment has already been refunded
        const data = await this.getSerialRecord(tx.sourceId);
        if (data) {
            // throw new Error(`${tx.sourceId} Payment has already been refunded`);
            return { code: '-1', errmsg: `${tx.sourceId} Payment has already been refunded` }
        }
        this.symbolRelHash.get(key).add(tx.sourceId);
        this.transactions.set(tx.sourceId, tx);
        return { code: 0, errmsg: "success" }
    }
    public async removeTransaction(token: string, hash: string) {
        this.symbolRelHash.get(token.toLocaleLowerCase()).delete(hash);
        this.transactions.delete(hash)
    }
    public getTargetTokenTxIdList(token: string) {
        const key = `${token}`.toLocaleLowerCase();
        return this.symbolRelHash.get(key).values();
    }
    public getTransactionsByToken(token: string) {
        const tokenTxList = this.getTargetTokenTxIdList(token);
        const transfers = Array.from(tokenTxList).map(hash => this.getTransaction(hash));
        return transfers;
    }
    public getTransactions() {
        return this.transactions.values();
    }
    public getTransaction(id: string) {
        return this.transactions.get(id);
    }
    public getSymbolsWithData() {
        return Array.from(this.symbolRelHash.keys()).map(k => {
            return {
                id: k,
                size: this.symbolRelHash.get(k).size
            }
        }).filter(row => row.size > 0);
    }
}
