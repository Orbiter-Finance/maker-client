import { type TransactionRequest } from "../account/IAccount";

export interface JsonMap {
  [member: string]: string | number | boolean | null | JsonArray | JsonMap;
}

export type JsonArray = Array<
  string | number | boolean | null | JsonArray | JsonMap
>;

export type Json = JsonMap | JsonArray | string | number | boolean | null;

export interface ZKSpaceSendTokenRequest extends Partial<TransactionRequest> {
  tokenId: number;
  feeTokenId: number;
  fee: bigint;
}
export interface LoopringSendTokenRequest extends TransactionRequest {
  maxFee?: number;
  feeTokenId?: number;
  memo?: string; // max 128
}
