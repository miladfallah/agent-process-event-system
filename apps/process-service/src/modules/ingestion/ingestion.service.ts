import { Injectable, OnModuleInit, OnModuleDestroy, Inject, Logger } from '@nestjs/common';
import * as amqp from 'amqplib';
import { RMQ_CHANNEL } from '../../infrastructure/messaging/messaging.module';
import { EngineService } from '../engine/engine.service';

const MAX_RETRIES = 3;

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

      let payload: any;
      try {
        const content = msg.content.toString();
        payload = JSON.parse(content);

        // Validation against expected envelope schema
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
          this.logger.log(`Idempotent duplicate acknowledged: ${payload?.eventId}`);
          this.channel.ack(msg);
        } else if (error.message === 'MALFORMED_EVENT' || error instanceof SyntaxError) {
          this.logger.error(`Malformed event detected. Routing immediately to DLQ without retry.`, error);
          // Permanent failure - NACK without requeue (routes to DLQ via deadLetterExchange)
          this.channel.nack(msg, false, false);
        } else {
          // Transient failure (e.g. Mongo transient error, network blip)
          const headers = msg.properties.headers || {};
          const retryCount = (headers['x-retry-count'] as number) || 0;

          if (retryCount < MAX_RETRIES) {
            const nextRetry = retryCount + 1;
            this.logger.warn(
              `Transient error processing event ${payload?.eventId || 'unknown'}. Routing to retry queue with TTL backoff (attempt ${nextRetry}/${MAX_RETRIES}). Error: ${error.message}`
            );

            // Publish to delayed retry exchange with incremented retry count
            this.channel.publish(
              'events.retry.exchange',
              'retry',
              msg.content,
              {
                ...msg.properties,
                headers: {
                  ...headers,
                  'x-retry-count': nextRetry,
                },
                persistent: true,
              }
            );

            // Acknowledge the failed instance from the main queue so it does not block the worker
            this.channel.ack(msg);
          } else {
            this.logger.error(
              `Exceeded maximum retries (${MAX_RETRIES}) for event ${payload?.eventId || 'unknown'}. Routing to DLQ. Error: ${error.message}`
            );
            // Bounded retry exhausted -> NACK without requeue routes to DLQ
            this.channel.nack(msg, false, false);
          }
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
