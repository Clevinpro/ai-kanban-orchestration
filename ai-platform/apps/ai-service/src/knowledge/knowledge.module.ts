import { DatabaseModule } from '@ai-platform/database';
import { Module } from '@nestjs/common';
import { AiProviderFactory } from '../ai/providers/ai-provider.factory';
import { ClaudeProvider } from '../ai/providers/claude.provider';
import { OllamaProvider } from '../ai/providers/ollama.provider';
import { KnowledgeService } from './knowledge.service';

@Module({
  imports: [DatabaseModule],
  providers: [KnowledgeService, AiProviderFactory, ClaudeProvider, OllamaProvider],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
