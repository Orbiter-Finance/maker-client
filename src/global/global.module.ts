import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { ChainConfigRegister, ChainConfigService } from 'src/config/chainsConfig.service';
import { MakerConfigRegister, MakerConfigService } from 'src/config/makerConfig.service';
import { TransfersModel, BridgeTransactionModel } from 'src/models';
import { ChainLinkService } from 'src/service/chainlink.service';
import { ConsulModule } from '../consul/consul.module'
import { sleep } from 'src/utils';
@Global()
@Module({
    imports: [
        SequelizeModule.forRootAsync({
            inject: [ConfigService, MakerConfigService],
            useFactory: async (config: ConfigService, makerConfig: MakerConfigService) => {
                let connectionString = '';
                while (true) {
                    connectionString = await makerConfig.get("DATABASE_URL");
                    if (connectionString) {
                        break;
                    }
                    console.log('Database connection not obtained');
                    await sleep(1000);
                }
                const parsedUrl = new URL(connectionString);
                return {
                    dialect: parsedUrl.protocol.replace(':', ''),
                    host: parsedUrl.hostname,
                    database: parsedUrl.pathname.replace('/', ''),
                    username: parsedUrl.username,
                    password: parsedUrl.password,
                    port: parsedUrl.port,
                    autoLoadModels: true,
                    logging: false,
                    models: [TransfersModel, BridgeTransactionModel],
                    dialectOptions: {
                        ssl: {
                            require: true,
                            rejectUnauthorized: false  // You might want to set this to true in production for security reasons
                        }
                    }
                } as any;
            }
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
                        token: config.get("CONSUL_TOKEN")
                    }
                };
            }
        }),
        ConfigModule.forRoot({
            isGlobal: true,
            load: [MakerConfigRegister(), ChainConfigRegister()]
        }),
    ],
    providers: [ChainConfigService, ChainLinkService, ConfigService, MakerConfigService],
    exports: [ChainConfigService, ChainLinkService, ConfigService, MakerConfigService]
})
export class GlobalModule { }
