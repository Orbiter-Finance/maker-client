import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { TransferModule } from "./transfer/transfer.module";
import { GlobalModule } from "./global/global.module";

@Module({
  imports: [GlobalModule, TransferModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
