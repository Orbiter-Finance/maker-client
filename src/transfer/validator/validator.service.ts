import { Injectable } from "@nestjs/common";
import dayjs from "dayjs";
import BigNumber from "bignumber.js";
import { ChainConfigService } from "src/config/chainsConfig.service";
import { ConfigService } from "@nestjs/config";
import { groupBy, isEmpty, uniq } from "src/utils";
import { ChainLinkService } from "src/service/chainlink.service";
import { type TransferAmountTransaction } from "../sequencer/sequencer.interface";
import { ENVConfigService } from "src/config/envConfigService";
import { AccountFactoryService } from "src/account/factory";
import { take } from "lodash";
import type OrbiterAccount from "src/account/orbiterAccount";
import { createLoggerByName } from "src/lib/logger";
@Injectable()
export class ValidatorService {
  private readonly logger = createLoggerByName(ValidatorService.name);
  constructor(
    private readonly chainConfigService: ChainConfigService,
    private readonly makerConfig: ENVConfigService,
    private readonly chainLinkService: ChainLinkService,
    private readonly configService: ConfigService,
    private readonly accountFactoryService: AccountFactoryService
  ) {}

  public transactionTimeValid(chainId: string, timestamp: number) {
    const timeout = Date.now() - dayjs(timestamp).valueOf();
    if (timeout >= this.makerConfig.get(`${chainId}.TransferTimeout`)) {
      return false; // 'Please collect manually if the transaction exceeds the specified time'
    }
    return true;
  }

  public async transactionGetPrivateKey(transfer: TransferAmountTransaction) {
    const addressList: string[] = uniq(
      transfer.responseMaker || [transfer.sourceMaker]
    );
    const wallet = {
      address: "",
      balance: 0,
      token: null,
      account: null,
      errors: [],
    };
    const token = this.chainConfigService.getTokenByAddress(
      transfer.targetChain,
      transfer.targetToken
    );
    if (!token) {
      throw new Error("transactionGetPrivateKey token not found");
    }
    const transferAmount = BigInt(
      new BigNumber(transfer.targetAmount)
        .times(10 ** token.decimals)
        .toFixed(0)
    );
    for (const address of addressList) {
      try {
        // inject privateKey
        const privateKey = this.getSenderPrivateKey(address);
        if (!privateKey) {
          wallet.errors.push(`${address} Not PrivateKey`);
          continue;
        }
        // valid balance
        const account = await this.accountFactoryService.createMakerAccount(
          address,
          transfer.targetChain
        );
        const balance = await account.getBalance(address, transfer.targetToken);
        if (balance && balance > transferAmount) {
          await account.connect(privateKey);
          return {
            account,
            token,
            address: account.address,
            balanceWei: balance,
            balance: new BigNumber(balance.toString())
              .div(10 ** token.decimals)
              .toString(),
          };
        } else {
          wallet.errors.push(`${address} Insufficient Balance`);
        }
      } catch (error) {
        wallet.errors.push(`${address} execute error ${error.message}`);
      }
    }
    return wallet;
  }

  public async transactionGetPrivateKeys(
    chainId: string,
    token: string,
    transfers: TransferAmountTransaction[]
  ) {
    const errors = [];
    const groupData = groupBy(transfers, "responseMaker");
    const transferRelWallet: Record<string, TransferAmountTransaction[]> = {};
    const accounts: Record<string, OrbiterAccount> = {};
    const transferToken = this.chainConfigService.getTokenByAddress(
      chainId,
      token
    );
    if (!transferToken) {
      throw new Error(`${token} transferToken not found`);
    }
    const batchTransferCount =
      this.makerConfig.get(`${chainId}.BatchTransferCount`) || 1;
    const transferWalletRelAmount = {};
    for (const key in groupData) {
      const makers = key.split(",");
      const batchTransfers: TransferAmountTransaction[] = take(
        groupData[key],
        batchTransferCount
      );
      const totalSend: number = batchTransfers.reduce(
        (total, current) => total + +current.targetAmount,
        0
      );
      const totalSendWei = new BigNumber(totalSend).times(
        10 ** transferToken.decimals
      );
      for (const address of makers) {
        const senderAddress = address.toLocaleLowerCase();
        const privateKey = this.getSenderPrivateKey(senderAddress);
        if (!privateKey) {
          errors.push(`${senderAddress} Not PrivateKey`);
          continue;
        }
        const account = await this.accountFactoryService
          .createMakerAccount(senderAddress, chainId)
          .connect(privateKey);
        if (account) {
          if (transferWalletRelAmount[senderAddress] === undefined) {
            const balance = await account.getBalance(senderAddress, token);
            transferWalletRelAmount[senderAddress] = balance;
          }
          const balance = transferWalletRelAmount[senderAddress];
          if (balance < totalSendWei) {
            errors.push(
              `${senderAddress} Insufficient Balance ${totalSendWei}/${balance}`
            );
            continue;
          }
          if (balance >= totalSendWei) {
            transferWalletRelAmount[senderAddress] -= BigInt(
              totalSendWei.toFixed(0)
            );
            if (!transferRelWallet[senderAddress]) {
              transferRelWallet[senderAddress] = [];
            }
            transferRelWallet[senderAddress].push(...batchTransfers);
            accounts[senderAddress] = account;
          }
        }
      }
    }
    const result = {};
    for (const address in accounts) {
      result[address] = {
        account: accounts[address],
        transfers: transferRelWallet[address],
      };
    }
    return { result, errors };
  }

  public checkSenderPrivateKey(from: string) {
    return !isEmpty(this.getSenderPrivateKey(from));
  }

  public getSenderPrivateKey(from: string) {
    const privateKey =
      process.env[from.toLocaleLowerCase()] ||
      this.configService.get[from.toLocaleLowerCase()];
    return privateKey;
  }

  public isSupportXVM(chainId: number): boolean {
    const chain = this.chainConfigService.getChainInfo(chainId);
    if (chain && chain.xvmList) {
      return chain.xvmList.length > 0;
    }
    return false;
  }

  public async validatingValueMatches(
    sourceSymbol: string,
    sourceAmount: string,
    targetSymbol: string,
    targetAmount: string
  ) {
    const sourceAmountValue = await this.chainLinkService.getChainLinkPrice(
      sourceAmount,
      sourceSymbol,
      "usd"
    );
    const targetAmountValue = await this.chainLinkService.getChainLinkPrice(
      targetAmount,
      targetSymbol,
      "usd"
    );
    console.log(
      sourceAmountValue.toString(),
      "==sourceAmountValue",
      targetAmountValue.toString()
    );
    const diffRate = targetAmountValue.div(sourceAmountValue).times(100);
    const riskRatio = Number(this.makerConfig.get("riskRatio") || 98);
    if (diffRate.gte(riskRatio)) {
      return false;
      // throw new Error(`validatingValueMatches Trading with loss and risk ${sourceAmount}-${sourceSymbol} To ${targetAmount}-${targetSymbol}`)
    }
    return true;
  }
}
