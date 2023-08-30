import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { SequelizeModule } from "@nestjs/sequelize";
import { ScheduleModule } from "@nestjs/schedule";
import { SequelizeModuleOptions } from '@nestjs/sequelize';

import {
  ConfigRegister as ChainConfigRegister,
  ChainConfigService,
} from "src/config/chainsConfig.service";
import {
  ConfigRegister as ENVConfigRegister,
  ENVConfigService,
} from "src/config/envConfigService";
import { TransfersModel, BridgeTransactionModel } from "src/models";
import { ChainLinkService } from "src/service/chainlink.service";
import { ConsulModule } from "../consul/consul.module";
import { sleep } from "src/utils";
@Global()
@Module({
  imports: [
    SequelizeModule.forRootAsync({
      inject: [ConfigService, ENVConfigService],
      useFactory: async (config: ConfigService, env: ENVConfigService) => {
        let connectionString = '';
        while (true) {
          connectionString =
            (await env.get('DATABASE_URL')) ||
            (await config.get('DATABASE_URL'));
          if (connectionString) {
            console.log('Database get config');
            break;
          }
          console.log('Database connection not obtained');
          await sleep(1000);
        }
        const parsedUrl = new URL(connectionString);
        const result: SequelizeModuleOptions = {
          dialect: 'postgres',
          host: parsedUrl.hostname,
          database: parsedUrl.pathname.replace('/', ''),
          username: parsedUrl.username,
          password: parsedUrl.password,
          port: +parsedUrl.port,
          autoLoadModels: true,
          logging: false,
          models: [TransfersModel, BridgeTransactionModel],
        };
        if (connectionString.includes('.rds.')) {
          result['dialectOptions'] = {
            ssl: {
              require: true,
              rejectUnauthorized: false, // You might want to set this to true in production for security reasons
            },
          };
        }
        return result;
      },
    }),
    ConsulModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return {
          name: "MakerClient",
          host: config.get("CONSUL_HOST"),
          port: config.get("CONSUL_PORT"),
          defaults: {
            token: config.get("CONSUL_TOKEN"),
          },
        };
      },
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [ENVConfigRegister(), ChainConfigRegister()],
    }),
    ScheduleModule.forRoot()
  ],
  providers: [
    ChainConfigService,
    ChainLinkService,
    ConfigService,
    ENVConfigService,
  ],
  exports: [
    ChainConfigService,
    ChainLinkService,
    ConfigService,
    ENVConfigService,
  ],
})
export class GlobalModule {}
