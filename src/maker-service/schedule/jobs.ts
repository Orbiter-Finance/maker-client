import StarknetAccount from "../account/starknetAccount";
import { IPoolTx } from "../account/IAccount";
import { telegramBot } from "../lib/telegram";
import { ethers } from "ethers";

let limitWaringTime = 0;
let balanceWaringTime = 0;
// Alarm interval duration(second)
const waringInterval = 180;
// Execute several transactions at once
const execTaskCount = 10;
// Maximum number of transactions to be stacked in the memory pool
const maxTaskCount: number = 200;
const expireTime: number = 10 * 60 * 1000;
// lock
export let starknetLockMap = {};

export function setStarknetLock(makerAddress: string, status: boolean) {
    starknetLockMap[makerAddress.toLowerCase()] = status;
}

export async function batchTransferTx() {
    const makerSend = (makerAddress, chainId) => {
        const callback = async () => {
            const sn = async () => {
                if (starknetLockMap[makerAddress.toLowerCase()]) {
                    console.log('Starknet is lock, waiting for the end of the previous transaction');
                    return { code: 0 };
                }
                setStarknetLock(makerAddress, true);
                const privateKey = process.env[makerAddress.toLowerCase()];
                if (!privateKey) {
                    console.error(`${makerAddress} Waitting for the privateKey ${new Date().toLocaleTimeString()}`);
                }
                const starknet = new StarknetAccount(chainId, privateKey, makerAddress);
                const txPoolList: IPoolTx[] = await starknet.getTxPool();
                if (!txPoolList || !txPoolList.length) {
                    starknet.logger.info('There are no consumable tasks in the starknet queue');
                    return { code: 1 };
                }
                // Exceeded limit, clear tx
                const deleteTxList: IPoolTx[] = [];
                // Meet the limit, execute the tx
                const execTaskList: IPoolTx[] = [];
                for (let i = 0; i < txPoolList.length; i++) {
                    const tx = txPoolList[i];
                    // max length limit
                    if (i < txPoolList.length - maxTaskCount) {
                        deleteTxList.push(tx);
                        starknet.logger.info(`starknet_max_count_limit ${txPoolList.length} > ${maxTaskCount}, id: ${tx.id}, token: ${tx.token}, value: ${tx.value}`);
                        continue;
                    }
                    // expire time limit
                    if (tx.createTime < new Date().valueOf() - expireTime) {
                        deleteTxList.push(tx);
                        const formatDate = (timestamp: number) => {
                            return new Date(timestamp).toDateString() + " " + new Date(timestamp).toLocaleTimeString();
                        };
                        starknet.logger.info(`starknet_expire_time_limit ${formatDate(tx.createTime)} < ${formatDate(new Date().valueOf() - expireTime)}, id: ${tx.id}, token: ${tx.token}, value: ${tx.value}`);
                        continue;
                    }
                    execTaskList.push(tx);
                }
                await starknet.deleteTx(deleteTxList.map(item => item.id), true);

                const queueList: IPoolTx[] = [];
                for (let i = 0; i < Math.min(execTaskList.length, execTaskCount); i++) {
                    const tx = execTaskList[i];
                    queueList.push(JSON.parse(JSON.stringify(tx)));
                }
                const tokenPay: { [tokenAddress: string]: ethers.BigNumber } = {};
                for (const queue of queueList) {
                    tokenPay[queue.token] = ethers.BigNumber.from(tokenPay[queue.token] || 0).add(queue.value);
                }
                for (const tokenAddress in tokenPay) {
                    // Maker balance judgment
                    const makerBalance: ethers.BigNumber = await starknet.getBalance(makerAddress, tokenAddress);
                    const needPay: ethers.BigNumber = tokenPay[tokenAddress];
                    // Insufficient Balance
                    if (makerBalance && needPay.gt(makerBalance)) {
                        starknet.logger.error(`starknet ${makerAddress}-${tokenAddress} insufficient balance, ${needPay.toString()} > ${makerBalance.toString()}`);
                        if (balanceWaringTime < new Date().valueOf() - waringInterval * 1000) {
                            const alert: string = `starknet ${makerAddress}-${tokenAddress} insufficient balance, ${needPay.toString()} > ${makerBalance.toString()}`;
                            // TODO
                            // doSms(alert);
                            telegramBot.sendMessage(alert);
                            balanceWaringTime = new Date().valueOf();
                        }
                        return { code: 1 };
                    }
                }

                try {
                    await starknet.deleteTx(queueList.map(item => item.id));
                    await starknet.transferMultiToken(queueList);
                } catch (error) {
                }
                return { code: 1 };
            };
            if (Number(chainId) === 4 || Number(chainId) === 44) {
                try {
                    const rs = await sn();
                    // code 0.complete or wait 1.interrupt
                    if (rs.code === 1) {
                        setStarknetLock(makerAddress, false);
                    }
                } catch (e) {
                    setStarknetLock(makerAddress, false);
                    console.error(`sn job error: ${e.message}`);
                }
            }

        };

        // TODO
        setInterval(callback, 120 * 1000);
    };
    const makerDataList = [{
        makerAddress: "0x050e5ba067562e87b47d87542159e16a627e85b00de331a53b471cee1a4e5a4f",
        chainId: 44
    }];
    for (let i = 0; i < makerDataList.length; i++) {
        const maker = makerDataList[i];
        makerSend(maker.makerAddress, maker.chainId);
    }
}