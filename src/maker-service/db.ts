import { Options, Sequelize } from 'sequelize';

import Context from './context';
import { initModels, Models } from './models';

export class DB {
  constructor(private readonly ctx: Context) { }
  async init(): Promise<Models> {
    const db: Sequelize = new Sequelize(this.ctx.config.MYSQL, {
      logging: true,
      define: {
        underscored: false,
      },
    })

    const models = initModels(db);
    await db.sync({}).catch((error) => {
      console.error('sequelize sync error:', error);
    });
    return models;
  }
}
