import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Agent Process Event System - Process Service API')
    .setDescription(
      'REST API documentation for managing event rules and querying reports (time-range grouped history & real-time leaderboards).',
    )
    .setVersion('1.0')
    .addTag('Rules', 'CRUD management of event rules with automatic distributed cache invalidation')
    .addTag('Reports', 'Analytical endpoints: API #1 (time-range cursor pagination) & API #2 (real-time Redis leaderboard)')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
