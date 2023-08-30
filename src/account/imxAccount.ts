import { ethers } from "ethers6";
import {
  ImmutableX,
  Config,
  createStarkSigner,
  generateLegacyStarkPrivateKey,
} from "@imtbl/core-sdk";
import OrbiterAccount from "./orbiterAccount";
import { type TransactionRequest, type TransferResponse } from "./IAccount";
import { equals } from "src/utils";
import { type IChainConfig } from "src/config/chainsConfig.service";
export default class IMXAccount extends OrbiterAccount {
  private L1Wallet: ethers.Wallet;
  private readonly client: ImmutableX;
  constructor(protected chainConfig: IChainConfig) {
    super(chainConfig);
    const id = +chainConfig.internalId;
    this.client = new ImmutableX(id === 8 ? Config.PRODUCTION : Config.SANDBOX);
  }

  async connect(privateKey: string) {
    const id = +this.chainConfig.internalId;
    const L1Provider = ethers.getDefaultProvider(
      id === 8 ? "mainnet" : "goerli"
    );
    this.L1Wallet = new ethers.Wallet(privateKey).connect(L1Provider);
    return this;
  }

  public async transfer(
    to: string,
    value: bigint,
    transactionRequest?: TransactionRequest
  ): Promise<TransferResponse | undefined> {
    return await this.transferToken(
      String(this.chainConfig.nativeCurrency.address),
      to,
      value,
      transactionRequest
    );
  }

  public async getBalance(address?: string, token?: string): Promise<bigint> {
    if (token && token != this.chainConfig.nativeCurrency.address) {
      return await this.getTokenBalance(token, address);
    } else {
      return await this.getTokenBalance(
        this.chainConfig.nativeCurrency.symbol,
        address
      );
    }
  }

  public async getTokenBalance(
    token: string,
    address?: string
  ): Promise<bigint> {
    const result = await this.client.getBalance({
      owner: address || this.L1Wallet.address,
      address: token,
    });
    return BigInt(result.balance);
  }

  public async transferToken(
    token: string,
    to: string,
    value: bigint,
    transactionRequest?: TransactionRequest
  ): Promise<TransferResponse | undefined> {
    const unsignedTransferRequest: any = {
      type: "",
      receiver: to,
      amount: value, // Denominated in wei
    };
    if (equals(this.chainConfig.nativeCurrency.address, token)) {
      unsignedTransferRequest.type = "ETH";
    } else {
      unsignedTransferRequest.type = "ERC20";
      unsignedTransferRequest.tokenAddress = token;
    }
    const starkKey = await generateLegacyStarkPrivateKey(this.L1Wallet as any);
    const starkSigner = await createStarkSigner(starkKey);
    const walletConnection: any = { ethSigner: this.L1Wallet, starkSigner };
    const response = await this.client.transfer(
      walletConnection,
      unsignedTransferRequest
    );
    this.logger.info("transfer response:", response);
    return {
      hash: String(response.transfer_id),
      from: this.L1Wallet.address,
      to,
      value,
      nonce: 0,
      token,
    };
  }
}
