import { Module } from "@nestjs/common";
import { ValidatorService } from "./validator/validator.service";
import { SequencerService } from "./sequencer/sequencer.service";
import { AccountFactoryService } from "src/account/factory";
import { TransfersModel, BridgeTransactionModel } from "src/models";
import { SequelizeModule } from "@nestjs/sequelize";
import { SequencerScheduleService } from "./sequencer/sequencer.schedule";
@Module({
  imports: [
    SequelizeModule.forFeature([TransfersModel, BridgeTransactionModel]),
  ],
  providers: [
    SequencerScheduleService,
    SequencerService,
    ValidatorService,
    AccountFactoryService,
  ],
})
export class TransferModule {}
