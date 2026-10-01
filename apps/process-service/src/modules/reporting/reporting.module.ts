import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RuleMatch, RuleMatchSchema } from '../../infrastructure/database/schemas/rule-match.schema';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: RuleMatch.name, schema: RuleMatchSchema }]),
  ],
  controllers: [ReportingController],
  providers: [ReportingService],
})
export class ReportingModule {}
