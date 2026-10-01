import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import * as amqp from 'amqplib';
import { RMQ_CONNECTION } from '../src/infrastructure/messaging/messaging.module';
import { REDIS_CLIENT } from '../src/infrastructure/cache/cache.module';
import { Redis } from 'ioredis';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Event } from '../src/infrastructure/database/schemas/event.schema';
import { RuleMatch } from '../src/infrastructure/database/schemas/rule-match.schema';
import { LeaderboardCounter } from '../src/infrastructure/database/schemas/leaderboard-counter.schema';

describe('End-to-End System Flow', () => {
  let app: INestApplication;
  let rmqConnection: amqp.Connection;
  let redisClient: Redis;
  let eventModel: Model<Event>;
  let ruleMatchModel: Model<RuleMatch>;
  let counterModel: Model<LeaderboardCounter>;
  let createdRuleId1: string;
  let createdRuleId2: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    rmqConnection = app.get(RMQ_CONNECTION);
    redisClient = app.get(REDIS_CLIENT);
    eventModel = app.get(getModelToken(Event.name));
    ruleMatchModel = app.get(getModelToken(RuleMatch.name));
    counterModel = app.get(getModelToken(LeaderboardCounter.name));
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('1. Create Rules (Single and Multi match setups)', async () => {
    // Rule 1: value > 50
    const res1 = await request(app.getHttpServer())
      .post('/rules')
      .send({
        name: 'Sensor GT 50',
        conditions: [{ field: 'value', operator: 'GT', value: 50 }],
        isActive: true,
      })
      .expect(201);
    createdRuleId1 = res1.body._id;

    // Rule 2: value > 70
    const res2 = await request(app.getHttpServer())
      .post('/rules')
      .send({
        name: 'Sensor GT 70',
        conditions: [{ field: 'value', operator: 'GT', value: 70 }],
        isActive: true,
      })
      .expect(201);
    createdRuleId2 = res2.body._id;

    expect(createdRuleId1).toBeDefined();
    expect(createdRuleId2).toBeDefined();

    // Allow cache invalidation to propagate
    await new Promise((r) => setTimeout(r, 500));
  });

  it('2. Zero-match event persistence: stores Event even when 0 rules match', async () => {
    const channel = await rmqConnection.createChannel();
    const eventId = 'test-zero-match-uuid';
    const payload = {
      eventId,
      schemaVersion: '1.0',
      agentId: 'agent-zero',
      occurredAt: new Date().toISOString(),
      name: 'sensor',
      value: 10, // Matches neither GT 50 nor GT 70
    };

    channel.publish('events.topic', 'event.test', Buffer.from(JSON.stringify(payload)));
    await channel.close();

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Event must be durably stored
    const savedEvent = await eventModel.findOne({ eventId }).exec();
    expect(savedEvent).toBeDefined();
    expect(savedEvent?.value).toBe(10);

    // RuleMatches must be zero
    const matchCount = await ruleMatchModel.countDocuments({ eventId }).exec();
    expect(matchCount).toBe(0);
  });

  it('3. Multiple-match event: creates multiple RuleMatches and increments counters', async () => {
    const channel = await rmqConnection.createChannel();
    const eventId = 'test-multi-match-uuid';
    const payload = {
      eventId,
      schemaVersion: '1.0',
      agentId: 'agent-multi',
      occurredAt: new Date().toISOString(),
      name: 'sensor',
      value: 85, // Matches BOTH GT 50 and GT 70
    };

    channel.publish('events.topic', 'event.test', Buffer.from(JSON.stringify(payload)));
    await channel.close();

    await new Promise((resolve) => setTimeout(resolve, 2500));

    // Both RuleMatches should exist
    const matches = await ruleMatchModel.find({ eventId }).exec();
    expect(matches).toHaveLength(2);

    // Both counters should have incremented
    const counter1 = await counterModel.findOne({ '_id.ruleId': createdRuleId1, '_id.agentId': 'agent-multi' }).exec();
    const counter2 = await counterModel.findOne({ '_id.ruleId': createdRuleId2, '_id.agentId': 'agent-multi' }).exec();
    expect(counter1?.count).toBeGreaterThanOrEqual(1);
    expect(counter2?.count).toBeGreaterThanOrEqual(1);
  });

  it('4. Idempotency on redelivery: duplicate eventId does not duplicate matches or counters', async () => {
    const channel = await rmqConnection.createChannel();
    const eventId = 'test-multi-match-uuid'; // Redeliver the exact same event
    const payload = {
      eventId,
      schemaVersion: '1.0',
      agentId: 'agent-multi',
      occurredAt: new Date().toISOString(),
      name: 'sensor',
      value: 85,
    };

    const counter1Before = await counterModel.findOne({ '_id.ruleId': createdRuleId1, '_id.agentId': 'agent-multi' }).exec();

    channel.publish('events.topic', 'event.test', Buffer.from(JSON.stringify(payload)));
    await channel.close();

    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Matches count must remain exactly 2
    const matchesCount = await ruleMatchModel.countDocuments({ eventId }).exec();
    expect(matchesCount).toBe(2);

    // Counter must not have incremented again
    const counter1After = await counterModel.findOne({ '_id.ruleId': createdRuleId1, '_id.agentId': 'agent-multi' }).exec();
    expect(counter1After?.count).toBe(counter1Before?.count);
  });

  it('5. Malformed event is routed to Dead Letter Queue (events.dlq)', async () => {
    const channel = await rmqConnection.createChannel();
    // Missing required eventId and schemaVersion
    const malformedPayload = {
      agentId: 'agent-bad',
      name: 'broken',
      value: 999,
    };

    channel.publish('events.topic', 'event.test', Buffer.from(JSON.stringify(malformedPayload)));

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check message arrived in events.dlq
    const dlqMessage = await channel.get('events.dlq', { noAck: false });
    expect(dlqMessage).not.toBe(false);
    if (dlqMessage) {
      const parsed = JSON.parse(dlqMessage.content.toString());
      expect(parsed.agentId).toBe('agent-bad');
      channel.ack(dlqMessage);
    }
    await channel.close();
  });
});
