import { chains, logger } from 'orbiter-chaincore';
import { equals, groupBy } from 'orbiter-chaincore/src/utils/core';
import Context from '../context';

import BaseAccount from './baseAccount';
import EVMAccount from './evmAccount';
import XVMAccount from './xvmAccount';
import zkSyncAccount from './zkSyncAccount';

export class Factory {
  private static wallets: { [key: string]: BaseAccount } = {}; // key = pk + chainId
  static createMakerAccount<T extends BaseAccount>(
    privateKey: string,
    toChainId: number,
    isXVM?: boolean
  ): T {
    const chainConfig = chains.getChainInfo(toChainId);
    if (!chainConfig) {
      throw new Error(`${toChainId} chain not found`)
    }
    const walletId = (`${privateKey}${chainConfig.chainId}`).toLocaleLowerCase();
    let wallet: BaseAccount = Factory.wallets[walletId];
    if (wallet) {
      return wallet as T;
    }
    switch (toChainId) {
      case 1:
      case 2:
      case 22:
      case 5:
      case 599:
      case 6:
      case 66:
      case 7:
      case 77:
      case 10:
      case 510:
      case 13:
      case 513:
      case 14:
      case 514:
      case 15:
      case 515:
      case 16:
      case 516:
      case 17:
      case 517:
      case 18:
      case 19:
      case 518:
      case 519:
        if (isXVM) {
          if (chainConfig['xvmList'].length>0) {
            wallet = new XVMAccount(privateKey, chainConfig.rpc[0], chainConfig['xvmList'][0]);
          }
        } else {
          wallet = new EVMAccount(privateKey, chainConfig.rpc[0]);
        }
        break;
      case 3:
      case 33:
        wallet = new zkSyncAccount(
          privateKey,
          equals(toChainId, 3) ? 'mainnet' : 'goerli'
        );
        break;
    }
    Factory.wallets[walletId] = wallet;
    return wallet as T;
  }
}