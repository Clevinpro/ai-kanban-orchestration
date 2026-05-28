import { LoggerModule } from '@ai-platform/shared';
import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { DocumentsModule } from '../documents/documents.module';
import { HealthController } from '../health/health.controller';

@Module({
  imports: [LoggerModule, AuthModule, AiModule, DocumentsModule, ConversationsModule],
  controllers: [HealthController],
})
export class AppModule {}
