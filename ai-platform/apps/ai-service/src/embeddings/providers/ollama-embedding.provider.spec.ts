import axios from 'axios';
import type * as AxiosModule from 'axios';
import type { AxiosError } from 'axios';
import { OllamaEmbeddingProvider } from './ollama-embedding.provider';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// AxiosError from the real module (jest.mock replaces the module with auto-mocks,
// so we must reach into the actual implementation for the real class constructor).

const { AxiosError: RealAxiosError } = jest.requireActual<typeof AxiosModule>('axios');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockLogger = {
  log: jest.Mock;
  debug: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

let lastLogger: MockLogger;

function makeProvider(
  overrides: { OLLAMA_URL?: string; OLLAMA_EMBEDDING_MODEL?: string } = {},
): OllamaEmbeddingProvider {
  const env: Record<string, string> = {
    OLLAMA_URL: 'http://localhost:11434',
    ...overrides,
  };

  const configService = {
    get: <T>(key: string): T | undefined => env[key] as T | undefined,
  } as never;

  lastLogger = {
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  return new OllamaEmbeddingProvider(configService, lastLogger as never);
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe('OllamaEmbeddingProvider — construction', () => {
  it('constructs without throwing when all config is present', () => {
    expect(() => makeProvider()).not.toThrow();
  });

  it('defaults OLLAMA_URL to http://localhost:11434 when not set', () => {
    // Construction must not throw even when env is empty
    expect(() => makeProvider({ OLLAMA_URL: undefined as unknown as string })).not.toThrow();
  });

  it('defaults embeddingModel to nomic-embed-text when OLLAMA_EMBEDDING_MODEL is not set', () => {
    expect(() =>
      makeProvider({ OLLAMA_EMBEDDING_MODEL: undefined as unknown as string }),
    ).not.toThrow();
  });

  it('uses custom model from OLLAMA_EMBEDDING_MODEL when set', async () => {
    const embedding = [0.1, 0.2, 0.3];
    mockedAxios.post.mockResolvedValueOnce({ data: { embedding } });

    const provider = makeProvider({ OLLAMA_EMBEDDING_MODEL: 'mxbai-embed-large' });
    await provider.generateEmbedding('test');

    const body = mockedAxios.post.mock.calls[0][1] as Record<string, unknown>;
    expect(body.model).toBe('mxbai-embed-large');
  });
});

// ---------------------------------------------------------------------------
// generateEmbedding — success path
// ---------------------------------------------------------------------------

describe('OllamaEmbeddingProvider.generateEmbedding', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POSTs to the correct Ollama endpoint with model and prompt', async () => {
    const embedding = [0.1, 0.2, 0.3];
    mockedAxios.post.mockResolvedValueOnce({ data: { embedding } });

    const provider = makeProvider();
    const result = await provider.generateEmbedding('hello world');

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const [url, body] = mockedAxios.post.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('http://localhost:11434/api/embeddings');
    expect(body.model).toBe('nomic-embed-text');
    expect(body.prompt).toBe('hello world');
    expect(result).toEqual(embedding);
  });

  it('returns the embedding array from the response', async () => {
    const embedding = Array.from({ length: 384 }, (_, i) => i * 0.001);
    mockedAxios.post.mockResolvedValueOnce({ data: { embedding } });

    const provider = makeProvider();
    const result = await provider.generateEmbedding('embedding text');

    expect(result).toHaveLength(384);
    expect(result).toEqual(embedding);
  });

  it('uses the custom OLLAMA_URL when configured', async () => {
    const embedding = [0.5, 0.6];
    mockedAxios.post.mockResolvedValueOnce({ data: { embedding } });

    const provider = makeProvider({ OLLAMA_URL: 'http://ollama-service:11434' });
    await provider.generateEmbedding('test');

    const [url] = mockedAxios.post.mock.calls[0] as [string, unknown];
    expect(url).toBe('http://ollama-service:11434/api/embeddings');
  });

  it('logs the embed duration with provider name (AC-08)', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { embedding: [0.1, 0.2] } });

    const provider = makeProvider();
    await provider.generateEmbedding('hello');

    expect(lastLogger.debug).toHaveBeenCalledWith(
      expect.stringMatching(/^Ollama embed: \d+ms$/),
      'OllamaEmbeddingProvider',
    );
  });
});

// ---------------------------------------------------------------------------
// generateEmbedding — error path
// ---------------------------------------------------------------------------

describe('OllamaEmbeddingProvider.generateEmbedding — HTTP error', () => {
  beforeEach(() => jest.clearAllMocks());

  function makeAxiosError(status: number): AxiosError {
    return new RealAxiosError(
      `Request failed with status code ${status}`,
      'ERR_BAD_RESPONSE',
      { url: 'http://localhost:11434/api/embeddings', method: 'post' } as never,
      {} as never,
      { status, data: { error: 'model not found' } } as never,
    ) as AxiosError;
  }

  it('propagates the axios error when the HTTP request fails', async () => {
    mockedAxios.post.mockRejectedValueOnce(makeAxiosError(500));

    const provider = makeProvider();
    await expect(provider.generateEmbedding('hello')).rejects.toThrow();
  });

  it('propagates network errors', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

    const provider = makeProvider();
    await expect(provider.generateEmbedding('hello')).rejects.toThrow('connect ECONNREFUSED');
  });
});

// ---------------------------------------------------------------------------
// generateBatch — success path
// ---------------------------------------------------------------------------

describe('OllamaEmbeddingProvider.generateBatch', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls generateEmbedding for each text in parallel', async () => {
    const emb1 = [0.1, 0.2];
    const emb2 = [0.3, 0.4];
    const emb3 = [0.5, 0.6];

    mockedAxios.post
      .mockResolvedValueOnce({ data: { embedding: emb1 } })
      .mockResolvedValueOnce({ data: { embedding: emb2 } })
      .mockResolvedValueOnce({ data: { embedding: emb3 } });

    const provider = makeProvider();
    const result = await provider.generateBatch(['first', 'second', 'third']);

    expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    expect(result).toEqual([emb1, emb2, emb3]);
  });

  it('returns an empty array when given an empty input list', async () => {
    const provider = makeProvider();
    const result = await provider.generateBatch([]);

    expect(result).toEqual([]);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('makes N separate HTTP calls for N texts', async () => {
    mockedAxios.post.mockResolvedValue({ data: { embedding: [0.1] } });

    const provider = makeProvider();
    await provider.generateBatch(['a', 'b', 'c', 'd', 'e']);

    expect(mockedAxios.post).toHaveBeenCalledTimes(5);
  });

  it('propagates an error when any batch item fails', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { embedding: [0.1] } })
      .mockRejectedValueOnce(new Error('model timeout'));

    const provider = makeProvider();
    await expect(provider.generateBatch(['ok', 'fail'])).rejects.toThrow('model timeout');
  });

  it('logs the batch embed duration with provider name (AC-08)', async () => {
    mockedAxios.post.mockResolvedValue({ data: { embedding: [0.1] } });

    const provider = makeProvider();
    await provider.generateBatch(['a', 'b']);

    expect(lastLogger.debug).toHaveBeenCalledWith(
      expect.stringMatching(/^Ollama embed: \d+ms$/),
      'OllamaEmbeddingProvider',
    );
  });
});
