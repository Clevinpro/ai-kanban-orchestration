import { AiProviderFactory } from './ai-provider.factory';
import type { ClaudeProvider } from './claude.provider';
import type { OllamaProvider } from './ollama.provider';
import type { LmStudioProvider } from './lmstudio.provider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFactory(providerEnv: string | undefined): {
  factory: AiProviderFactory;
  claudeProvider: ClaudeProvider;
  ollamaProvider: OllamaProvider;
  lmStudioProvider: LmStudioProvider;
  logSpy: jest.Mock;
} {
  const configService = {
    get: <T>(key: string): T | undefined =>
      key === 'AI_PROVIDER' ? (providerEnv as unknown as T) : undefined,
  } as never;

  const logSpy = jest.fn();
  const logger = { log: logSpy, error: jest.fn(), debug: jest.fn() } as never;

  const claudeProvider = { chat: jest.fn() } as unknown as ClaudeProvider;
  const ollamaProvider = { chat: jest.fn() } as unknown as OllamaProvider;
  const lmStudioProvider = { chat: jest.fn() } as unknown as LmStudioProvider;

  const factory = new AiProviderFactory(
    configService,
    claudeProvider,
    ollamaProvider,
    lmStudioProvider,
    logger,
  );

  return { factory, claudeProvider, ollamaProvider, lmStudioProvider, logSpy };
}

// ---------------------------------------------------------------------------
// Config-only dev/prod provider switch (AI_PROVIDER via ConfigService)
// ---------------------------------------------------------------------------

describe('AiProviderFactory.getProvider', () => {
  it.each([
    ['claude', 'claudeProvider'] as const,
    ['ollama', 'ollamaProvider'] as const,
    ['lmstudio', 'lmStudioProvider'] as const,
  ])('returns the matching provider when AI_PROVIDER=%s', (providerEnv, providerKey) => {
    const deps = makeFactory(providerEnv);
    expect(deps.factory.getProvider()).toBe(deps[providerKey]);
  });

  it('defaults to OllamaProvider when AI_PROVIDER is unset', () => {
    const { factory, ollamaProvider } = makeFactory(undefined);
    expect(factory.getProvider()).toBe(ollamaProvider);
  });

  it('throws for an unsupported AI_PROVIDER value', () => {
    const { factory } = makeFactory('huggingface');
    expect(() => factory.getProvider()).toThrow('Unsupported AI_PROVIDER: huggingface');
  });
});
