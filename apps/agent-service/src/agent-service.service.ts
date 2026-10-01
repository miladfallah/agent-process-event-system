import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { GeneratorService } from './generator/generator.service';

@Injectable()
export class AgentServiceService implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly generator: GeneratorService) {}

  onModuleInit() {
    this.generator.start();
  }

  onModuleDestroy() {
    this.generator.stop();
  }
}
