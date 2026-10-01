import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as amqp from 'amqplib';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PublisherService.name);
  private connection: amqp.Connection;
  private channel: amqp.Channel;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.connectWithRetry();
  }

  async onModuleDestroy() {
    if (this.channel) await this.channel.close();
    if (this.connection) await this.connection.close();
  }

  private async connectWithRetry() {
    const url = this.configService.get<string>('RABBITMQ_URL') || 'amqp://localhost:5672';
    
    for (let i = 0; i < 5; i++) {
      try {
        this.connection = await amqp.connect(url);
        this.channel = await this.connection.createChannel();
        await this.channel.assertExchange('events.topic', 'topic', { durable: true });
        this.logger.log('Connected to RMQ.');
        return;
      } catch (e) {
        this.logger.warn(`Failed to connect to RMQ. Retrying in 5s...`);
        await new Promise(res => setTimeout(res, 5000));
      }
    }
    this.logger.error('Exhausted retries connecting to RMQ.');
  }

  async publish(event: any) {
    if (!this.channel) {
      this.logger.error('RMQ channel not available, dropping event.');
      return;
    }

    const payload = Buffer.from(JSON.stringify(event));
    const published = this.channel.publish('events.topic', 'event.sensor', payload, {
      persistent: true,
    });

    if (!published) {
      this.logger.warn('Event publish returned false (buffer full?).');
    }
  }
}
