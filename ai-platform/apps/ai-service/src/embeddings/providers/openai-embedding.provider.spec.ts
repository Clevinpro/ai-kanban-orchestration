import axios from 'axios';
import type { AxiosError } from 'axios';
import { OpenAiEmbeddingProvider } from './openai-embedding.provider';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('axios');
const mockedAxiosPost = axios.post as jest.MockedFunction<typeof axios.post>;

// AxiosError from the real module (jest.mock replaces the module with auto-mocks,
// so we must reach into the actual implementation for the real class constructor).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AxiosError: RealAxiosError } = jest.requireActual<typeof import('axios')>('axios');

function makeProvider(
  overrides: { OPENAI_API_KEY?: string; OPENAI_EMBEDDING_MODEL?: string } = {},
): OpenAiEmbeddingProvider {
  const env: Record<string, string> = {
    OPENAI_API_KEY: 'test-key',
    ...overrides,
  };

  const configService = {
    get: <T>(key: string): T | undefined => env[key] as T | undefined,
  } as never;

  const logger = {
    debug: jest.fn(),
    log: jest.fn(),
  } as never;

  return new OpenAiEmbeddingProvider(configService, logger);
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe('OpenAiEmbeddingProvider — construction', () => {
  it('does not throw when OPENAI_API_KEY is missing (guard deferred to method call)', () => {
    expect(() => makeProvider({ OPENAI_API_KEY: '' })).not.toThrow();
  });

  it('does not throw when OPENAI_API_KEY is present', () => {
    expect(() => makeProvider()).not.toThrow();
  });

  it('throws when OPENAI_API_KEY is missing and generateEmbedding is called', async () => {
    const provider = makeProvider({ OPENAI_API_KEY: '' });
    await expect(provider.generateEmbedding('hello')).rejects.toThrow(
      'OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai',
    );
  });

  it('throws when OPENAI_API_KEY is missing and generateBatch is called', async () => {
    const provider = makeProvider({ OPENAI_API_KEY: '' });
    await expect(provider.generateBatch(['a', 'b'])).rejects.toThrow(
      'OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai',
    );
  });
});

// ---------------------------------------------------------------------------
// generateEmbedding
// ---------------------------------------------------------------------------

describe('OpenAiEmbeddingProvider.generateEmbedding', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POSTs to OpenAI with correct body and returns embedding', async () => {
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
      Record<string, unknown>,
    ];
    expect(url).toBe('https://api.openai.com/v1/embeddings');
    expect(body.input).toBe('hello world');
    expect(body.model).toBe('text-embedding-3-small');
    expect(body.dimensions).toBe(768);
    expect((config as { headers: Record<string, string> }).headers['Authorization']).toMatch(
      /^Bearer /,
    );
    expect(result).toEqual(embedding);
  });

  it('does not include the API key in log output', async () => {
    const embedding = [0.1, 0.2, 0.3];
    mockedAxiosPost.mockResolvedValueOnce({
      data: { data: [{ embedding, index: 0, object: 'embedding' }] },
    });

    const configService = {
      get: (key: string) => (key === 'OPENAI_API_KEY' ? 'super-secret-key' : undefined),
    } as never;
    const debugSpy = jest.fn();
    const logger = { debug: debugSpy, log: jest.fn() } as never;
    const provider = new OpenAiEmbeddingProvider(configService, logger);
    await provider.generateEmbedding('text');

    for (const call of debugSpy.mock.calls as string[][]) {
      for (const arg of call) {
        if (typeof arg === 'string') {
          expect(arg).not.toContain('super-secret-key');
        }
      }
    }
  });

  it('uses custom model from OPENAI_EMBEDDING_MODEL when set', async () => {
    const embedding = [0.5];
    mockedAxiosPost.mockResolvedValueOnce({
      data: { data: [{ embedding, index: 0, object: 'embedding' }] },
    });

    const provider = makeProvider({ OPENAI_EMBEDDING_MODEL: 'text-embedding-3-large' });
    await provider.generateEmbedding('text');

    const body = mockedAxiosPost.mock.calls[0][1] as Record<string, unknown>;
    expect(body.model).toBe('text-embedding-3-large');
  });
});

// ---------------------------------------------------------------------------
// generateBatch
// ---------------------------------------------------------------------------

describe('OpenAiEmbeddingProvider.generateBatch', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POSTs all texts in a single HTTP call and returns all embeddings', async () => {
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
    const body = mockedAxiosPost.mock.calls[0][1] as Record<string, unknown>;
    expect(body.input).toEqual(['first', 'second']);
    expect(body.dimensions).toBe(768);
    expect(result).toEqual([emb1, emb2]);
  });

  it('sorts embeddings by index field when API returns them out of order', async () => {
    const emb0 = [0.1, 0.2];
    const emb1 = [0.3, 0.4];
    const emb2 = [0.5, 0.6];
    // API returns objects in reverse order: index 2, 0, 1
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
// Error handling — API key must never leak in rethrown errors
// ---------------------------------------------------------------------------

describe('OpenAiEmbeddingProvider — HTTP error handling', () => {
  const API_KEY = 'sk-super-secret-key-must-not-leak';

  beforeEach(() => jest.clearAllMocks());

  function makeAxiosError(status: number): AxiosError {
    const err = new RealAxiosError(
      `Request failed with status code ${status}`,
      'ERR_BAD_RESPONSE',
      // config contains Authorization header — must be stripped
      {
        headers: { Authorization: `Bearer ${API_KEY}` } as never,
        url: 'https://api.openai.com/v1/embeddings',
        method: 'post',
      } as never,
      // request object — must be stripped
      {} as never,
      {
        status,
        data: { error: { message: 'Invalid authentication credentials' } },
      } as never,
    ) as AxiosError;
    return err;
  }

  it('rethrows a sanitized Error (not AxiosError) on non-2xx response from generateEmbedding', async () => {
    mockedAxiosPost.mockRejectedValueOnce(makeAxiosError(401));

    const provider = makeProvider({ OPENAI_API_KEY: API_KEY });
    await expect(provider.generateEmbedding('hello')).rejects.toThrow(Error);
    await expect(provider.generateEmbedding('hello')).rejects.not.toBeInstanceOf(RealAxiosError);
  });

  it('does not expose the API key in the rethrown error message from generateEmbedding', async () => {
    mockedAxiosPost.mockRejectedValue(makeAxiosError(401));

    const provider = makeProvider({ OPENAI_API_KEY: API_KEY });
    let caught: Error | undefined;
    try {
      await provider.generateEmbedding('hello');
    } catch (e) {
      caught = e as Error;
    }

    expect(caught).toBeDefined();
    expect(caught!.message).not.toContain(API_KEY);
    // Must not carry config or request properties that hold headers
    expect((caught as unknown as Record<string, unknown>)['config']).toBeUndefined();
    expect((caught as unknown as Record<string, unknown>)['request']).toBeUndefined();
  });

  it('does not expose the API key in the rethrown error message from generateBatch', async () => {
    mockedAxiosPost.mockRejectedValue(makeAxiosError(429));

    const provider = makeProvider({ OPENAI_API_KEY: API_KEY });
    let caught: Error | undefined;
    try {
      await provider.generateBatch(['a', 'b']);
    } catch (e) {
      caught = e as Error;
    }

    expect(caught).toBeDefined();
    expect(caught!.message).not.toContain(API_KEY);
    expect((caught as unknown as Record<string, unknown>)['config']).toBeUndefined();
    expect((caught as unknown as Record<string, unknown>)['request']).toBeUndefined();
  });

  it('includes the HTTP status code in the rethrown error message', async () => {
    mockedAxiosPost.mockRejectedValue(makeAxiosError(403));

    const provider = makeProvider({ OPENAI_API_KEY: API_KEY });
    await expect(provider.generateEmbedding('hello')).rejects.toThrow(/403/);
  });
});

// ---------------------------------------------------------------------------
// Empty response guard
// ---------------------------------------------------------------------------

describe('OpenAiEmbeddingProvider — empty response guard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws a descriptive error when generateEmbedding receives empty data array', async () => {
    mockedAxiosPost.mockResolvedValueOnce({ data: { data: [] } });

    const provider = makeProvider();
    await expect(provider.generateEmbedding('hello')).rejects.toThrow(
      'OpenAI embeddings API returned no data',
    );
  });

  it('throws a descriptive error when generateBatch receives empty data array', async () => {
    mockedAxiosPost.mockResolvedValueOnce({ data: { data: [] } });

    const provider = makeProvider();
    await expect(provider.generateBatch(['a', 'b'])).rejects.toThrow(
      'OpenAI embeddings API returned no data',
    );
  });
});
