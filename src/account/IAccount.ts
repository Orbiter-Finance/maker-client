import { TransactionRequest as ETransactionRequest,TransactionResponse as ETransactionResponse, ethers } from 'ethers';
export interface TransferResponse {
  hash: string;
  to: string | undefined;
  from: string;
  nonce: number;
  gasLimit?: BigInt;
  gasPrice?: BigInt;
  fee?: BigInt,
  feeSymbol?: string,
  symbol?: string;
  token?: string;
  data?: string;
  value: BigInt;
  _response?: any
};
export interface TransactionResponse extends ETransactionResponse {
};

export interface TransactionRequest extends ETransactionRequest{
  serialId?:string | string[];
};

export interface ZKSpaceSendTokenRequest extends Partial<TransactionRequest>{
  tokenId:number,
  feeTokenId: number,
  fee: BigInt
};
export default abstract class IAccount {
  constructor(protected internalId: number) { }
  public abstract transfer(
    to: string,
    value: BigInt,
    transactionRequest?: TransactionRequest | any
    ): Promise<TransferResponse | undefined>;
  public abstract getBalance(to?: string, token?: string): Promise<BigInt>;
  public abstract getTokenBalance(
    token: string,
    to: string
  ): Promise<BigInt>;
  
  public abstract transferToken(
    token: string,
    to: string,
    value: BigInt,
    transactionRequest?: TransactionRequest | any
    ): Promise<TransferResponse | undefined>;
    
}
