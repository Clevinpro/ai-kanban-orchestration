export const EMBEDDING_PROVIDER_TOKEN = Symbol('EmbeddingProvider');

export interface EmbeddingProvider {
  generateEmbedding(text: string): Promise<number[]>;
  generateBatch(texts: string[]): Promise<number[][]>;
}
