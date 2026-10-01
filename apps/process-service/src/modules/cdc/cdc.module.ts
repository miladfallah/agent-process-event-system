import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LeaderboardCounter, LeaderboardCounterSchema } from '../../infrastructure/database/schemas/leaderboard-counter.schema';
import { CdcService } from './cdc.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: LeaderboardCounter.name, schema: LeaderboardCounterSchema }]),
  ],
  providers: [CdcService],
})
export class CdcModule {}
