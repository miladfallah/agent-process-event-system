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
import { RuleMatch } from '../src/infrastructure/database/schemas/rule-match.schema';

describe('End-to-End System Flow', () => {
  let app: INestApplication;
  let rmqConnection: amqp.Connection;
  let redisClient: Redis;
  let ruleMatchModel: Model<RuleMatch>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    rmqConnection = app.get(RMQ_CONNECTION);
    redisClient = app.get(REDIS_CLIENT);
    ruleMatchModel = app.get(getModelToken(RuleMatch.name));
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('1. Create Rule', async () => {
    const res = await request(app.getHttpServer())
      .post('/rules')
      .send({
        name: 'Sensor GT 50',
        conditions: [{ field: 'value', operator: 'GT', value: 50 }],
        isActive: true,
      })
      .expect(201);
    expect(res.body.name).toBe('Sensor GT 50');
  });

  it('2. Publish Event to RMQ & Verify Processing', async () => {
    const channel = await rmqConnection.createChannel();
    const eventId = 'test-e2e-uuid-1';
    const payload = {
      eventId,
      schemaVersion: '1.0',
      agentId: 'agent-e2e',
      occurredAt: new Date().toISOString(),
      name: 'sensor',
      value: 75, // Greater than 50, should match
    };

    channel.publish('events.topic', 'event.test', Buffer.from(JSON.stringify(payload)));
    await channel.close();

    // Wait a moment for consumer and CDC stream to process
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify RuleMatch was saved
    const match = await ruleMatchModel.findOne({ eventId }).exec();
    expect(match).toBeDefined();
    expect(match.agentId).toBe('agent-e2e');
  });

  it('3. Verify Redelivery does not duplicate (Idempotency)', async () => {
    const channel = await rmqConnection.createChannel();
    const eventId = 'test-e2e-uuid-1'; // Same ID
    const payload = {
      eventId,
      schemaVersion: '1.0',
      agentId: 'agent-e2e',
      occurredAt: new Date().toISOString(),
      name: 'sensor',
      value: 75,
    };

    channel.publish('events.topic', 'event.test', Buffer.from(JSON.stringify(payload)));
    await channel.close();

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Should still only be 1 rule match (no duplicates)
    const count = await ruleMatchModel.countDocuments({ eventId }).exec();
    expect(count).toBe(1);
  });
});
