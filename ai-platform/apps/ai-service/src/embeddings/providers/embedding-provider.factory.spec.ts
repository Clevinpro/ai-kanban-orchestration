import { EmbeddingProviderFactory } from './embedding-provider.factory';
import type { LmStudioEmbeddingProvider } from './lmstudio-embedding.provider';
import type { OllamaEmbeddingProvider } from './ollama-embedding.provider';
import type { OpenAiEmbeddingProvider } from './openai-embedding.provider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFactory(providerEnv: string | undefined): {
  factory: EmbeddingProviderFactory;
  logSpy: jest.Mock;
} {
  const configService = {
    get: <T>(key: string): T | undefined =>
      key === 'EMBEDDING_PROVIDER' ? (providerEnv as unknown as T) : undefined,
  } as never;

  const logSpy = jest.fn();
  const logger = { log: logSpy, error: jest.fn(), debug: jest.fn() } as never;

  const ollamaProvider = {} as OllamaEmbeddingProvider;
  const openAiProvider = {} as OpenAiEmbeddingProvider;
  const lmStudioProvider = {} as LmStudioEmbeddingProvider;

  const factory = new EmbeddingProviderFactory(
    configService,
    ollamaProvider,
    openAiProvider,
    lmStudioProvider,
    logger,
  );

  return { factory, logSpy };
}

// ---------------------------------------------------------------------------
// Constructor logging
// ---------------------------------------------------------------------------

describe('EmbeddingProviderFactory — constructor', () => {
  it('logs the resolved EMBEDDING_PROVIDER at INFO level', () => {
    const { logSpy } = makeFactory('openai');
    expect(logSpy).toHaveBeenCalledWith('EMBEDDING_PROVIDER=openai', 'EmbeddingProviderFactory');
  });

  it('defaults to "ollama" when EMBEDDING_PROVIDER is not set', () => {
    const { logSpy } = makeFactory(undefined);
    expect(logSpy).toHaveBeenCalledWith('EMBEDDING_PROVIDER=ollama', 'EmbeddingProviderFactory');
  });

  it('lowercases the provider name', () => {
    const { logSpy } = makeFactory('OPENAI');
    expect(logSpy).toHaveBeenCalledWith('EMBEDDING_PROVIDER=openai', 'EmbeddingProviderFactory');
  });
});

// ---------------------------------------------------------------------------
// getProvider
// ---------------------------------------------------------------------------

describe('EmbeddingProviderFactory.getProvider', () => {
  it('returns OllamaEmbeddingProvider when EMBEDDING_PROVIDER=ollama', () => {
    const configService = {
      get: <T>(key: string): T | undefined =>
        key === 'EMBEDDING_PROVIDER' ? ('ollama' as unknown as T) : undefined,
    } as never;
    const logger = { log: jest.fn(), error: jest.fn(), debug: jest.fn() } as never;
    const ollamaProvider = { generateEmbedding: jest.fn() } as unknown as OllamaEmbeddingProvider;
    const openAiProvider = { generateEmbedding: jest.fn() } as unknown as OpenAiEmbeddingProvider;

    const lmStudioProvider = {
      generateEmbedding: jest.fn(),
    } as unknown as LmStudioEmbeddingProvider;

    const factory = new EmbeddingProviderFactory(
      configService,
      ollamaProvider,
      openAiProvider,
      lmStudioProvider,
      logger,
    );
    expect(factory.getProvider()).toBe(ollamaProvider);
  });

  it('returns OpenAiEmbeddingProvider when EMBEDDING_PROVIDER=openai', () => {
    const configService = {
      get: <T>(key: string): T | undefined =>
        key === 'EMBEDDING_PROVIDER' ? ('openai' as unknown as T) : undefined,
    } as never;
    const logger = { log: jest.fn(), error: jest.fn(), debug: jest.fn() } as never;
    const ollamaProvider = { generateEmbedding: jest.fn() } as unknown as OllamaEmbeddingProvider;
    const openAiProvider = { generateEmbedding: jest.fn() } as unknown as OpenAiEmbeddingProvider;

    const lmStudioProvider = {
      generateEmbedding: jest.fn(),
    } as unknown as LmStudioEmbeddingProvider;

    const factory = new EmbeddingProviderFactory(
      configService,
      ollamaProvider,
      openAiProvider,
      lmStudioProvider,
      logger,
    );
    expect(factory.getProvider()).toBe(openAiProvider);
  });

  it('returns LmStudioEmbeddingProvider when EMBEDDING_PROVIDER=lmstudio', () => {
    const configService = {
      get: <T>(key: string): T | undefined =>
        key === 'EMBEDDING_PROVIDER' ? ('lmstudio' as unknown as T) : undefined,
    } as never;
    const logger = { log: jest.fn(), error: jest.fn(), debug: jest.fn() } as never;
    const ollamaProvider = { generateEmbedding: jest.fn() } as unknown as OllamaEmbeddingProvider;
    const openAiProvider = { generateEmbedding: jest.fn() } as unknown as OpenAiEmbeddingProvider;
    const lmStudioProvider = {
      generateEmbedding: jest.fn(),
    } as unknown as LmStudioEmbeddingProvider;

    const factory = new EmbeddingProviderFactory(
      configService,
      ollamaProvider,
      openAiProvider,
      lmStudioProvider,
      logger,
    );
    expect(factory.getProvider()).toBe(lmStudioProvider);
  });

  it('throws when EMBEDDING_PROVIDER=lmstudio but provider is not initialised', () => {
    const configService = {
      get: <T>(key: string): T | undefined =>
        key === 'EMBEDDING_PROVIDER' ? ('lmstudio' as unknown as T) : undefined,
    } as never;
    const logger = { log: jest.fn(), error: jest.fn(), debug: jest.fn() } as never;
    const ollamaProvider = { generateEmbedding: jest.fn() } as unknown as OllamaEmbeddingProvider;
    const openAiProvider = { generateEmbedding: jest.fn() } as unknown as OpenAiEmbeddingProvider;

    const factory = new EmbeddingProviderFactory(
      configService,
      ollamaProvider,
      openAiProvider,
      null,
      logger,
    );
    expect(() => factory.getProvider()).toThrow(
      'LM Studio provider not initialised (EMBEDDING_PROVIDER=lmstudio)',
    );
  });

  it('throws for an unknown provider value', () => {
    const { factory } = makeFactory('huggingface');
    expect(() => factory.getProvider()).toThrow('Unsupported EMBEDDING_PROVIDER: huggingface');
  });

  it('throws with the exact error message format', () => {
    const { factory } = makeFactory('unknown-provider');
    expect(() => factory.getProvider()).toThrow(
      new Error('Unsupported EMBEDDING_PROVIDER: unknown-provider'),
    );
  });
});
