import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChainConfigRegister, ChainConfigService } from 'src/config/chainConfig.service';
import { MakerConfigRegister, MakerConfigService } from 'src/config/makerConfig.service';
import { ConsulModule } from 'src/consul/consul.module';
import { ChainLinkService } from 'src/service/chainlink.service';
import { PrismaService } from 'src/service/prisma.service';
@Global()
@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            load: [MakerConfigRegister(), ChainConfigRegister()]
        }),
        ConsulModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: async (configService: ConfigService) => {
                const configs = configService.get('CONSUL').split(":");
                return {
                    keys: [{ key: 'maker-client/chains.json' }, { key: 'maker-client/config.yaml', }],
                    updateCron: '*/1 * * * *',
                    connection: {
                        protocol: 'http',
                        host: configs[0],
                        port: +configs[1],
                        token: configs[2]
                    },
                };
            },
        }),
    ],
    providers: [ChainConfigService, PrismaService, ChainLinkService, ConfigService, MakerConfigService],
    exports: [ChainConfigService, PrismaService, ChainLinkService, ConfigService, MakerConfigService]
})
export class GlobalModule { }
