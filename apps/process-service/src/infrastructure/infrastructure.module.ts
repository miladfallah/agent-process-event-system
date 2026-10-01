import { Module, Global } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { MessagingModule } from './messaging/messaging.module';
import { CacheModule } from './cache/cache.module';

@Global()
@Module({
  imports: [DatabaseModule, MessagingModule, CacheModule],
  exports: [DatabaseModule, MessagingModule, CacheModule],
})
export class InfrastructureModule {}
