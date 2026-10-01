import { Module } from '@nestjs/common';
import { AgentServiceService } from './agent-service.service';
import { PublisherService } from './publisher/publisher.service';
import { GeneratorService } from './generator/generator.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot()],
  providers: [AgentServiceService, PublisherService, GeneratorService],
})
export class AgentServiceModule {}
