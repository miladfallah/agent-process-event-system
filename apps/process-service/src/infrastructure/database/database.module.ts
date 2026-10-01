import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Event, EventSchema } from './schemas/event.schema';
import { Rule, RuleSchema } from './schemas/rule.schema';
import { RuleMatch, RuleMatchSchema } from './schemas/rule-match.schema';
import { LeaderboardCounter, LeaderboardCounterSchema } from './schemas/leaderboard-counter.schema';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/event-system',
      }),
    }),
    MongooseModule.forFeature([
      { name: Event.name, schema: EventSchema },
      { name: Rule.name, schema: RuleSchema },
      { name: RuleMatch.name, schema: RuleMatchSchema },
      { name: LeaderboardCounter.name, schema: LeaderboardCounterSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
