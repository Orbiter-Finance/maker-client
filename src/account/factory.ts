
// import BaseAccount from './IAccount';
import EVMAccount from './evmAccount';
import { Global, Inject, Injectable } from '@nestjs/common';
// import StarknetAccount from './starknetAccount';
// import ZKSyncAccount from './zkSyncAccount';
// import ZKSpaceAccount from './zksAccount';
import IMXAccount from './imxAccount';
import LoopringAccount from './loopringAccount'
import { ChainConfigService } from 'src/config/chainConfig.service';
import OrbiterAccount from './orbiterAccount';
@Injectable()
export class AccountFactoryService {
  constructor(private chainService: ChainConfigService) {
  }
  private static wallets: { [key: string]: OrbiterAccount } = {}; // key = pk + chainId
  createMakerAccount<T extends OrbiterAccount>(
    makerAddress: string,
    toChainId: number,
  ): T {
    // const chainService = new ChainConfigService();
    const chainConfig = this.chainService.getChainInfo(toChainId);
    if (!chainConfig) {
      throw new Error(`${toChainId} chain not found`)
    }
    const walletId = (`${makerAddress}${chainConfig.chainId}`).toLocaleLowerCase();
    let wallet: OrbiterAccount = AccountFactoryService.wallets[walletId];
    if (wallet) {
      return wallet as T;
    }
    switch (toChainId) {
      case 3:
      case 33:
        // wallet = new ZKSyncAccount(
        //   toChainId,
        //   privateKey
        // );
        break;
      case 4:
      case 44:
        // wallet = new StarknetAccount(
        //   toChainId,
        //   privateKey,
        //   makerAddress.toLocaleLowerCase()
        // );
        break;
      case 8:
      case 88:
        wallet = new IMXAccount(
          chainConfig,
        );
        break;
      case 9:
      case 99:
        wallet = new LoopringAccount(
          chainConfig,
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
      case 524:
      case 525:
        // if (ValidatorService.isSupportXVM(toChainId)) {
        //   wallet = new XVMAccount(toChainId, privateKey);
        // } else {
        wallet = new EVMAccount(chainConfig);
        // }
        break;
      case 512:
        // wallet = new ZKSpaceAccount(
        //   toChainId,
        //   privateKey
        // );
        break;
      default:
        throw new Error('Chain Not implemented')
        break;
    }
    AccountFactoryService.wallets[walletId] = wallet;
    return wallet as T;
  }
}