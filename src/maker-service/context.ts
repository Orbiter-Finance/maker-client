import { LoggerService } from 'orbiter-chaincore/src/utils';
import Keyv from 'keyv';
import { chains } from 'orbiter-chaincore';
import winston from 'winston';

import { DB } from './db';
import { Models } from './models';
import Sequencer from './service/sequencer';
import ValidatorService from './service/validator';
import { Config } from './types/config';
import Caching from './utils/caching';
type NODE_ENV = 'development' | 'production' | 'test';
import configs from './config/config';
import chainConfigs from './config/chains.json';
export default class Context {
  public config: Config = configs as any;
  public db!: Models;
  public caching!: Keyv;
  public validator: ValidatorService;
  public sequencer!: Sequencer;
  public NODE_ENV: NODE_ENV =
    <NODE_ENV>process.env['NODE_ENV'] || 'development';
  public logger: winston.Logger = LoggerService.getLogger("");
  constructor() {
    chains.fill(chainConfigs as any);
    this.logger.info("init context...");
    this.validator = new ValidatorService(this);
  }
  public async init() {
    this.db = await new DB(this).init();
    this.caching = Caching.getCache('sys');
    this.sequencer = new Sequencer(this);
  }
}
