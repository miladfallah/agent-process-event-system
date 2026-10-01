import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Rule, RuleSchema } from '../../infrastructure/database/schemas/rule.schema';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Rule.name, schema: RuleSchema }])],
  controllers: [RulesController],
  providers: [RulesService],
  exports: [RulesService],
})
export class RulesModule {}
