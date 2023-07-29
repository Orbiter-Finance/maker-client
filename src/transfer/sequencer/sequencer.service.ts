import { hash } from 'starknet';
import { Injectable, Logger } from '@nestjs/common';
import { Mutex } from 'async-mutex';
import { ValidatorService } from '../validator/validator.service';
import OrbiterAccount from 'src/account/orbiterAccount';
import { TransferResponse } from 'src/account/IAccount';
import { ChainConfigService } from 'src/config/chainConfig.service';
import { JSONStringify, clone, equals, isEmpty } from 'src/utils';
import { MonitorState, SwapOrder } from './sequencer.interface';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from 'src/service/prisma.service';
import { TransactionSendBeforeError } from 'src/account/IAccount.interface';
import { MakerConfigService, getMakerConfig } from 'src/config/makerConfig.service';
import dayjs from 'dayjs';
import { AccountFactoryService } from 'src/account/factory';

@Injectable()
export class SequencerService {
  private tradePool: Map<string, SwapOrder[]> = new Map();
  private readonly logger = new Logger(SequencerService.name);
  private monitorState: MonitorState = {

  };

  constructor(private readonly chainConfigService: ChainConfigService,
    private readonly validatorService: ValidatorService,
    private readonly prismaService: PrismaService,
    private makerConfig: MakerConfigService,
    private chainConfig:ChainConfigService,
    private accountService:AccountFactoryService
  ) {
    this.init()
  }
  @Cron('*/5 * * * * *')
  private async init() {
    for (const chain of this.chainConfigService.getAllChains()) {
      const transferTimeout = getMakerConfig(`${chain.internalId}.TransferTimeout`);
      if (transferTimeout) {
        const txlists = await this.prismaService.bridge_transaction.findMany({
          where: {
            status: 1,
            targetChain: +chain.internalId,
            sourceTime: {
              gt: dayjs()
                .subtract(transferTimeout, "ms").toDate()
            }
          }
        })
        for (const tx of txlists) {
          const chainId = tx.targetChain.toString();
          const from = tx.targetMaker.toLocaleLowerCase();
          const symbol = tx.targetSymbol.toLocaleLowerCase();
          const poolKey = `${chainId}-${from}-${symbol}`;
          if (this.tradePool.has(poolKey)) {
            const orders = this.tradePool.get(poolKey);
            if (orders.findIndex(o => o.calldata.hash == tx.sourceId) >= 0) {
              continue;
            }
          }
          const result = await this.validatorService.validSourceTx(tx);
          if (result.errno == 0) {
            await this.pushTradePool(result.data)
          } else {
            this.logger.error(`${chain.name} verifyFromTx fail ${JSONStringify(result)}`)
          }
        }
      }
    }
  }
  @Cron('*/5 * * * * *')
  async monitor() {
    try {
      for (const [poolKey, trades] of this.tradePool.entries()) {
        const [chainId, makerAddr] = poolKey.split('-');
        const lockKey = `${chainId}-${makerAddr}`;

        if (!this.monitorState[lockKey]) {
          // init
          this.monitorState[lockKey] = {
            lock: new Mutex(),
            lastSubmit: Date.now(),
          };
        }
        const TransferInterval = this.makerConfig.get(`${chainId}.TransferInterval`) || 1000 * 5;

        const monitorState = this.monitorState[lockKey];
        const shouldExecute = trades.length > 0 &&
          Date.now() - monitorState.lastSubmit > TransferInterval &&
          !monitorState.lock.isLocked();

        if (shouldExecute) {
          monitorState.lock.runExclusive(async () => {
            await this.execute(poolKey);
          });
        }
      }
    } catch (error) {
      this.logger.error("monitor error", error);
    }
  }

  async pushTradePool(trx: SwapOrder) {
    const chainId = trx.chainId.toString();
    const from = trx.from.toLocaleLowerCase();
    const symbol = trx.symbol.toLocaleLowerCase();
    const poolKey = `${chainId}-${from}-${symbol}`;
    if (!this.tradePool.has(poolKey)) {
      this.tradePool.set(poolKey, []);
    }


    const trades = this.tradePool.get(poolKey) || [];
    const isExist = trades.findIndex((tx) =>
      equals(tx.calldata.hash, trx.calldata.hash)
    ) >= 0;
    if (isExist) {
      this.logger.warn(`${trx.calldata.hash} exist tradePool Array`);
      return;
    }
    trades.push(trx);
    this.logger.debug("join memory pool:", JSONStringify(trx));
  }
  async execute(poolKey: string) {
    const logger = this.logger;
    const [chainId, makerAddr, tokenAddr] = poolKey.split('-');
    const trades = this.tradePool.get(poolKey) || [];
    const lockKey = `${chainId}-${makerAddr}`;
    const monitorState = this.monitorState[lockKey];
    logger.log(
      `check orders:${chainId},pendingTxs:${trades.length}, monitorState:${JSONStringify(monitorState)}, lastSubmit:${monitorState.lastSubmit}`
    );
    if (trades.length <= 0) {
      return;
    }

    if (!this.validatorService.checkSenderPrivateKey(makerAddr)) {
      logger.error(`${chainId} - ${makerAddr} PrivateKey Not Found`);
      return undefined;
    }

    for (let i = trades.length - 1; i > 0; i--) {
      const order = trades[i];
      if (!this.validatorService.transactionTimeValid(order.calldata.chainId, order.calldata.timestamp)) {
        logger.log(`${order.calldata.hash} remove order`);
        trades.splice(i, 1);
        continue;
      }
      const validResult = await this.validatorService.verifyToTx(order);
      if (validResult.errno == -1) {
        logger.error(`${order.calldata.hash} verifyToTx Fail ${JSONStringify(validResult)}`);
        trades.splice(i, 1);
        continue;
      }
    }

    const BatchTransferCount = this.makerConfig.get(`${chainId}.BatchTransferCount`);
    if (BatchTransferCount && BatchTransferCount > 1 && trades.length > 1) {
      // mul
      const pendingTxs = trades.splice(0, BatchTransferCount);
      return await this.executeTransferMultiple(pendingTxs).then((result: any) => {
        this.logger.log(`executeTransferMultiple result:${JSONStringify(result)}`);
        if (result && result.errno == -1) {
          this.logger.log(`executeTransferMultiple rollback order ${pendingTxs.map(o => o.calldata.hash)}`);
          trades.push(...pendingTxs)
        }
      }).catch(error => {
        this.logger.error(`executeTransferMultiple error:${error.message}`, error);
      })
    } else {
      const pendingTx = trades.splice(0, 1)[0];
      return await this.executeTransferSingle(pendingTx).then((result) => {
        this.logger.log(`executeTransferSingle result:${pendingTx.calldata.hash} ${JSONStringify(result)}`, pendingTx);
        if (result && result.errno == -1) {
          trades.push(pendingTx)
          this.logger.log(`executeTransferSingle rollback order ${pendingTx.calldata.hash}`);
        }
      }).catch(error => {
        console.error(error);
        this.logger.log(`executeTransferSingle error:${error.message}`, pendingTx, error);
      })
    }
  }
  async executeTransferSingle(order: SwapOrder) {
    const chainId = Number(order.chainId);
    const toChain = this.chainConfigService.getChainInfo(chainId);
    const logger = new Logger(toChain.name);
    let sourceTx;
    if (isEmpty(toChain) || !toChain) {
      throw new TransactionSendBeforeError(`${chainId} toChain Not Found`)
    }
    const toToken = this.chainConfigService.getTokenBySymbol(chainId, order.symbol);
    if (isEmpty(toToken) || !toToken) {
      throw new TransactionSendBeforeError(`${chainId} - ${order.symbol} ToChain ToToken Not Found`)
    }
    const sendValue = order.value;
    let account: OrbiterAccount;
    try {
      const privateKey = await this.validatorService.getSenderPrivateKey(order.from);
      account = this.accountService.createMakerAccount(
        order.from,
        chainId
      );
      await account.connect(privateKey)
      sourceTx = await this.prismaService.bridge_transaction.findFirst({
        where: {
          sourceId: order.calldata.hash.toString(),
          sourceChain: order.calldata.chainId
        }
      })
      if (!sourceTx) {
        throw new TransactionSendBeforeError(`${order.calldata.chainId} - ${order.calldata.hash} SourceTx not exist`)
      }
      if (sourceTx.status != 1) {
        throw new TransactionSendBeforeError(`${order.calldata.chainId} - ${order.calldata.hash} Status does not allow refund (${sourceTx.status}/1)`)
      }
      if (sourceTx.targetChain != order.chainId) {
        throw new TransactionSendBeforeError(`${order.calldata.chainId} - ${order.calldata.hash} Inconsistent target network (${sourceTx.targetChain}/${order.chainId})`)
      }

      if (sourceTx.sourceAmount != order.calldata.value) {
        throw new TransactionSendBeforeError(`${order.calldata.chainId} - ${order.calldata.hash} Inconsistent sourceAmount (${sourceTx.sourceAmount}/${order.calldata.value})`)
      }
      if (sourceTx.targetMaker != order.from) {
        throw new TransactionSendBeforeError(`${order.calldata.chainId} - ${order.calldata.hash} Inconsistent target maker (${sourceTx.targetMaker}/${order.from})`)
      }
      if (sourceTx.targetSymbol != toToken.symbol) {
        throw new TransactionSendBeforeError(`${order.calldata.chainId} - ${order.calldata.hash} Inconsistent target symbol (${sourceTx.targetSymbol}/${toToken.symbol})`)
      }
      const updateRes = await this.prismaService.bridge_transaction.update({
        where: {
          id: sourceTx.id,
        },
        data: {
          status: 96
        }
      });
      if (!updateRes) {
        throw new Error(`${order.calldata.chainId} - ${order.calldata.hash} Change status fail`);
      }
    } catch (error) {
      if (error instanceof TransactionSendBeforeError) {
        logger.error(`executeTransferSingle before error:${error.message}`, error)
        return {
          errno: -1,
          errmsg: error.message,
        }
      }
      throw error;
    }
    let txResponse: TransferResponse | undefined;
    try {
      const request = await account.paymentBefore(order);
      request.serialId = order.calldata.hash;
      if (this.chainConfigService.inValidMainToken(chainId, toToken.address)) {
        txResponse = await account.transfer(order.to, sendValue, request);
      } else {
        txResponse = await account.transferToken(
          toToken.address,
          order.to,
          sendValue,
          request
        );
      }
      if (txResponse && txResponse.hash) {
        // success change match
        txResponse.symbol = toToken.symbol;
        txResponse.feeSymbol = toChain.nativeCurrency.symbol;
        this.createDestTxMatch(order, txResponse).catch(error => {
          this.logger.error(`${order.calldata.hash} createDestTxMatch error:`, txResponse, error)
        })
        return {
          errno: 0,
          errmsg: "success",
          data: txResponse
        }
      }
    } catch (error) {
      if (error instanceof TransactionSendBeforeError) {
        logger.error(`executeTransferSingle TransactionSendBeforeError error:${error.message}`)
        await this.prismaService.bridge_transaction.update({
          where: {
            id: sourceTx.id,
          },
          data: {
            status: 1
          }
        });
        return {
          errno: -1,
          errmsg: error.message,
          data: txResponse,
        }
      } else {
        await this.prismaService.bridge_transaction.update({
          where: {
            id: sourceTx.id,
          },
          data: {
            status: 97
          }
        });
      }
      throw error;
    }

  }
  async executeTransferMultiple(orders: SwapOrder[]) {
    let toChainId, toTokenAddr, senderMaker;
    const transferOrder: SwapOrder[] = [];
    const sourceHashList = orders.map(o => o.calldata.hash);
    let totalValue = 0n;
    const sourceTxList = await this.prismaService.bridge_transaction.findMany({
      where: {
        sourceId: {
          in: sourceHashList
        },
        sourceChain: toChainId
      }
    })
    const errors = {
    }
    let account: OrbiterAccount;
    const logger = this.logger;
    try {
      for (const order of orders) {
        try {
          const chainId = Number(order.chainId);
          const tokenSymbol = order.symbol;
          const chainInfo = this.chainConfigService.getChainInfo(chainId);
          if (isEmpty(chainInfo) || !chainInfo) {
            throw new Error(`${chainId}  toChain Not Found`);
          }
          const tokenInfo = this.chainConfigService.getTokenBySymbol(chainId, tokenSymbol);
          if (isEmpty(tokenInfo) || !tokenInfo) {
            throw new Error(`${chainId} - ${tokenSymbol} ToChain ToToken Not Found`);
          }
          if (!toChainId) {
            toChainId = order.chainId;
            toTokenAddr = tokenInfo.address;
            senderMaker = order.from;
          }
          if (toChainId != chainInfo.internalId) {
            throw new Error('The internalId in the payment array are inconsistent')
          }
          if (toTokenAddr != tokenInfo.address) {
            throw new Error('The Token addresses in the payment array are inconsistent')
          }
          if (senderMaker != order.from) {
            throw new Error('The Sender Maker in the payment array are inconsistent')
          }
          // valid db tx
          const sourceTx = sourceTxList.find(tx => tx.sourceId === order.calldata.hash);
          if (!sourceTx) {
            errors[order.calldata.hash] = `${order.calldata.chainId} - ${order.calldata.hash} SourceTx not exist`;
            continue;
          }
          if (sourceTx.status != 1) {
            errors[order.calldata.hash] = `${order.calldata.chainId} - ${order.calldata.hash} Status does not allow refund (${sourceTx.status}/1)`;
            continue;
          }
          if (sourceTx.targetChain != order.chainId) {
            errors[order.calldata.hash] = `${order.calldata.chainId} - ${order.calldata.hash} Inconsistent target network (${sourceTx.targetChain}/${order.calldata.chainId})`;
            continue;
          }

          if (sourceTx.sourceAmount != order.calldata.value) {
            errors[order.calldata.hash] = `${order.calldata.chainId} - ${order.calldata.hash} Inconsistent sourceAmount (${sourceTx.sourceAmount}/${order.calldata.value})`;
            continue;
          }
          if (sourceTx.targetMaker != order.from) {
            errors[order.calldata.hash] = `${order.calldata.chainId} - ${order.calldata.hash} Inconsistent target maker (${sourceTx.targetMaker}/${order.from})`;
            continue;
          }
          if (sourceTx.targetSymbol != tokenInfo.symbol) {
            errors[order.calldata.hash] = `${order.calldata.chainId} - ${order.calldata.hash} Inconsistent target symbol (${sourceTx.targetSymbol}/${tokenInfo.symbol})`;
            continue;
          }
          order.calldata.id = sourceTx.id;
          transferOrder.push(order)
          totalValue += order.value;
        } catch (error) {
          logger.error(`executeTransferMultiple for error:${order.calldata.hash} ${error.message}`, {
            order
          });
        }
      }

      if (transferOrder.length <= 0) {
        return {
          errmsg: "No transactions that meet the refund requirements were found",
          errno: 0,
          errors
        }
      }
      const privateKey = await this.validatorService.getSenderPrivateKey(senderMaker);
      account = this.accountService.createMakerAccount(
        senderMaker,
        toChainId
      );
      await account.connect(privateKey)
      // update 
      const updateRes = await this.prismaService.bridge_transaction.updateMany({
        where: {
          id: {
            in: transferOrder.map(tx => tx.calldata.id)
          },
          status: 1
        },
        data: {
          status: 96
        }
      });
      if (!updateRes) {
        throw new Error(`${toChainId} - ${transferOrder.map(o => o.calldata.hash)} Change status fail`);
      }
      if (updateRes.count != transferOrder.length) {
        throw new TransactionSendBeforeError(`${toChainId} - ${transferOrder.map(tx => tx.calldata.hash)} Change rows count inconsistent`)
      }
    } catch (error) {
      if (error instanceof TransactionSendBeforeError) {
        logger.error(`executeTransferMultiple TransactionSendBeforeError error:${error.message}`, error)
        return {
          errno: -1,
          errmsg: error.message,
          errors
        }
      }
      throw error;
    }

    let txResponse;
    try {
      const request = await account.paymentBefore(transferOrder);
      if (this.chainConfigService.inValidMainToken(toChainId, toTokenAddr)) {
        txResponse = await account.transfers(transferOrder.map(o => o.to), transferOrder.map(o => o.value), request);
      } else {
        txResponse = await account.transferTokens(toTokenAddr, transferOrder.map(o => o.to), transferOrder.map(o => o.value), request);
      }
      for (let i = 0; i < transferOrder.length; i++) {
        const order = orders.find(o => o.calldata.hash == transferOrder[i].calldata.hash);
        try {
          const response = clone(txResponse);
          response.hash = `${response.hash}#${i}`;
          await this.createDestTxMatch(order, response)
        } catch (error) {
          logger.error(`${order.calldata.hash} createDestTxMatch error:`, order, error)
        }
      }
      return {
        errno: 0,
        errmsg: "success",
        data: txResponse,
        errors
      }
    } catch (error) {
      if (error instanceof TransactionSendBeforeError) {
        logger.error(`executeTransferMultiple TransactionSendBeforeError error:${error.message}`)
        // 
        await this.prismaService.bridge_transaction.updateMany({
          where: {
            id: {
              in: transferOrder.map(tx => tx.calldata.id)
            },
            status: 96
          },
          data: {
            status: 1
          }
        });
        return {
          errno: -1,
          errmsg: error.message,
          data: txResponse,
          errors
        }
      } else {
        await this.prismaService.bridge_transaction.updateMany({
          where: {
            id: {
              in: transferOrder.map(tx => tx.calldata.id)
            },
            status: 96
          },
          data: {
            status: 97
          }
        });
      }
      throw error;
    }

  }
  async createDestTxMatch(order: SwapOrder, transaction: TransferResponse) {
    const changeData = {
      status: 98,
      targetId: transaction.hash,
      targetAddress: transaction.to,
      targetAmount: BigInt(transaction.value.toString()),
      updatedAt: new Date()
    }
    if (transaction.feeSymbol) {
      changeData['targetFeeSymbol'] = transaction.feeSymbol;
    }
    if (transaction.symbol) {
      changeData['targetSymbol'] = transaction.symbol;
    }
    return await this.prismaService.bridge_transaction.update({
      where: {
        sourceId_sourceChain: {
          sourceChain: order.calldata.chainId,
          sourceId: order.calldata.hash
        }
      },
      data: changeData
    });
  }

}
