import { LoggerService } from '@ai-platform/shared';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { OllamaEmbeddingService } from '../embeddings/embeddings.service';

const CAPABILITY_QUESTIONS = [
  'що я можу зробити?',
  'які можливості є?',
  'що ти вмієш?',
  'чим ти можеш допомогти?',
  'що тут можна робити?',
  'розкажи про можливості',
  'що є в цій системі?',
  'як ти можеш допомогти?',
  'what can i do here?',
  'what features do you have?',
  'what can you help me with?',
  'what are your capabilities?',
  'what is available here?',
  'how can you help me?',
];

const SIMILARITY_THRESHOLD = 0.75;

@Injectable()
export class CapabilityDetectorService implements OnModuleInit {
  private cachedEmbeddings: number[][] = [];

  constructor(
    private readonly embeddingService: OllamaEmbeddingService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      this.logger.log(
        `Pre-computing capability embeddings: count=${CAPABILITY_QUESTIONS.length}`,
        'CapabilityDetectorService',
      );
      this.cachedEmbeddings = await this.embeddingService.generateBatch(CAPABILITY_QUESTIONS);
      this.logger.log('Capability embeddings ready', 'CapabilityDetectorService');
    } catch (error) {
      this.logger.warn(
        `Failed to pre-compute capability embeddings, falling back to regex: ${error instanceof Error ? error.message : String(error)}`,
        'CapabilityDetectorService',
      );
    }
  }

  async isCapabilityQuery(text: string): Promise<boolean> {
    if (this.cachedEmbeddings.length === 0) {
      return this.fallbackRegex(text);
    }

    try {
      const queryEmbedding = await this.embeddingService.generateEmbedding(text);
      const maxSimilarity = Math.max(
        ...this.cachedEmbeddings.map((e) => this.cosineSimilarity(queryEmbedding, e)),
      );

      this.logger.debug(
        `Capability similarity: max=${maxSimilarity.toFixed(3)}, threshold=${SIMILARITY_THRESHOLD}`,
        'CapabilityDetectorService',
      );

      return maxSimilarity >= SIMILARITY_THRESHOLD;
    } catch (error) {
      this.logger.warn(
        `Embedding failed, falling back to regex: ${error instanceof Error ? error.message : String(error)}`,
        'CapabilityDetectorService',
      );
      return this.fallbackRegex(text);
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
    return magnitude === 0 ? 0 : dot / magnitude;
  }

  private fallbackRegex(text: string): boolean {
    const patterns = [
      /що (я |ми |можна )?(можу|можемо|вміє|вміємо)/i,
      /what can (i|we|you)/i,
      /які (функції|можливості|фічі|можна)/i,
      /what (features|capabilities|can)/i,
    ];
    return patterns.some((p) => p.test(text));
  }
}
