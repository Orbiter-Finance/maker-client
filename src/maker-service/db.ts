import { Options, Sequelize } from 'sequelize';

import Context from './context';
import { initModels, Models } from './models';

export class DB {
  constructor(private readonly ctx: Context) { }
  async init(): Promise<Models> {
    const config = this.ctx.config[
      this.ctx.NODE_ENV
    ];

    const db: Sequelize = new Sequelize({
      ...config,
      define: {
        underscored: false,
      },
    });
    const models = initModels(db);
    await db.sync({}).catch((error) => {
      console.error('sequelize sync error:', error);
    });
    return models;
  }
}
