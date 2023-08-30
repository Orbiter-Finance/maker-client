import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { TransferModule } from "./transfer/transfer.module";
import { GlobalModule } from "./global/global.module";
import { ScheduleModule } from "@nestjs/schedule";

@Module({
  imports: [GlobalModule, ScheduleModule.forRoot(), TransferModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
