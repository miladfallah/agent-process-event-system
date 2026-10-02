import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RuleMatch } from '../../infrastructure/database/schemas/rule-match.schema';
import { REDIS_CLIENT } from '../../infrastructure/cache/cache.module';
import { Redis } from 'ioredis';

@Injectable()
export class ReportingService {
  private readonly logger = new Logger(ReportingService.name);

  constructor(
    @InjectModel(RuleMatch.name) private readonly ruleMatchModel: Model<RuleMatch>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * API #1: Time Range Report
   */
  async getTimeRangeReport(ruleId: string, startTime: string, endTime: string, cursor?: string, limit = 100) {
    const t1 = new Date(startTime);
    const t2 = new Date(endTime);

    // Validate 24h window
    if (t2.getTime() - t1.getTime() > 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Time range must not exceed 24 hours');
    }

    const query: any = {
      ruleId,
      occurredAt: { $gte: t1, $lte: t2 },
    };

    if (cursor) {
      // Decode cursor (assuming it is an occurredAt timestamp)
      const decodedDate = new Date(parseInt(Buffer.from(cursor, 'base64').toString('utf8'), 10));
      query.occurredAt = { ...query.occurredAt, $gt: decodedDate };
    }

    // Using candidate index: { ruleId: 1, occurredAt: 1, agentId: 1 }
    const results = await this.ruleMatchModel
      .find(query)
      .sort({ occurredAt: 1 })
      .limit(limit)
      .select('agentId occurredAt -_id')
      .lean()
      .exec();

    // Grouping by agentId inside memory for this page
    const grouped = results.reduce((acc, curr) => {
      if (!acc[curr.agentId]) {
        acc[curr.agentId] = [];
      }
      acc[curr.agentId].push(curr.occurredAt);
      return acc;
    }, {} as Record<string, Date[]>);

    let nextCursor: string | null = null;
    if (results.length === limit) {
      const lastItem = results[results.length - 1];
      nextCursor = Buffer.from(lastItem.occurredAt.getTime().toString()).toString('base64');
    }

    return {
      data: grouped,
      nextCursor,
    };
  }

  /**
   * API #2: Leaderboard Report
   */
  async getLeaderboard(ruleId: string) {
    const redisKey = `leaderboard:rule:${ruleId}`;
    
    // ZREVRANGE fetches items ordered by highest score first
    const leaderboard = await this.redis.zrevrange(redisKey, 0, -1, 'WITHSCORES');
    
    const formatted: Array<{ agentId: string; count: number }> = [];
    for (let i = 0; i < leaderboard.length; i += 2) {
      formatted.push({
        agentId: leaderboard[i],
        count: parseInt(leaderboard[i + 1], 10),
      });
    }

    return formatted;
  }
}
