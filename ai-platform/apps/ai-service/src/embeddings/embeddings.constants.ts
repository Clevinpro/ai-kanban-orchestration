export const OPENAI_EMBEDDING_PROVIDER = 'OPENAI_EMBEDDING_PROVIDER';
export const LMSTUDIO_EMBEDDING_PROVIDER = 'LMSTUDIO_EMBEDDING_PROVIDER';

/**
 * Single source of truth for the embedding vector dimension. The platform's
 * `chunks.embedding` column is `vector(1024)`; every provider must emit vectors
 * of exactly this length, otherwise the pgvector insert fails.
 */
export const EXPECTED_EMBEDDING_DIM = 1024;

/**
 * Single source of truth for the index recipe version. Joins the
 * `(provider, model)` embedding fingerprint so any change to the index-time
 * strategy (chunking, contextual retrieval, casing, prepend shape, batching)
 * can ship a full re-index simply by bumping this string.
 *
 * On boot, vault-sync compares the stored `recipe_version` against this value;
 * if it differs, chunks are truncated and the vault is re-indexed into the new
 * recipe. Bump this whenever the index pipeline changes in a way that affects
 * stored chunk content or embeddings.
 *
 * v2: contextual-retrieval epic — boundary-aware chunking, per-chunk LLM
 * context, no-lowercase embedding input, dropped `Section:` literal, batch
 * embedding. (v1 was the implicit pre-recipe baseline.)
 *
 * v3: fast-upload-indexing epic — windowed context prompt (bounded
 * `CONTEXT_WINDOW_CHARS` window per chunk instead of the whole document) plus
 * prompt-safe (escaped) interpolated content. This changes the stored chunk
 * content, so the bump forces a one-time background reindex of the vault into
 * the new recipe on next boot.
 */
export const INDEX_RECIPE_VERSION = 'v3';

/**
 * Default 1024-dim multilingual (Ukrainian-capable) embedding model shared by the
 * Ollama and LM Studio providers. Kept single-sourced so the provider-change
 * fingerprint (vault-sync) and the providers cannot drift.
 */
export const DEFAULT_MULTILINGUAL_EMBEDDING_MODEL = 'bge-m3';

/**
 * Default OpenAI embedding model. Combined with the `dimensions: 1024` request
 * body parameter (Matryoshka truncation), it emits 1024-dim vectors that match
 * the `chunks.embedding` column. Single-sourced so the OpenAI provider and the
 * vault-sync fingerprint cannot drift.
 */
export const DEFAULT_OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Fail-fast dimension guard. Asserts a returned embedding vector matches
 * {@link EXPECTED_EMBEDDING_DIM} so a misloaded model surfaces a clear error at
 * the provider boundary instead of an opaque pgvector insert failure.
 *
 * @throws Error `Embedding dimension mismatch: model=<m>, expected=1024, got=<n>`
 */
export function assertEmbeddingDimension(embedding: number[], model: string): number[] {
  if (embedding.length !== EXPECTED_EMBEDDING_DIM) {
    throw new Error(
      `Embedding dimension mismatch: model=${model}, expected=${EXPECTED_EMBEDDING_DIM}, got=${embedding.length}`,
    );
  }
  return embedding;
}
