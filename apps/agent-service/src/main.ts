import { NestFactory } from '@nestjs/core';
import { AgentServiceModule } from './agent-service.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AgentServiceModule);
  // It's a worker process, we just need it to stay alive.
}
bootstrap();
