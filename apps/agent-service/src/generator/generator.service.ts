import { Injectable, Logger } from '@nestjs/common';
import { PublisherService } from '../publisher/publisher.service';
import { ConfigService } from '@nestjs/config';
import { faker } from '@faker-js/faker';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class GeneratorService {
  private readonly logger = new Logger(GeneratorService.name);
  private agentId: string;
  private interval: NodeJS.Timeout;

  constructor(
    private readonly publisher: PublisherService,
    private readonly configService: ConfigService,
  ) {
    this.agentId = this.configService.get<string>('AGENT_ID') || 'agent-unknown';
  }

  start() {
    this.logger.log(`Starting generation for agent ${this.agentId}`);
    // ~5 events / sec => every 200ms
    this.interval = setInterval(() => {
      this.generateAndPublish();
    }, 200);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  private async generateAndPublish() {
    const event = {
      eventId: uuidv4(),
      schemaVersion: '1.0',
      agentId: this.agentId,
      occurredAt: new Date().toISOString(),
      name: 'sensor_reading',
      value: faker.number.int({ min: 0, max: 100 }),
    };

    try {
      await this.publisher.publish(event);
      this.logger.debug(`Published event ${event.eventId}`);
    } catch (e) {
      this.logger.error(`Failed to publish event ${event.eventId}`, e);
    }
  }
}
