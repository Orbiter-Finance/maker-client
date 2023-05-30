import { chains } from 'orbiter-chaincore';
import ValidatorService from '../service/validator';

import BaseAccount from './IAccount';
import EVMAccount from './evmAccount';
import XVMAccount from './orbiterXAccount';
import StarknetAccount from './starknetAccount';
import ZKSyncAccount from './zkSyncAccount';
import ZKSpaceAccount from './zksAccount';
import IMXAccount from './imxAccount';
import LoopringAccount from './loopringAccount'
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
      case 3:
      case 33:
        wallet = new ZKSyncAccount(
          toChainId,
          privateKey
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
      case 8:
      case 88:
        wallet = new IMXAccount(
          toChainId,
          privateKey
        );
        break;
      case 9:
      case 99:
            wallet = new LoopringAccount(
              toChainId,
              privateKey
            );
            break;
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
      case 521:
      case 522:
      case 523:
        if (ValidatorService.isSupportXVM(toChainId)) {
          wallet = new XVMAccount(toChainId, privateKey);
        } else {
          wallet = new EVMAccount(toChainId, privateKey);
        }
        break;
      case 512:
        wallet = new ZKSpaceAccount(
          toChainId,
          privateKey
        );
        break;
        default:
          throw new Error('Chain Not implemented')
          break;
    }
    Factory.wallets[walletId] = wallet;
    return wallet as T;
  }
}