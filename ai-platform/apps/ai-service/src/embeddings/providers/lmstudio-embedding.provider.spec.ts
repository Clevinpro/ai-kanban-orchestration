import axios from 'axios';
import type * as AxiosModule from 'axios';
import type { AxiosError } from 'axios';
import { LmStudioEmbeddingProvider } from './lmstudio-embedding.provider';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('axios');
const mockedAxiosPost = axios.post as jest.MockedFunction<typeof axios.post>;

// AxiosError from the real module (jest.mock replaces the module with auto-mocks,
// so we must reach into the actual implementation for the real class constructor).
const { AxiosError: RealAxiosError } = jest.requireActual<typeof AxiosModule>('axios');

const DEFAULT_LMSTUDIO_URL = 'http://localhost:1234/v1';
const DEFAULT_LMSTUDIO_MODEL = 'text-embedding-nomic-embed-text-v1.5';

function makeProvider(
  overrides: { LMSTUDIO_URL?: string; LMSTUDIO_EMBEDDING_MODEL?: string } = {},
): LmStudioEmbeddingProvider {
  const env: Record<string, string | undefined> = { ...overrides };

  const configService = {
    get: <T>(key: string): T | undefined => env[key] as T | undefined,
  } as never;

  const logger = {
    debug: jest.fn(),
    log: jest.fn(),
  } as never;

  return new LmStudioEmbeddingProvider(configService, logger);
}

// ---------------------------------------------------------------------------
// Configuration defaults
// ---------------------------------------------------------------------------

describe('LmStudioEmbeddingProvider — configuration defaults', () => {
  beforeEach(() => jest.clearAllMocks());

  it('falls back to default URL and model when env vars are unset', async () => {
    mockedAxiosPost.mockResolvedValueOnce({
      data: { data: [{ embedding: [0.1], index: 0, object: 'embedding' }] },
    });

    const provider = makeProvider();
    await provider.generateEmbedding('hello');

    const [url, body] = mockedAxiosPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe(`${DEFAULT_LMSTUDIO_URL}/embeddings`);
    expect(body.model).toBe(DEFAULT_LMSTUDIO_MODEL);
  });

  it('uses custom URL and model from env when set', async () => {
    mockedAxiosPost.mockResolvedValueOnce({
      data: { data: [{ embedding: [0.1], index: 0, object: 'embedding' }] },
    });

    const provider = makeProvider({
      LMSTUDIO_URL: 'http://lmstudio.local:5000/v1',
      LMSTUDIO_EMBEDDING_MODEL: 'custom-model',
    });
    await provider.generateEmbedding('hello');

    const [url, body] = mockedAxiosPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('http://lmstudio.local:5000/v1/embeddings');
    expect(body.model).toBe('custom-model');
  });
});

// ---------------------------------------------------------------------------
// generateEmbedding
// ---------------------------------------------------------------------------

describe('LmStudioEmbeddingProvider.generateEmbedding', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POSTs to <LMSTUDIO_URL>/embeddings and returns the embedding vector', async () => {
    const embedding = Array.from({ length: 768 }, (_, i) => i * 0.001);
    mockedAxiosPost.mockResolvedValueOnce({
      data: { data: [{ embedding, index: 0, object: 'embedding' }] },
    });

    const provider = makeProvider();
    const result = await provider.generateEmbedding('hello world');

    expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
    const [url, body, config] = mockedAxiosPost.mock.calls[0] as [
      string,
      Record<string, unknown>,
      Record<string, unknown> | undefined,
    ];
    expect(url).toBe(`${DEFAULT_LMSTUDIO_URL}/embeddings`);
    expect(body.input).toBe('hello world');
    expect(body.model).toBe(DEFAULT_LMSTUDIO_MODEL);
    expect(result).toEqual(embedding);

    // Body must contain exactly { input, model } — no `dimensions` field.
    expect(Object.keys(body).sort()).toEqual(['input', 'model']);
    expect(body).not.toHaveProperty('dimensions');

    // No Authorization header in the request config (LM Studio needs no API key).
    const headers = (config as { headers?: Record<string, string> } | undefined)?.headers;
    expect(headers?.['Authorization']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// generateBatch
// ---------------------------------------------------------------------------

describe('LmStudioEmbeddingProvider.generateBatch', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POSTs all texts in a single HTTP call with input: string[]', async () => {
    const emb1 = [0.1, 0.2];
    const emb2 = [0.3, 0.4];
    mockedAxiosPost.mockResolvedValueOnce({
      data: {
        data: [
          { embedding: emb1, index: 0, object: 'embedding' },
          { embedding: emb2, index: 1, object: 'embedding' },
        ],
      },
    });

    const provider = makeProvider();
    const result = await provider.generateBatch(['first', 'second']);

    expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
    const [, body, config] = mockedAxiosPost.mock.calls[0] as [
      string,
      Record<string, unknown>,
      Record<string, unknown> | undefined,
    ];
    expect(body.input).toEqual(['first', 'second']);
    expect(result).toEqual([emb1, emb2]);

    // Body must contain exactly { input, model } — no `dimensions` field.
    expect(Object.keys(body).sort()).toEqual(['input', 'model']);
    expect(body).not.toHaveProperty('dimensions');

    // No Authorization header in the request config.
    const headers = (config as { headers?: Record<string, string> } | undefined)?.headers;
    expect(headers?.['Authorization']).toBeUndefined();
  });

  it('sorts embeddings by index field when API returns them out of order', async () => {
    const emb0 = [0.1, 0.2];
    const emb1 = [0.3, 0.4];
    const emb2 = [0.5, 0.6];
    // API returns objects shuffled: index 2, 0, 1
    mockedAxiosPost.mockResolvedValueOnce({
      data: {
        data: [
          { embedding: emb2, index: 2, object: 'embedding' },
          { embedding: emb0, index: 0, object: 'embedding' },
          { embedding: emb1, index: 1, object: 'embedding' },
        ],
      },
    });

    const provider = makeProvider();
    const result = await provider.generateBatch(['a', 'b', 'c']);

    expect(result).toEqual([emb0, emb1, emb2]);
  });
});

// ---------------------------------------------------------------------------
// HTTP error handling — sanitized, no stack/header leak
// ---------------------------------------------------------------------------

describe('LmStudioEmbeddingProvider — HTTP error handling', () => {
  beforeEach(() => jest.clearAllMocks());

  function makeAxiosError(status: number): AxiosError {
    return new RealAxiosError(
      `Request failed with status code ${status}`,
      'ERR_BAD_RESPONSE',
      {
        url: `${DEFAULT_LMSTUDIO_URL}/embeddings`,
        method: 'post',
      } as never,
      {} as never,
      {
        status,
        data: { error: { message: 'Model not loaded' } },
      } as never,
    ) as AxiosError;
  }

  it('surfaces a sanitized Error (not AxiosError) on non-2xx response from generateEmbedding', async () => {
    mockedAxiosPost.mockRejectedValueOnce(makeAxiosError(500));

    const provider = makeProvider();
    await expect(provider.generateEmbedding('hello')).rejects.toThrow(Error);
    mockedAxiosPost.mockRejectedValueOnce(makeAxiosError(500));
    await expect(provider.generateEmbedding('hello')).rejects.not.toBeInstanceOf(RealAxiosError);
  });

  it('formats the error as "LM Studio API request failed: status=..., message=..."', async () => {
    mockedAxiosPost.mockRejectedValueOnce(makeAxiosError(503));

    const provider = makeProvider();
    await expect(provider.generateEmbedding('hello')).rejects.toThrow(
      'LM Studio API request failed: status=503, message=Model not loaded',
    );
  });

  it('falls back to the axios error code when the message is empty (ECONNREFUSED AggregateError)', async () => {
    // Node >= 17 connection failures to localhost produce an AggregateError
    // with an empty message; axios wraps it keeping message='' and code set.
    const connError = new RealAxiosError(
      '',
      'ECONNREFUSED',
      { url: `${DEFAULT_LMSTUDIO_URL}/embeddings`, method: 'post' } as never,
      {} as never,
      undefined,
    ) as AxiosError;
    mockedAxiosPost.mockRejectedValueOnce(connError);

    const provider = makeProvider();
    await expect(provider.generateEmbedding('hello')).rejects.toThrow(
      'LM Studio API request failed: status=unknown, message=ECONNREFUSED',
    );
  });

  it('does not leak axios config/request internals on the rethrown error', async () => {
    mockedAxiosPost.mockRejectedValue(makeAxiosError(500));

    const provider = makeProvider();
    let caught: Error | undefined;
    try {
      await provider.generateBatch(['a', 'b']);
    } catch (e) {
      caught = e as Error;
    }

    expect(caught).toBeDefined();
    expect((caught as unknown as Record<string, unknown>)['config']).toBeUndefined();
    expect((caught as unknown as Record<string, unknown>)['request']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Empty response guard
// ---------------------------------------------------------------------------

describe('LmStudioEmbeddingProvider — empty response guard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws a descriptive error when generateEmbedding receives an empty data array', async () => {
    mockedAxiosPost.mockResolvedValueOnce({ data: { data: [] } });

    const provider = makeProvider();
    await expect(provider.generateEmbedding('hello')).rejects.toThrow(
      'LM Studio embeddings API returned no data',
    );
  });

  it('throws a descriptive error when generateBatch receives an empty data array', async () => {
    mockedAxiosPost.mockResolvedValueOnce({ data: { data: [] } });

    const provider = makeProvider();
    await expect(provider.generateBatch(['a', 'b'])).rejects.toThrow(
      'LM Studio embeddings API returned no data',
    );
  });
});
