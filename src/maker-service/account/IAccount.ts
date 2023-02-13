import { BigNumber, ethers } from 'ethers';
export interface TransferResponse {
  hash: string;
  to: string | undefined;
  from: string;
  nonce: number;
  gasLimit?: BigNumber;
  gasPrice?: BigNumber;
  fee?: BigNumber,
  token?: string;
  data?: string;
  value: BigNumber;
};
export interface TransactionResponse extends ethers.providers.TransactionResponse {
};

export type TransactionRequest = ethers.providers.TransactionRequest;

export interface ZKSpaceSendTokenRequest extends Partial<TransactionRequest>{
  tokenId:number,
  feeTokenId: number,
  fee: ethers.BigNumber
};
export default abstract class IAccount {
  constructor(protected internalId: number, protected readonly privateKey: string) { }
  public abstract transfer(
    to: string,
    value: string,
    transactionRequest?: TransactionRequest | any
  ): Promise<TransferResponse | undefined>;
  public abstract getBalance(to?: string, token?: string): Promise<ethers.BigNumber>;
  public abstract getTokenBalance(
    token: string,
    to: string
  ): Promise<ethers.BigNumber>;

  public abstract transferToken(
    token: string,
    to: string,
    value: string,
    transactionRequest?: TransactionRequest | any
  ): Promise<TransferResponse | undefined>;
}
