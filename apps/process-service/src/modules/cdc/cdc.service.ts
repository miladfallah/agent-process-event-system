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
    
    let resumeAfter: any = undefined;
    try {
      const tokenStr = await this.redis.get('cdc:resumeToken');
      if (tokenStr) {
        resumeAfter = JSON.parse(tokenStr);
        this.logger.log('Found existing CDC resumeToken in Redis. Resuming change stream.');
      } else {
        this.logger.warn('No CDC resumeToken found. Rebuilding Redis leaderboard from MongoDB Source of Truth...');
        await this.rebuildFromMongo();
      }
    } catch (error) {
      this.logger.error('Failed reading resumeToken or rebuilding from Mongo during CDC initialization:', error);
    }

    try {
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
            // This achieves effectively-once projection over an at-least-once Change Stream.
            await this.redis.zadd(redisKey, 'GT', absoluteCount, agentId);

            // Persist the latest resumable token
            await this.redis.set('cdc:resumeToken', JSON.stringify(change._id));
          }
        } catch (error) {
          this.logger.error('Error projecting CDC change event to Redis:', error);
        }
      });

      this.changeStream.on('error', (error) => {
        this.logger.error('CDC Change Stream error encountered:', error);
      });
    } catch (error) {
      this.logger.error('Failed to establish MongoDB Change Stream:', error);
    }
  }

  /**
   * Rebuilds the entire Redis leaderboard read model directly from MongoDB Source of Truth.
   * Safe to call on cold start, Redis flush/restart, or manual recovery.
   */
  async rebuildFromMongo(): Promise<void> {
    try {
      const counters = await this.leaderboardModel.find().lean().exec();
      for (const counter of counters) {
        const ruleId = counter._id.ruleId.toString();
        const agentId = counter._id.agentId;
        const absoluteCount = counter.count;
        const redisKey = `leaderboard:rule:${ruleId}`;
        await this.redis.zadd(redisKey, 'GT', absoluteCount, agentId);
      }
      this.logger.log(`Successfully rebuilt ${counters.length} leaderboard projections in Redis from MongoDB.`);
    } catch (error) {
      this.logger.error('Failed to rebuild leaderboard from MongoDB:', error);
    }
  }

  async onModuleDestroy() {
    if (this.changeStream) {
      await this.changeStream.close();
    }
  }
}
