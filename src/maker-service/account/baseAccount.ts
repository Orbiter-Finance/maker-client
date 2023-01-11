import { ethers } from 'ethers';
export type TransactionResponse = ethers.providers.TransactionResponse;
export type TransactionRequest = ethers.providers.TransactionRequest;
export default abstract class BaseAccount {
  constructor(protected readonly privateKey: string) {}
  public abstract transfer(
    to: string,
    value: string,
    transactionRequest?: TransactionRequest
  ): Promise<TransactionResponse>;
  public abstract getBalance(to?: string, token?:string): Promise<ethers.BigNumber>;
  public abstract getTokenBalance(
    token: string,
    to: string
  ): Promise<ethers.BigNumber>;

  public abstract transferToken(
    token: string,
    to: string,
    value: string,
    transactionRequest?: TransactionRequest
  ): Promise<TransactionResponse>;
}
