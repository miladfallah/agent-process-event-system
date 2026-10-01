import { Injectable, OnModuleInit, OnModuleDestroy, Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LeaderboardCounter } from '../../infrastructure/database/schemas/leaderboard-counter.schema';
import { REDIS_CLIENT } from '../../infrastructure/cache/cache.module';
import { Redis } from 'ioredis';

@Injectable()
export class CdcService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CdcService.name);
  private changeStream: any;

  constructor(
    @InjectModel(LeaderboardCounter.name) private readonly leaderboardModel: Model<LeaderboardCounter>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing CDC Worker for LeaderboardCounters...');
    
    // In a full production system, resumeToken is persisted to MongoDB.
    // For this scope, we fetch it if stored in Redis to survive worker restarts.
    const tokenStr = await this.redis.get('cdc:resumeToken');
    const resumeAfter = tokenStr ? JSON.parse(tokenStr) : undefined;

    this.changeStream = this.leaderboardModel.watch([], {
      fullDocument: 'updateLookup',
      resumeAfter,
    });

    this.changeStream.on('change', async (change) => {
      try {
        if (change.operationType === 'insert' || change.operationType === 'update' || change.operationType === 'replace') {
          const doc = change.fullDocument;
          if (!doc) return;

          const ruleId = doc._id.ruleId.toString();
          const agentId = doc._id.agentId;
          const absoluteCount = doc.count;

          const redisKey = `leaderboard:rule:${ruleId}`;

          // GT flag ensures we never decrement a score if CDC events process out of order upon retry.
          await this.redis.zadd(redisKey, 'GT', absoluteCount, agentId);

          // Save resume token
          await this.redis.set('cdc:resumeToken', JSON.stringify(change._id));
        }
      } catch (error) {
        this.logger.error('Error in CDC stream processing', error);
      }
    });

    this.changeStream.on('error', (error) => {
      this.logger.error('CDC Stream Error', error);
      // Let the process crash or reconnect. Mongoose watch auto-reconnects in some cases.
    });
  }

  async onModuleDestroy() {
    if (this.changeStream) {
      await this.changeStream.close();
    }
  }
}
