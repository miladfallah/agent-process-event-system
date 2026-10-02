import { Module, Global, OnModuleDestroy, Logger, Inject } from '@nestjs/common';
import amqp = require('amqplib');

export const RMQ_CONNECTION = 'RMQ_CONNECTION';
export const RMQ_CHANNEL = 'RMQ_CHANNEL';

@Global()
@Module({
  providers: [
    {
      provide: RMQ_CONNECTION,
      useFactory: async () => {
        const url = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
        return await amqp.connect(url);
      },
    },
    {
      provide: RMQ_CHANNEL,
      useFactory: async (connection: any) => {
        const channel = await connection.createChannel();
        
        // Setup topology
        const exchange = 'events.topic';
        const queue = 'events.process';
        const retryExchange = 'events.retry.exchange';
        const retryQueue = 'events.retry';
        const dlx = 'events.dlx';
        const dlq = 'events.dlq';

        // 1. DLX & DLQ
        await channel.assertExchange(dlx, 'direct', { durable: true });
        await channel.assertQueue(dlq, { durable: true });
        await channel.bindQueue(dlq, dlx, 'dlq.routing.key');

        // 2. Retry Exchange & Delayed Retry Queue (TTL 5000ms -> routes back to events.topic)
        await channel.assertExchange(retryExchange, 'direct', { durable: true });
        await channel.assertQueue(retryQueue, {
          durable: true,
          messageTtl: 5000,
          deadLetterExchange: exchange,
          deadLetterRoutingKey: 'event.process.retry',
        });
        await channel.bindQueue(retryQueue, retryExchange, 'retry');

        // 3. Main Exchange & Main Queue (DLX on unhandled/exhausted failure)
        await channel.assertExchange(exchange, 'topic', { durable: true });
        await channel.assertQueue(queue, {
          durable: true,
          deadLetterExchange: dlx,
          deadLetterRoutingKey: 'dlq.routing.key',
        });
        
        // Bind main queue to main exchange for original ('event.sensor') and retried ('event.process.retry') events
        await channel.bindQueue(queue, exchange, 'event.#');
        await channel.prefetch(100);

        return channel;
      },
      inject: [RMQ_CONNECTION],
    },
  ],
  exports: [RMQ_CONNECTION, RMQ_CHANNEL],
})
export class MessagingModule implements OnModuleDestroy {
  private readonly logger = new Logger(MessagingModule.name);

  constructor(
    @Inject(RMQ_CONNECTION) private connection: any,
    @Inject(RMQ_CHANNEL) private channel: any,
  ) {}

  async onModuleDestroy() {
    try {
      await this.channel.close();
      await this.connection.close();
    } catch (e) {
      this.logger.error('Error closing RMQ connection', e);
    }
  }
}
