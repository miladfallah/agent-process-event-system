import { Injectable, Inject, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { RulesService } from '../rules/rules.service';
import { EvaluatorService } from './evaluator.service';
import { Rule } from '../../infrastructure/database/schemas/rule.schema';
import { Event } from '../../infrastructure/database/schemas/event.schema';
import { RuleMatch } from '../../infrastructure/database/schemas/rule-match.schema';
import { LeaderboardCounter } from '../../infrastructure/database/schemas/leaderboard-counter.schema';
import { REDIS_SUBSCRIBER } from '../../infrastructure/cache/cache.module';
import { Redis } from 'ioredis';

@Injectable()
export class EngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EngineService.name);
  private activeRulesCache: Rule[] = [];
  private pollingInterval: NodeJS.Timeout;

  constructor(
    private readonly rulesService: RulesService,
    private readonly evaluatorService: EvaluatorService,
    @InjectModel(Event.name) private readonly eventModel: Model<Event>,
    @InjectModel(RuleMatch.name) private readonly ruleMatchModel: Model<RuleMatch>,
    @InjectModel(LeaderboardCounter.name) private readonly leaderboardModel: Model<LeaderboardCounter>,
    @InjectConnection() private readonly connection: Connection,
    @Inject(REDIS_SUBSCRIBER) private readonly redisSubscriber: Redis,
  ) {}

  async onModuleInit() {
    await this.reloadCache();
    
    // Subscribe to invalidations
    await this.redisSubscriber.subscribe('rules:invalidated');
    this.redisSubscriber.on('message', async (channel) => {
      if (channel === 'rules:invalidated') {
        this.logger.log('Rule invalidation received via Pub/Sub. Reloading cache...');
        await this.reloadCache();
      }
    });

    // 30s Polling fallback
    this.pollingInterval = setInterval(async () => {
      await this.reloadCache();
    }, 30000);
  }

  async onModuleDestroy() {
    clearInterval(this.pollingInterval);
    await this.redisSubscriber.unsubscribe('rules:invalidated');
  }

  private async reloadCache() {
    try {
      this.activeRulesCache = await this.rulesService.getActiveRules();
      this.logger.debug(`Cache reloaded. Active rules count: ${this.activeRulesCache.length}`);
    } catch (e) {
      this.logger.error('Failed to reload rule cache', e);
    }
  }

  /**
   * Processes an incoming event transactionally.
   */
  async processEvent(payload: { eventId: string; agentId: string; occurredAt: Date; name: string; value: number }): Promise<void> {
    const matchedRules = this.evaluatorService.evaluate(payload, this.activeRulesCache);
    
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // 1. Insert Event
      await this.eventModel.create([{
        eventId: payload.eventId,
        agentId: payload.agentId,
        occurredAt: payload.occurredAt,
        name: payload.name,
        value: payload.value,
      }], { session });

      if (matchedRules.length > 0) {
        // 2. Insert RuleMatches
        const ruleMatches = matchedRules.map(rule => ({
          eventId: payload.eventId,
          ruleId: rule._id,
          agentId: payload.agentId,
          occurredAt: payload.occurredAt,
          ruleSnapshot: JSON.parse(JSON.stringify(rule)), // Deep copy for historical accuracy
        }));
        await this.ruleMatchModel.insertMany(ruleMatches, { session });

        // 3. Update LeaderboardCounters using compound _id as a plain object
        for (const rule of matchedRules) {
          const counterId = {
            ruleId: new Types.ObjectId(rule._id.toString()),
            agentId: payload.agentId,
          };
          await (this.leaderboardModel as any).collection.updateOne(
            { _id: counterId },
            { $inc: { count: 1 } },
            { upsert: true, session },
          );
        }
      }

      await session.commitTransaction();
      this.logger.log(`Successfully processed event ${payload.eventId} matching ${matchedRules.length} rules.`);
    } catch (error) {
      await session.abortTransaction();
      
      // E11000 duplicate key error means this eventId was already processed.
      if (error.code === 11000) {
        this.logger.warn(`Duplicate event detected and ignored safely (eventId: ${payload.eventId}).`);
        // We throw a specific signal so the consumer knows it's a duplicate and should just ACK.
        throw new Error('DUPLICATE_EVENT');
      }

      this.logger.error(`Failed to process event ${payload.eventId}`, error);
      throw error; // Let consumer handle NACK or retry
    } finally {
      session.endSession();
    }
  }
}
