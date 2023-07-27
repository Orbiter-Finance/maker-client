import { Module } from '@nestjs/common';
import { ValidatorService } from './validator/validator.service';
import { SequencerService } from './sequencer/sequencer.service';
import { GlobalModule } from 'src/global/global.module';
import { ConfigService } from '@nestjs/config';

@Module({
  imports:[],
  providers: [ SequencerService, ValidatorService]
})
export class TransferModule {}
