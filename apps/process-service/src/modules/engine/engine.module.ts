import { Module } from '@nestjs/common';
import { EngineService } from './engine.service';
import { EvaluatorService } from './evaluator.service';
import { RulesModule } from '../rules/rules.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Event, EventSchema } from '../../infrastructure/database/schemas/event.schema';
import { RuleMatch, RuleMatchSchema } from '../../infrastructure/database/schemas/rule-match.schema';
import { LeaderboardCounter, LeaderboardCounterSchema } from '../../infrastructure/database/schemas/leaderboard-counter.schema';

@Module({
  imports: [
    RulesModule,
    MongooseModule.forFeature([
      { name: Event.name, schema: EventSchema },
      { name: RuleMatch.name, schema: RuleMatchSchema },
      { name: LeaderboardCounter.name, schema: LeaderboardCounterSchema },
    ]),
  ],
  providers: [EngineService, EvaluatorService],
  exports: [EngineService],
})
export class EngineModule {}
