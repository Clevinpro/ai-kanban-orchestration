import { DatabaseModule } from '@ai-platform/database';
import { Module } from '@nestjs/common';
import { AiProvidersModule } from '../ai/ai-providers.module';
import { KnowledgeService } from './knowledge.service';

@Module({
  imports: [DatabaseModule, AiProvidersModule],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
