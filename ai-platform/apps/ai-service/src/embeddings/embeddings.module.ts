import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OllamaEmbeddingService } from './embeddings.service';

@Module({
  imports: [ConfigModule],
  providers: [OllamaEmbeddingService],
  exports: [OllamaEmbeddingService],
})
export class EmbeddingsModule {}
