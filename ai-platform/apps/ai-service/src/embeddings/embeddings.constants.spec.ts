import {
  assertEmbeddingDimension,
  DEFAULT_MULTILINGUAL_EMBEDDING_MODEL,
  DEFAULT_OPENAI_EMBEDDING_MODEL,
  EXPECTED_EMBEDDING_DIM,
  INDEX_RECIPE_VERSION,
} from './embeddings.constants';

// ---------------------------------------------------------------------------
// EXPECTED_EMBEDDING_DIM — single source of truth
// ---------------------------------------------------------------------------

describe('EXPECTED_EMBEDDING_DIM', () => {
  it('is 1024 (matches the chunks.embedding vector(1024) column)', () => {
    expect(EXPECTED_EMBEDDING_DIM).toBe(1024);
  });
});

// ---------------------------------------------------------------------------
// Default model constants — single-sourced so providers and vault-sync agree
// ---------------------------------------------------------------------------

describe('default embedding model constants', () => {
  it('multilingual (Ollama/LM Studio) default is bge-m3', () => {
    expect(DEFAULT_MULTILINGUAL_EMBEDDING_MODEL).toBe('bge-m3');
  });

  it('OpenAI default is text-embedding-3-small', () => {
    expect(DEFAULT_OPENAI_EMBEDDING_MODEL).toBe('text-embedding-3-small');
  });
});

// ---------------------------------------------------------------------------
// INDEX_RECIPE_VERSION — single source of truth for the index recipe fingerprint
// ---------------------------------------------------------------------------

describe('INDEX_RECIPE_VERSION', () => {
  it('is a non-empty string', () => {
    expect(typeof INDEX_RECIPE_VERSION).toBe('string');
    expect(INDEX_RECIPE_VERSION.length).toBeGreaterThan(0);
  });

  it('is bumped to v3 by the fast-upload-indexing epic (windowed context prompt)', () => {
    expect(INDEX_RECIPE_VERSION).toBe('v3');
  });
});

// ---------------------------------------------------------------------------
// assertEmbeddingDimension — fail-fast dimension guard
// ---------------------------------------------------------------------------

describe('assertEmbeddingDimension', () => {
  it('passes through a 1024-length vector unchanged', () => {
    const vector = Array.from({ length: EXPECTED_EMBEDDING_DIM }, (_, i) => i * 0.001);
    const result = assertEmbeddingDimension(vector, 'bge-m3');
    // Returns the same array reference so it can be used inline at the return boundary.
    expect(result).toBe(vector);
    expect(result).toHaveLength(EXPECTED_EMBEDDING_DIM);
  });

  it('throws with the exact mismatch message when the length is below 1024', () => {
    const vector = Array.from({ length: 768 }, () => 0);
    expect(() => assertEmbeddingDimension(vector, 'nomic-embed-text')).toThrow(
      'Embedding dimension mismatch: model=nomic-embed-text, expected=1024, got=768',
    );
  });

  it('throws with the exact mismatch message when the length is above 1024', () => {
    const vector = Array.from({ length: 1536 }, () => 0);
    expect(() => assertEmbeddingDimension(vector, 'text-embedding-3-small')).toThrow(
      'Embedding dimension mismatch: model=text-embedding-3-small, expected=1024, got=1536',
    );
  });

  it('throws on an empty vector and reports got=0', () => {
    expect(() => assertEmbeddingDimension([], 'bge-m3')).toThrow(
      'Embedding dimension mismatch: model=bge-m3, expected=1024, got=0',
    );
  });

  it('interpolates the supplied model name into the error message', () => {
    const vector = Array.from({ length: 512 }, () => 0);
    expect(() => assertEmbeddingDimension(vector, 'my-custom-model')).toThrow(
      /model=my-custom-model/,
    );
  });
});
