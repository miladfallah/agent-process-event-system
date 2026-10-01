import { Controller, Get, Inject } from '@nestjs/common';
import { HealthCheckService, MongooseHealthIndicator, HealthCheck } from '@nestjs/terminus';
import { REDIS_CLIENT } from '../../infrastructure/cache/cache.module';
import { RMQ_CONNECTION } from '../../infrastructure/messaging/messaging.module';
import { Redis } from 'ioredis';
import * as amqp from 'amqplib';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private mongoose: MongooseHealthIndicator,
    @Inject(REDIS_CLIENT) private redis: Redis,
    @Inject(RMQ_CONNECTION) private rmq: amqp.Connection,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.mongoose.pingCheck('mongodb'),
      async () => {
        const ping = await this.redis.ping();
        const isUp = ping === 'PONG';
        return { redis: { status: isUp ? 'up' : 'down' } };
      },
      async () => {
        // Very basic health check for RMQ connection
        const isUp = !!this.rmq; // amqplib doesn't have a simple ping, but connection presence is an indicator here
        return { rabbitmq: { status: isUp ? 'up' : 'down' } };
      }
    ]);
  }
}
