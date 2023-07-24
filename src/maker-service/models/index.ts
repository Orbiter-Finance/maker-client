import { Sequelize } from 'sequelize';

import { MakerTransaction } from './MakerTransaction';
import { BridgeTransaction } from './BridgeTransaction';
import { Transaction } from './Transactions';
export interface Models {
  BridgeTransaction: typeof BridgeTransaction,
  MakerTransaction: typeof MakerTransaction,
  Transaction: typeof Transaction,
  sequelize: Sequelize
}
export function initModels(sequelize?: Sequelize):Models {
  const Entitys = {
  }
  for (const modelKey in Entitys) {
    Entitys[modelKey].initModel(sequelize);
  }
  Entitys['sequelize'] = sequelize;
  return Entitys as Models;
}
