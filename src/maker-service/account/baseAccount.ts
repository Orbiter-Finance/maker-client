import { BigNumber, ethers } from 'ethers';
export interface TransferResponse {
  internalId: number,
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
  wait?: Function
};
export interface TransactionResponse extends ethers.providers.TransactionResponse {
};

export type TransactionRequest = ethers.providers.TransactionRequest;
export default abstract class BaseAccount {
  constructor(protected internalId: number, protected readonly privateKey: string) { }
  public abstract transfer(
    to: string,
    value: string,
    transactionRequest?: TransactionRequest
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
    transactionRequest?: TransactionRequest
  ): Promise<TransferResponse | undefined>;
}
