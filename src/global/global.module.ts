import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChainConfigService } from 'src/config/chainconfig.service';
import { MakerConfigService } from 'src/config/makerConfig.service';
import { ChainLinkService } from 'src/service/chainlink.service';
import { PrismaService } from 'src/service/prisma.service';
@Global()
@Module({
    providers:[ChainConfigService,PrismaService,ChainLinkService, ConfigService, MakerConfigService],
    exports:[ChainConfigService,PrismaService,ChainLinkService,ConfigService,MakerConfigService]
})
export class GlobalModule {}
