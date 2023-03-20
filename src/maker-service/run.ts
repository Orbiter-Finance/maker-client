import { chains } from 'orbiter-chaincore';
import { Factory } from './account/factory';
import Context from './context';
const privateKeys = {
    '0x07b393627bd514d2aa4c83e9f0c468939df15ea3c29980cd8e7be3ec847795f0': '0x6a83b80242e72fc371cb63352c5094c5ea993f9e5f322e00f54533d39b80b2b'
}
const txList = require('./toStarknet.json');
// const txList = [
//     {
//         "transcationId": "0xacfd149123c6891b4ab1eb389013f56775d52ce20002eth99",
//         "inId": 17188152,
//         "outId": null,
//         "fromChain": 2,
//         "toChain": 4,
//         "toAmount": "87225000000000099",
//         "replySender": "0x07b393627bd514d2aa4c83e9f0c468939df15ea3c29980cd8e7be3ec847795f0",
//         "replyAccount": "0x02a766e069b07021b841c238da23e8ec337a6d0dfe4b658a72226f42a9e2828e"
//     }
// ]
export async function runTransfer(ctx: Context) {
    let index = 1;
    for (const tx of txList) {
        const toChainId = tx.toChain;
        const transcationId = tx.transcationId;
        const makerAddr = tx.replySender;
        const toAddress = tx.replyAccount;
        const toAmount = tx.toAmount;
        try {
            const data = await ctx.db.Sequencer.findOne({
                attributes: ['id'],
                where: {
                    hash: transcationId
                }
            });
            if (data?.id) {
                ctx.logger.error(`transcationId ${transcationId} transfer exist`);
                continue;
            }
            ctx.logger.info(`total:${index}/${txList.length}, transcationId:${transcationId}, toAmount:${toAmount}`);
            const chainConfig = await chains.getChainInfo(Number(toChainId));
            if (!chainConfig) {
                throw new Error(`chainId not found ${transcationId} ${toChainId}`)
            }
            const privateKey = privateKeys[makerAddr];
            const sendRecord = await ctx.db.Sequencer.create({
                hash: transcationId,
                from: makerAddr,
                to: toAddress,
                chainId: toChainId,
                transactionCount: 0,
                transactions: [] as any,
                status: 0,
            })
            try {
                const account = Factory.createMakerAccount(makerAddr, privateKey, toChainId);
                const result = await account.transferToken("0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7", toAddress, toAmount);
                sendRecord.transactions = result as any;
                sendRecord.status = 1;
                ctx.logger.info(`transcationId ${transcationId} transfer success`, result);
            } catch (error) {
                sendRecord.status = 2;
                throw error;
            } finally {
                await sendRecord.save()
            }

        } catch (error) {
            ctx.logger.info(`transcationId ${transcationId} transfer error:`, error);
            console.error(error);
        } finally {
            index++;
        }

    }
}
