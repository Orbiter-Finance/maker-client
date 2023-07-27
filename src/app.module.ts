import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './service/prisma.service';
import { TransferModule } from './transfer/transfer.module';
import { ConfigModule } from '@nestjs/config';
import { ChainConfigService } from './config/chainConfig.service';
import { GlobalModule } from './global/global.module';
import { ScheduleModule } from '@nestjs/schedule';
import { MakerConfigRegister } from './config/makerConfig.service';
import { ChainConfigRegister } from './config/chainConfig.service';

@Module({
  imports: [
    GlobalModule,
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [MakerConfigRegister(),ChainConfigRegister()]
    }), TransferModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
