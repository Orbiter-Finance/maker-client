import { Mutex } from "async-mutex";

export interface Sequencer {}

export interface submitResponse {
    chainId: number;
    error?: Error | string;
    makerDeal?: Array<SwapOrder>;
  }
  export interface CalldataType {
    id?:number;
    chainId: number;
    hash: string;
    // token: string;
    symbol:string;
    value: bigint;
    nonce: bigint;
    // expectValue: string;
    timestamp: number;
    slipPoint?: number;
  }
  export enum SwapOrderType {
    None,
    UA,
    CrossAddr,
    CrossToken
  }
  export interface SwapOrder {
    chainId: number;
    hash: string;
    from: string;
    to: string;
    // token: string;
    symbol:string;
    nonce:bigint;
    value: bigint;
    calldata: CalldataType;
    type: SwapOrderType;
    error?: Error | string | unknown;
  }
  export interface MonitorState {
    [key: number]: {
      lock: Mutex,
      // locked: boolean;
      lastSubmit: number;
    };
  }