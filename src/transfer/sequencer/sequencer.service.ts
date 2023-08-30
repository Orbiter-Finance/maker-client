import { Injectable } from "@nestjs/common";
import { ValidatorService } from "../validator/validator.service";
import type OrbiterAccount from "src/account/orbiterAccount";
import { type TransferResponse } from "src/account/IAccount";
import { ChainConfigService } from "src/config/chainsConfig.service";
import { equals, isEmpty } from "src/utils";
import { type TransferAmountTransaction } from "./sequencer.interface";
import {
  TransactionSendIgError,
  TransactionSendBeforeError,
  TransactionSendAfterError,
} from "src/account/IAccount.interface";
import { ENVConfigService } from "src/config/envConfigService";
import { AccountFactoryService } from "src/account/factory";
import { InjectModel } from "@nestjs/sequelize";
import { TransfersModel, BridgeTransactionModel } from "src/models";
import BigNumber from "bignumber.js";
import { type StoreService } from "../store/store.service";
import { createLoggerByName } from "src/lib/logger";
@Injectable()
export class SequencerService {
  private readonly logger = createLoggerByName(SequencerService.name);

  constructor(
    private readonly chainConfigService: ChainConfigService,
    private readonly validatorService: ValidatorService,
    private readonly makerConfig: ENVConfigService,
    private readonly accountService: AccountFactoryService,
    @InjectModel(TransfersModel)
    private readonly transfersModel: typeof TransfersModel,
    @InjectModel(BridgeTransactionModel)
    private readonly bridgeTransactionModel: typeof BridgeTransactionModel
  ) {}

  async execSingleTransfer(
    transfer: TransferAmountTransaction,
    wallet: OrbiterAccount,
    store: StoreService
  ) {
    const sourceChainId = transfer.sourceChain;
    const sourceHash = transfer.sourceId;
    const transferToken = this.chainConfigService.getTokenByAddress(
      transfer.targetChain,
      transfer.targetToken
    );
    this.logger.info(
      `execSingleTransfer: ${sourceChainId}-${sourceHash}, owner:${wallet.address}`
    );
    const transaction =
      await this.bridgeTransactionModel.sequelize.transaction();
    let sourceTx;
    try {
      const success = await this.validatorService.validatingValueMatches(
        transfer.sourceSymbol,
        transfer.sourceAmount,
        transfer.targetSymbol,
        transfer.targetAmount
      );
      if (!success) {
        throw new TransactionSendBeforeError(
          `validatingValueMatches Trading with loss and risk ${transfer.sourceAmount}-${transfer.sourceSymbol} To ${transfer.targetAmount}-${transfer.targetSymbol}`
        );
      }
      if (!transferToken) {
        throw new TransactionSendBeforeError(
          `${sourceChainId} - ${sourceHash} Inconsistent transferToken (${transfer.targetChain}/${transfer.targetToken})`
        );
      }
      sourceTx = await this.bridgeTransactionModel.findOne({
        attributes: [
          "id",
          "sourceChain",
          "sourceId",
          "status",
          "targetChain",
          "targetSymbol",
          "targetAmount",
          "targetId",
        ],
        where: {
          sourceId: sourceHash,
          sourceChain: sourceChainId,
        },
        transaction,
      });
      if (!sourceTx) {
        throw new TransactionSendBeforeError(
          `${sourceChainId} - ${sourceHash} SourceTx not exist`
        );
      }
      if (sourceTx.status != 0) {
        // store.removeTransaction(transfer.targetToken, sourceHash);
        throw new TransactionSendIgError(
          `${sourceChainId} - ${sourceHash} Status does not allow refund (${sourceTx.status}/0)`
        );
      }
      if (!isEmpty(sourceTx.targetId)) {
        store.removeTransactionAndSetSerial(
          transfer.targetToken,
          sourceHash,
          sourceTx.targetId
        );
        throw new TransactionSendIgError(
          `${sourceChainId} - ${sourceHash} There is a collection ID present`
        );
      }
      if (!equals(sourceTx.targetChain, transfer.targetChain)) {
        throw new TransactionSendBeforeError(
          `${sourceChainId} - ${sourceHash} Inconsistent target network (${sourceTx.targetChain}/${transfer.targetChain})`
        );
      }

      if (!equals(sourceTx.targetAmount, transfer.targetAmount)) {
        throw new TransactionSendBeforeError(
          `${sourceChainId} - ${sourceHash} Inconsistent targetAmount (${sourceTx.targetAmount}/${transfer.targetAmount})`
        );
      }

      if (sourceTx.targetSymbol != transfer.targetSymbol) {
        throw new TransactionSendBeforeError(
          `${sourceChainId} - ${sourceHash} Inconsistent targetSymbol (${sourceTx.targetSymbol}/${transfer.targetSymbol})`
        );
      }
      sourceTx.status = 96;
      const updateRes = await sourceTx.save({
        transaction,
      });
      if (!updateRes) {
        throw new TransactionSendBeforeError(
          `${sourceChainId} - ${sourceHash} Change status fail`
        );
      }
    } catch (error) {
      transaction && (await transaction.rollback());
      throw error;
    }
    // transfer.targetAddress = '0xEFc6089224068b20197156A91D50132b2A47b908';
    let transferResult: TransferResponse;
    try {
      const transferAmount = new BigNumber(transfer.targetAmount).times(
        10 ** transferToken.decimals
      );
      const requestParams = await wallet.pregeneratedRequestParameters(
        transfer
      );
      if (transferToken.isNative) {
        transferResult = await wallet.transfer(
          transfer.targetAddress,
          BigInt(transferAmount.toFixed(0)),
          requestParams
        );
      } else {
        transferResult = await wallet.transferToken(
          transferToken.address,
          transfer.targetAddress,
          BigInt(transferAmount.toFixed(0)),
          requestParams
        );
      }
      sourceTx.status = 98;
      const updateRes = await sourceTx.save({
        transaction,
      });
      if (!updateRes) {
        throw new TransactionSendAfterError(
          `${sourceChainId} - ${sourceHash} Change status fail`
        );
      }
      await transaction.commit();
    } catch (error) {
      if (error instanceof TransactionSendBeforeError) {
        await transaction.rollback();
      } else {
        sourceTx.status = 97;
        await sourceTx.save({
          transaction,
        });
        await transaction.commit();
      }
      throw error;
    }

    if (transferResult) {
      // success change targetId
      wallet
        .waitForTransactionConfirmation(transferResult.hash)
        .then(async (tx) => {
          await this.bridgeTransactionModel.update(
            {
              status: 99,
              targetId: tx.hash,
            },
            {
              where: {
                id: sourceTx.id,
              },
            }
          );
        })
        .catch((error) => {
          this.logger.error(
            `${transferResult.hash} waitForTransactionConfirmation error`,
            error
          );
        });
    }
  }

  async singleSendTransactionByTransfer(
    token: string,
    store: StoreService,
    hash: string
  ) {
    try {
      const transfer = store.getTransaction(hash);
      const wallet = await this.validatorService.transactionGetPrivateKey(
        transfer
      );
      if (wallet && !wallet.account) {
        this.logger.error(
          `${hash} transactionGetPrivateKey ${hash} warn ${JSON.stringify(
            wallet["errors"] || {}
          )}`
        );
        return;
      }
      if (wallet?.account) {
        const { rollback } = await store.removeTransactionAndSetSerial(
          token,
          transfer.sourceId
        );
        try {
          const senderAddress = wallet.address.toLocaleLowerCase();
          const result = await store.accountRunExclusive(
            senderAddress,
            async () => {
              await this.execSingleTransfer(transfer, wallet.account, store);
            }
          );
          return result;
        } catch (error) {
          if (error instanceof TransactionSendBeforeError) {
            await rollback();
          }
          this.logger.error(
            `sequencer.schedule singleSendTransaction ${hash} error`,
            error.stack
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `singleSendTransactionByTransfer ${hash} error`,
        error.stack
      );
    }
  }

  async batchSendTransactionByTransfer(
    token: string,
    store: StoreService,
    account: OrbiterAccount,
    transfers: TransferAmountTransaction[]
  ) {
    const senderAddress = account.address.toLocaleLowerCase();
    await store.accountRunExclusive(senderAddress, async () => {
      // valid exist
      const passTransfers = [];
      for (const transfer of transfers) {
        const record = await store.getSerialRecord(transfer.sourceId);
        if (record) {
          this.logger.warn(
            `${transfer.sourceId} batchSendTransaction getSerialRecord exist`
          );
          await store.removeTransaction(token, transfer.sourceId);
          continue;
        }
        const success = await this.validatorService.validatingValueMatches(
          transfer.sourceSymbol,
          transfer.sourceAmount,
          transfer.targetSymbol,
          transfer.targetAmount
        );
        if (!success) {
          this.logger.warn(
            `validatingValueMatches Trading with loss and risk ${transfer.sourceAmount}-${transfer.sourceSymbol} To ${transfer.targetAmount}-${transfer.targetSymbol}`
          );
          continue;
        }
        passTransfers.push(transfer);
      }
      if (passTransfers.length <= 0) {
        this.logger.warn(
          `Original data length ${transfers.length}, filtered 0`
        );
        return;
      }
      const { rollback } = await store.removeTransactionsAndSetSerial(
        token,
        passTransfers.map((tx) => tx.sourceId)
      );
      try {
        // send
        await this.execBatchTransfer(passTransfers, account, store);
      } catch (error) {
        if (error instanceof TransactionSendBeforeError) {
          await rollback();
        }
        this.logger.error(
          "sequencer.schedule batchSendTransactionByTransfer error",
          error.stack
        );
      }
    });
  }

  async execBatchTransfer(
    transfers: TransferAmountTransaction[],
    wallet: OrbiterAccount,
    store: StoreService
  ) {
    const transferToken = this.chainConfigService.getTokenByAddress(
      store.chainId,
      transfers[0].targetToken
    );
    // const totalSend: number = transfers.reduce((total, current) => total + (+current.targetAmount), 0);
    let transferResult: TransferResponse;
    const sourecIds = transfers.map((tx) => tx.sourceId);
    const toAddressList = transfers.map((tx) => tx.targetAddress);
    const toValuesList = transfers.map((tx) => {
      return BigInt(
        new BigNumber(tx.targetAmount)
          .times(10 ** transferToken.decimals)
          .toFixed(0)
      );
    });
    // lock
    const transaction =
      await this.bridgeTransactionModel.sequelize.transaction();
    //
    try {
      const result = await this.bridgeTransactionModel.update(
        {
          status: 96,
        },
        {
          where: {
            sourceId: sourecIds,
            status: 0,
          },
          transaction,
        }
      );
      if (result[0] != sourecIds.length) {
        throw new Error(
          "The number of successful modifications is inconsistent"
        );
      }
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    try {
      const requestParams = await wallet.pregeneratedRequestParameters(
        transfers
      );
      if (transferToken.isNative) {
        transferResult = await wallet.transfers(
          toAddressList,
          toValuesList,
          requestParams
        );
      } else {
        transferResult = await wallet.transferTokens(
          transferToken.address,
          toAddressList,
          toValuesList,
          requestParams
        );
      }
      await transaction.commit();
    } catch (error) {
      if (error instanceof TransactionSendBeforeError) {
        await transaction.rollback();
      } else {
        this.bridgeTransactionModel.update(
          {
            status: 97,
          },
          {
            where: {
              sourceId: sourecIds,
            },
            transaction,
          }
        );
        await transaction.commit();
      }
      throw error;
    }
    if (transferResult) {
      // success change targetId
      wallet
        .waitForTransactionConfirmation(transferResult.hash)
        .then(async (tx) => {
          await this.bridgeTransactionModel.update(
            {
              status: 99,
              targetId: tx.hash,
            },
            {
              where: {
                sourceId: sourecIds,
              },
            }
          );
        })
        .catch((error) => {
          this.logger.error(
            `${transferResult.hash} waitForTransactionConfirmation error`,
            error
          );
        });
    }
  }
}
