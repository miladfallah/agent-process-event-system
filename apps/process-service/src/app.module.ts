import { Module } from '@nestjs/common';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { RulesModule } from './modules/rules/rules.module';
import { EngineModule } from './modules/engine/engine.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { CdcModule } from './modules/cdc/cdc.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { HealthModule } from './modules/health/health.module';
import { LoggingModule } from './core/logging/logging.module';

@Module({
  imports: [
    LoggingModule,
    InfrastructureModule,
    RulesModule,
    EngineModule,
    IngestionModule,
    CdcModule,
    ReportingModule,
    HealthModule,
  ],
})
export class AppModule {}
