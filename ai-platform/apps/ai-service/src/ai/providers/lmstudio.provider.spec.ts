import type { ChatMessage } from '@ai-platform/shared';
import axios from 'axios';
import type * as AxiosModule from 'axios';
import type { AxiosError } from 'axios';
import { firstValueFrom, lastValueFrom, toArray } from 'rxjs';
import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { LmStudioProvider } from './lmstudio.provider';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('axios');
const mockedAxiosGet = axios.get as jest.MockedFunction<typeof axios.get>;
const mockedAxiosPost = axios.post as jest.MockedFunction<typeof axios.post>;

// AxiosError + isAxiosError from the real module (jest.mock replaces the module
// with auto-mocks, so we must reach into the actual implementation for the real
// class constructor and the real type guard the provider relies on).
const realAxios = jest.requireActual<typeof AxiosModule>('axios');
const { AxiosError: RealAxiosError } = realAxios;

const DEFAULT_LMSTUDIO_URL = 'http://localhost:1234/v1';

/**
 * A minimal stand-in for the axios response `stream` (a Readable).
 * Tests drive the SSE feed by calling `emitData` / `emitEnd` / `emitError`.
 */
class FakeStream extends EventEmitter {
  destroy = jest.fn();

  emitData(chunk: string): void {
    this.emit('data', Buffer.from(chunk, 'utf8'));
  }

  emitEnd(): void {
    this.emit('end');
  }

  emitError(error: Error): void {
    this.emit('error', error);
  }
}

function makeProvider(
  overrides: { LMSTUDIO_CHAT_URL?: string; LMSTUDIO_CHAT_MODEL?: string } = {},
): { provider: LmStudioProvider; logSpy: jest.Mock } {
  const env: Record<string, string | undefined> = { ...overrides };

  const configService = {
    get: <T>(key: string): T | undefined => env[key] as T | undefined,
  } as never;

  const logSpy = jest.fn();
  const logger = { log: logSpy, error: jest.fn(), debug: jest.fn() } as never;

  return { provider: new LmStudioProvider(configService, logger), logSpy };
}

/**
 * Resolve a model via env so chat() does not need a `/models` call. Returns the
 * fake stream wired to the next axios.post resolution so the test can feed SSE.
 */
function wireChatStream(): FakeStream {
  const stream = new FakeStream();
  mockedAxiosPost.mockResolvedValueOnce({ data: stream } as never);
  return stream;
}

beforeEach(() => {
  jest.clearAllMocks();
  // The provider uses the `isAxiosError` type guard; restore the real impl
  // since jest.mock('axios') replaced it with a no-op auto-mock.
  (axios.isAxiosError as unknown as jest.Mock).mockImplementation(realAxios.isAxiosError);
});

// ---------------------------------------------------------------------------
// SSE streaming
// ---------------------------------------------------------------------------

describe('LmStudioProvider.chat — SSE streaming', () => {
  function sseToken(content: string): string {
    return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n`;
  }

  it('emits a single token then completes on data: [DONE]', async () => {
    const { provider } = makeProvider({ LMSTUDIO_CHAT_MODEL: 'm' });
    const stream = wireChatStream();

    const tokens$ = provider.chat('hi').pipe(toArray());
    const collected = lastValueFrom(tokens$);

    // Allow the async axios.post to resolve and the data handler to attach.
    await new Promise((r) => setImmediate(r));

    stream.emitData(sseToken('hello'));
    stream.emitData('data: [DONE]\n');

    await expect(collected).resolves.toEqual(['hello']);
  });

  it('buffers an SSE JSON line split mid-JSON across two chunk events and emits the token once', async () => {
    const { provider } = makeProvider({ LMSTUDIO_CHAT_MODEL: 'm' });
    const stream = wireChatStream();

    const tokens$ = provider.chat('hi').pipe(toArray());
    const collected = lastValueFrom(tokens$);

    await new Promise((r) => setImmediate(r));

    // The JSON line is split mid-object across two `data` events.
    stream.emitData('data: {"choices":[{"delta":{"con');
    stream.emitData('tent":"hi"}}]}\n');
    stream.emitData('data: [DONE]\n');

    await expect(collected).resolves.toEqual(['hi']);
  });

  it('completes without emitting when the stream begins with data: [DONE]', async () => {
    const { provider } = makeProvider({ LMSTUDIO_CHAT_MODEL: 'm' });
    const stream = wireChatStream();

    const tokens$ = provider.chat('hi').pipe(toArray());
    const collected = lastValueFrom(tokens$);

    await new Promise((r) => setImmediate(r));

    stream.emitData('data: [DONE]\n');

    await expect(collected).resolves.toEqual([]);
  });

  it('parses multiple tokens delivered across several chunks', async () => {
    const { provider } = makeProvider({ LMSTUDIO_CHAT_MODEL: 'm' });
    const stream = wireChatStream();

    const tokens$ = provider.chat('hi').pipe(toArray());
    const collected = lastValueFrom(tokens$);

    await new Promise((r) => setImmediate(r));

    stream.emitData(sseToken('Hello') + sseToken(', '));
    stream.emitData(sseToken('world'));
    stream.emitData('data: [DONE]\n');

    await expect(collected).resolves.toEqual(['Hello', ', ', 'world']);
  });

  it('completes on stream end and flushes a trailing buffered line', async () => {
    const { provider } = makeProvider({ LMSTUDIO_CHAT_MODEL: 'm' });
    const stream = wireChatStream();

    const tokens$ = provider.chat('hi').pipe(toArray());
    const collected = lastValueFrom(tokens$);

    await new Promise((r) => setImmediate(r));

    // No trailing newline: the line stays buffered until `end` flushes it.
    stream.emitData(`data: ${JSON.stringify({ choices: [{ delta: { content: 'tail' } }] })}`);
    stream.emitEnd();

    await expect(collected).resolves.toEqual(['tail']);
  });
});

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------

describe('LmStudioProvider.chat — error handling', () => {
  function makeAxiosErrorWithBody(status: number, body: unknown): AxiosError {
    return new RealAxiosError(
      `Request failed with status code ${status}`,
      'ERR_BAD_RESPONSE',
      { url: `${DEFAULT_LMSTUDIO_URL}/chat/completions`, method: 'post' } as never,
      {} as never,
      { status, data: body } as never,
    ) as AxiosError;
  }

  it('surfaces connection-refused via subscriber.error', async () => {
    const { provider } = makeProvider({ LMSTUDIO_CHAT_MODEL: 'm' });
    const connError = new RealAxiosError(
      '',
      'ECONNREFUSED',
      { url: `${DEFAULT_LMSTUDIO_URL}/chat/completions`, method: 'post' } as never,
      {} as never,
      undefined,
    ) as AxiosError;
    mockedAxiosPost.mockRejectedValueOnce(connError);

    await expect(firstValueFrom(provider.chat('hi'))).rejects.toBe(connError);
  });

  it('formats an HTTP 4xx error with a string body as "LM Studio chat HTTP <status> (<url>): <detail>"', async () => {
    const { provider } = makeProvider({ LMSTUDIO_CHAT_MODEL: 'm' });
    mockedAxiosPost.mockRejectedValueOnce(makeAxiosErrorWithBody(400, 'bad request body'));

    await expect(firstValueFrom(provider.chat('hi'))).rejects.toThrow(
      `LM Studio chat HTTP 400 (${DEFAULT_LMSTUDIO_URL}/chat/completions): bad request body`,
    );
  });

  it('drains a Readable HTTP 5xx error body and includes it in the message', async () => {
    const { provider } = makeProvider({ LMSTUDIO_CHAT_MODEL: 'm' });
    const bodyStream = Readable.from([Buffer.from('server exploded', 'utf8')]);
    mockedAxiosPost.mockRejectedValueOnce(makeAxiosErrorWithBody(500, bodyStream));

    await expect(firstValueFrom(provider.chat('hi'))).rejects.toThrow(
      `LM Studio chat HTTP 500 (${DEFAULT_LMSTUDIO_URL}/chat/completions): server exploded`,
    );
  });

  it('propagates a stream error event via subscriber.error', async () => {
    const { provider } = makeProvider({ LMSTUDIO_CHAT_MODEL: 'm' });
    const stream = wireChatStream();

    const result = firstValueFrom(provider.chat('hi'));
    await new Promise((r) => setImmediate(r));

    const boom = new Error('socket hang up');
    stream.emitError(boom);

    await expect(result).rejects.toBe(boom);
  });
});

// ---------------------------------------------------------------------------
// Role-faithful message mapping
// ---------------------------------------------------------------------------

describe('LmStudioProvider.chat — message mapping', () => {
  async function captureRequestBody(
    message: Parameters<LmStudioProvider['chat']>[0],
  ): Promise<Record<string, unknown>> {
    const { provider } = makeProvider({ LMSTUDIO_CHAT_MODEL: 'model-x' });
    const stream = wireChatStream();

    const done = lastValueFrom(provider.chat(message).pipe(toArray()));
    await new Promise((r) => setImmediate(r));
    stream.emitData('data: [DONE]\n');
    await done;

    return mockedAxiosPost.mock.calls[0][1] as Record<string, unknown>;
  }

  it('maps a string to a single user message', async () => {
    const body = await captureRequestBody('plain text');
    expect(body.messages).toEqual([{ role: 'user', content: 'plain text' }]);
  });

  it('maps { system, user } to a system + user pair', async () => {
    const body = await captureRequestBody({ system: 'be terse', user: 'hi' });
    expect(body.messages).toEqual([
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'hi' },
    ]);
  });

  it('maps a ChatMessage[] 1:1 preserving system/user/assistant roles', async () => {
    const history: ChatMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
    ];
    const body = await captureRequestBody(history);
    expect(body.messages).toEqual(history);
  });
});

// ---------------------------------------------------------------------------
// Model resolution
// ---------------------------------------------------------------------------

describe('LmStudioProvider.resolveModel', () => {
  it('uses LMSTUDIO_CHAT_MODEL from env when set (no /models call)', async () => {
    const { provider } = makeProvider({ LMSTUDIO_CHAT_MODEL: 'env-model' });

    await expect(provider.resolveModel()).resolves.toBe('env-model');
    expect(mockedAxiosGet).not.toHaveBeenCalled();
  });

  it('falls back to the first id from GET /models when env is unset', async () => {
    const { provider } = makeProvider();
    mockedAxiosGet.mockResolvedValueOnce({
      data: { data: [{ id: 'loaded-model' }, { id: 'other' }] },
    } as never);

    await expect(provider.resolveModel()).resolves.toBe('loaded-model');
    expect(mockedAxiosGet).toHaveBeenCalledWith(`${DEFAULT_LMSTUDIO_URL}/models`);
  });

  it('rejects with the no-model-loaded error when env is unset and /models is empty', async () => {
    const { provider } = makeProvider();
    mockedAxiosGet.mockResolvedValueOnce({ data: { data: [] } } as never);

    await expect(provider.resolveModel()).rejects.toThrow(
      'No LM Studio model loaded — set LMSTUDIO_CHAT_MODEL or load a model in LM Studio',
    );
  });

  it('getActiveModel delegates to resolveModel', async () => {
    const { provider } = makeProvider({ LMSTUDIO_CHAT_MODEL: 'env-model' });
    await expect(provider.getActiveModel()).resolves.toBe('env-model');
  });
});

// ---------------------------------------------------------------------------
// Request assertions
// ---------------------------------------------------------------------------

describe('LmStudioProvider.chat — request shape', () => {
  it('POSTs { model, messages, stream: true } to /chat/completions with no Authorization header', async () => {
    const { provider } = makeProvider({ LMSTUDIO_CHAT_MODEL: 'model-x' });
    const stream = wireChatStream();

    const done = lastValueFrom(provider.chat('hi').pipe(toArray()));
    await new Promise((r) => setImmediate(r));
    stream.emitData('data: [DONE]\n');
    await done;

    const [url, body, config] = mockedAxiosPost.mock.calls[0] as [
      string,
      Record<string, unknown>,
      Record<string, unknown> | undefined,
    ];

    expect(url).toBe(`${DEFAULT_LMSTUDIO_URL}/chat/completions`);
    expect(body).toEqual({
      model: 'model-x',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    });
    expect(Object.keys(body).sort()).toEqual(['messages', 'model', 'stream']);

    // No Authorization header — LM Studio needs no API key.
    const headers = (config as { headers?: Record<string, string> } | undefined)?.headers;
    expect(headers?.['Authorization']).toBeUndefined();
  });

  it('resolves the model via GET /models when env is unset and uses it in the POST body', async () => {
    const { provider } = makeProvider();
    mockedAxiosGet.mockResolvedValueOnce({
      data: { data: [{ id: 'auto-model' }] },
    } as never);
    const stream = wireChatStream();

    const done = lastValueFrom(provider.chat('hi').pipe(toArray()));
    await new Promise((r) => setImmediate(r));
    stream.emitData('data: [DONE]\n');
    await done;

    const body = mockedAxiosPost.mock.calls[0][1] as Record<string, unknown>;
    expect(body.model).toBe('auto-model');
  });
});
