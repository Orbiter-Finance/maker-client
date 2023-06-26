import * as Keyv from 'keyv';
import * as winston from 'winston';

import { DB } from './db';
import { Models } from './models';
import Sequencer from './service/sequencer';
import ValidatorService from './service/validator';
import { Config } from './types/config';
import Caching from './utils/caching';
import configs from './config/config';
import { LoggerService } from './utils/logger';
import { SMSService } from './lib/sms';
import { watchConsulConfig } from "./config/consul";
type NODE_ENV = 'development' | 'production' | 'test';
export default class Context {
  public config: Config = configs as any;
  public db!: Models;
  public caching!: Keyv;
  public validator: ValidatorService;
  public smsService:SMSService = new SMSService(this);
  public sequencer!: Sequencer;
  public startTime:number = Date.now();
  public NODE_ENV: NODE_ENV =
    <NODE_ENV>process.env['NODE_ENV'] || 'development';
  public logger: winston.Logger = LoggerService.getLogger("");
  constructor() {
    this.logger.info("init context...");
    this.validator = new ValidatorService(this);
  }
  public async init() {
    await watchConsulConfig(this);
    this.db = await new DB(this).init();
    this.caching = Caching.getCache('sys');
    this.sequencer = new Sequencer(this);
  }
}
