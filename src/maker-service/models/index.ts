import type { Sequelize } from 'sequelize';

import { MakerTransaction } from './MakerTransaction';
import { Message } from './Message';
import { Sequencer } from './Sequencer';
import { Transaction } from './Transactions';
const Entitys = {
  MakerTransaction,
  Message,
  Transaction,
  Sequencer
};
export type Models = typeof Entitys;
export function initModels(sequelize?: Sequelize) {
  for (const modelKey in Entitys) {
    Entitys[modelKey].initModel(sequelize);
  }
  return Entitys;
}
