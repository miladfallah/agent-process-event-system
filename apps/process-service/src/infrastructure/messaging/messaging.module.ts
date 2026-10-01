import { Module, Global, OnModuleInit, OnModuleDestroy, Logger, Inject } from '@nestjs/common';
import * as amqp from 'amqplib';

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
      useFactory: async (connection: amqp.Connection) => {
        const channel = await connection.createChannel();
        
        // Setup topology
        const exchange = 'events.topic';
        const queue = 'events.process';
        const dlx = 'events.dlx';
        const dlq = 'events.dlq';

        await channel.assertExchange(exchange, 'topic', { durable: true });
        await channel.assertExchange(dlx, 'direct', { durable: true });

        await channel.assertQueue(dlq, { durable: true });
        await channel.bindQueue(dlq, dlx, 'dlq.routing.key');

        await channel.assertQueue(queue, {
          durable: true,
          deadLetterExchange: dlx,
          deadLetterRoutingKey: 'dlq.routing.key',
        });
        
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
    @Inject(RMQ_CONNECTION) private connection: amqp.Connection,
    @Inject(RMQ_CHANNEL) private channel: amqp.Channel,
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
