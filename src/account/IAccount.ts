import {
  type TransactionRequest as ETransactionRequest,
  type TransactionResponse as ETransactionResponse,
} from "ethers6";
export interface TransferResponse {
  hash: string;
  to: string | undefined;
  from: string;
  nonce: number;
  gasLimit?: bigint;
  gasPrice?: bigint;
  fee?: bigint;
  feeSymbol?: string;
  symbol?: string;
  token?: string;
  data?: string;
  value: bigint;
  _response?: any;
}
export interface TransactionResponse extends ETransactionResponse {}

export interface TransactionRequest extends ETransactionRequest {
  serialId?: string | string[];
}

export interface ZKSpaceSendTokenRequest extends Partial<TransactionRequest> {
  tokenId: number;
  feeTokenId: number;
  fee: bigint;
}
export default abstract class IAccount {
  public address: string;
  constructor(protected chainId: string) {}
  public abstract transfer(
    to: string,
    value: bigint,
    transactionRequest?: TransactionRequest | any
  ): Promise<TransferResponse | undefined>;
  public abstract getBalance(to?: string, token?: string): Promise<bigint>;
  public abstract getTokenBalance(token: string, to: string): Promise<bigint>;
  public abstract transferToken(
    token: string,
    to: string,
    value: bigint,
    transactionRequest?: TransactionRequest | any
  ): Promise<TransferResponse | undefined>;
}
