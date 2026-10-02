import { Controller, Get, Query, Param, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ReportingService } from './reporting.service';
import { TimeRangeQueryDto, TimeRangeReportResponseDto, LeaderboardEntryDto } from './dto/reporting.dto';

@ApiTags('Reports')
@Controller('reports')
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('time-range/:ruleId')
  @ApiOperation({
    summary: 'Time-range event matches with cursor pagination (API #1)',
    description:
      'Queries match history for a given rule within a time window of up to 24 hours, grouped by agentId. Backed by the index {ruleId: 1, occurredAt: 1, agentId: 1} and opaque base64 cursor pagination.',
  })
  @ApiParam({
    name: 'ruleId',
    type: String,
    description: 'MongoDB ObjectId of the rule to report on',
    example: '6ac0102c240d4e5320f43ec5',
  })
  @ApiResponse({
    status: 200,
    description: 'Grouped timestamps by agent and optional nextCursor',
    type: TimeRangeReportResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'startTime and endTime are missing or range exceeds maximum allowed window of 24 hours',
  })
  async getTimeRange(
    @Param('ruleId') ruleId: string,
    @Query() query: TimeRangeQueryDto,
  ) {
    if (!query.startTime || !query.endTime) {
      throw new BadRequestException('startTime and endTime are required');
    }
    return this.reportingService.getTimeRangeReport(
      ruleId,
      query.startTime,
      query.endTime,
      query.cursor,
      Number(query.limit ?? 100),
    );
  }

  @Get('leaderboard/:ruleId')
  @ApiOperation({
    summary: 'Real-time leaderboard for a rule (API #2)',
    description:
      'Serves the current standings of agents ordered by match count descending. Directly read from Redis Sorted Sets populated via MongoDB Change Streams (CDC worker).',
  })
  @ApiParam({
    name: 'ruleId',
    type: String,
    description: 'MongoDB ObjectId of the rule to report on',
    example: '6ac0102c240d4e5320f43ec5',
  })
  @ApiResponse({
    status: 200,
    description: 'Ranked list of agents with accumulated match count',
    type: [LeaderboardEntryDto],
  })
  async getLeaderboard(@Param('ruleId') ruleId: string) {
    return this.reportingService.getLeaderboard(ruleId);
  }
}
