import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class TimeRangeQueryDto {
  @ApiProperty({
    description: 'Start of the time window in ISO-8601 format (must be within 24 hours of endTime)',
    example: '2026-10-02T19:00:00.000Z',
    format: 'date-time',
  })
  @IsString()
  @IsNotEmpty()
  startTime: string;

  @ApiProperty({
    description: 'End of the time window in ISO-8601 format',
    example: '2026-10-02T20:00:00.000Z',
    format: 'date-time',
  })
  @IsString()
  @IsNotEmpty()
  endTime: string;

  @ApiPropertyOptional({
    description: 'Base64 cursor for keyset pagination, obtained from previous nextCursor',
    example: 'MTc5MDk3MjAyMTI2Ng==',
  })
  @IsString()
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of match records to evaluate in this page (1 to 1000)',
    default: 100,
    minimum: 1,
    maximum: 1000,
    example: 50,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  @IsOptional()
  limit?: number = 100;
}

export class TimeRangeReportResponseDto {
  @ApiProperty({
    description: 'Map of agentId to array of event occurrence timestamps matching the rule in the queried time window',
    example: {
      'agent-1': ['2026-10-02T20:13:36.841Z', '2026-10-02T20:13:41.266Z'],
      'agent-2': ['2026-10-02T20:13:40.264Z'],
    },
  })
  data: Record<string, string[]>;

  @ApiProperty({
    description: 'Opaque base64 cursor pointing to the next page of results, or null if no further pages exist',
    nullable: true,
    example: 'MTc5MDk3MjAyNDkxNw==',
  })
  nextCursor: string | null;
}

export class LeaderboardEntryDto {
  @ApiProperty({
    description: 'Unique identifier of the reporting agent',
    example: 'agent-1',
  })
  agentId: string;

  @ApiProperty({
    description: 'Total number of rule matches accumulated for this agent',
    example: 125,
  })
  count: number;
}
