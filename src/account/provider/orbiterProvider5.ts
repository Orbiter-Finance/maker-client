import * as ethers from "ethers";

export default class Orbiter5Provider extends ethers.providers
  .StaticJsonRpcProvider {
  // _wrapTransactionReceipt(value: TransactionReceiptParams, network: Network): TransactionReceipt {
  //     const result = super._wrapTransactionReceipt(value, network);
  //     const keys = Object.keys(result);
  //     const extra = {};
  //     for (const k in value) {
  //         if (!keys.includes(k) && k!='logs') {
  //             extra[k] = value[k];
  //         }
  //     }
  //     result["extra"]  = extra;
  //     return result;
  // }
}
