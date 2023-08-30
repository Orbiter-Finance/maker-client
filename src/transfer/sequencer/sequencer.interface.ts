import { type Mutex } from "async-mutex";

export interface Sequencer {}

export interface submitResponse {
  chainId: number;
  error?: Error | string;
  makerDeal?: SwapOrder[];
}
export interface CalldataType {
  id?: number;
  chainId: string;
  hash: string;
  // token: string;
  symbol: string;
  value: string;
  nonce: string;
  // expectValue: string;
  timestamp: number;
  slipPoint?: number;
}
export enum SwapOrderType {
  None,
  UA,
  CrossAddr,
  CrossToken,
}
export interface SwapOrder {
  chainId: string;
  hash: string;
  token: string;
  from: string;
  to: string;
  symbol: string;
  nonce: string;
  value: string;
  calldata: CalldataType;
  type: SwapOrderType;
  error?: Error | string | unknown;
}
export interface MonitorState {
  lock: Mutex;
  // locked: boolean;
  lastSubmit: number;
}

export interface TransferAmountTransaction {
  transactionId: string;
  sourceId: string;
  targetId: string;
  sourceChain: string;
  targetChain: string;
  sourceAmount: string;
  targetAmount: string;
  sourceMaker: string;
  targetMaker: string;
  sourceAddress: string;
  targetAddress: string;
  sourceSymbol: string;
  targetSymbol: string;
  sourceNonce: string;
  sourceToken: string;
  targetToken: string;
  responseMaker: string[];
}
