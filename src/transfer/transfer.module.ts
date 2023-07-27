import { Module } from '@nestjs/common';
import { ValidatorService } from './validator/validator.service';
import { SequencerService } from './sequencer/sequencer.service';
import { GlobalModule } from 'src/global/global.module';
import { ConfigService } from '@nestjs/config';
import { AccountFactoryService } from 'src/account/factory';

@Module({
  imports:[],
  providers: [ SequencerService, ValidatorService, AccountFactoryService]
})
export class TransferModule {}
