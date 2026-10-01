import { Controller, Get, Query, Param, BadRequestException } from '@nestjs/common';
import { ReportingService } from './reporting.service';

@Controller('reports')
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('time-range/:ruleId')
  async getTimeRange(
    @Param('ruleId') ruleId: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = 100,
  ) {
    if (!startTime || !endTime) {
      throw new BadRequestException('startTime and endTime are required');
    }
    return this.reportingService.getTimeRangeReport(ruleId, startTime, endTime, cursor, Number(limit));
  }

  @Get('leaderboard/:ruleId')
  async getLeaderboard(@Param('ruleId') ruleId: string) {
    return this.reportingService.getLeaderboard(ruleId);
  }
}
