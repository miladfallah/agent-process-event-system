import { Module } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { EngineModule } from '../engine/engine.module';

@Module({
  imports: [EngineModule],
  providers: [IngestionService],
})
export class IngestionModule {}
