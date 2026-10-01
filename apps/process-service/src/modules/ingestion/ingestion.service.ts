import { Injectable, OnModuleInit, OnModuleDestroy, Inject, Logger } from '@nestjs/common';
import * as amqp from 'amqplib';
import { RMQ_CHANNEL } from '../../infrastructure/messaging/messaging.module';
import { EngineService } from '../engine/engine.service';

@Injectable()
export class IngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestionService.name);
  private consumerTag: string;

  constructor(
    @Inject(RMQ_CHANNEL) private readonly channel: amqp.Channel,
    private readonly engineService: EngineService,
  ) {}

  async onModuleInit() {
    this.logger.log('Starting RMQ Consumer...');
    const queue = 'events.process';

    const { consumerTag } = await this.channel.consume(queue, async (msg) => {
      if (!msg) return;

      try {
        const content = msg.content.toString();
        const payload = JSON.parse(content);

        // Validation against expected schema
        if (!payload.eventId || !payload.schemaVersion || !payload.agentId) {
          throw new Error('MALFORMED_EVENT');
        }

        await this.engineService.processEvent({
          eventId: payload.eventId,
          agentId: payload.agentId,
          occurredAt: new Date(payload.occurredAt),
          name: payload.name,
          value: payload.value,
        });

        // Success - ACK
        this.channel.ack(msg);
      } catch (error) {
        if (error.message === 'DUPLICATE_EVENT') {
          // Idempotent success - ACK
          this.channel.ack(msg);
        } else if (error.message === 'MALFORMED_EVENT' || error instanceof SyntaxError) {
          this.logger.error(`Malformed event detected. Routing to DLQ.`, error);
          // Permanent failure - NACK without requeue (routes to DLQ)
          this.channel.nack(msg, false, false);
        } else {
          this.logger.error(`Transient error processing event. Requeueing.`, error.stack);
          // Transient failure (e.g., Mongo timeout) - NACK with requeue 
          // Note: Real production would route to a TTL delay queue, but NACK w/requeue is adequate for immediate retry in this context unless specified otherwise.
          this.channel.nack(msg, false, true);
        }
      }
    });

    this.consumerTag = consumerTag;
  }

  async onModuleDestroy() {
    if (this.consumerTag) {
      await this.channel.cancel(this.consumerTag);
    }
  }
}
