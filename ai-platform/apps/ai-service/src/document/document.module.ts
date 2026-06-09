import { DatabaseModule } from '@ai-platform/database';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiProvidersModule } from '../ai/ai-providers.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';

@Module({
  imports: [DatabaseModule, EmbeddingsModule, KnowledgeModule, AiProvidersModule, ConfigModule],
  controllers: [DocumentController],
  providers: [DocumentService],
  exports: [DocumentService],
})
export class DocumentModule {}
