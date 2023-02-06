import { chains, logger } from 'orbiter-chaincore';
import { equals, groupBy } from 'orbiter-chaincore/src/utils/core';
import Context from '../context';
import ValidatorService from '../service/validator';

import BaseAccount from './IAccount';
import EVMAccount from './evmAccount';
import XVMAccount from './xvmAccount';
import zkSyncAccount from './zkSyncAccount';
import StarknetAccount from './starknetAccount';

export class Factory {
  private static wallets: { [key: string]: BaseAccount } = {}; // key = pk + chainId
  static createMakerAccount<T extends BaseAccount>(
    makerAddress: string,
    privateKey: string,
    toChainId: number,
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
      case 520:
        if (ValidatorService.isSupportXVM(toChainId)) {
          wallet = new XVMAccount(toChainId, privateKey);
        } else {
          wallet = new EVMAccount(toChainId, privateKey);
        }
        break;
      case 3:
      case 33:
        wallet = new zkSyncAccount(
          toChainId,
          privateKey,
          equals(toChainId, 3) ? 'mainnet' : 'goerli'
        );
        break;
      case 4:
      case 44:
        wallet = new StarknetAccount(
          toChainId,
          privateKey,
          makerAddress.toLocaleLowerCase()
        );
        break;
    }
    Factory.wallets[walletId] = wallet;
    return wallet as T;
  }
}