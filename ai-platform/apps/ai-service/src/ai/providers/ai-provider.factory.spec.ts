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
// getProvider dispatch
// ---------------------------------------------------------------------------

describe('AiProviderFactory.getProvider', () => {
  it('returns ClaudeProvider when AI_PROVIDER=claude', () => {
    const { factory, claudeProvider } = makeFactory('claude');
    expect(factory.getProvider()).toBe(claudeProvider);
  });

  it('returns OllamaProvider when AI_PROVIDER=ollama', () => {
    const { factory, ollamaProvider } = makeFactory('ollama');
    expect(factory.getProvider()).toBe(ollamaProvider);
  });

  it('defaults to OllamaProvider when AI_PROVIDER is unset', () => {
    const { factory, ollamaProvider } = makeFactory(undefined);
    expect(factory.getProvider()).toBe(ollamaProvider);
  });

  it('returns LmStudioProvider when AI_PROVIDER=lmstudio', () => {
    const { factory, lmStudioProvider } = makeFactory('lmstudio');
    expect(factory.getProvider()).toBe(lmStudioProvider);
  });

  it('throws for an unknown provider value', () => {
    const { factory } = makeFactory('huggingface');
    expect(() => factory.getProvider()).toThrow('Unsupported AI_PROVIDER: huggingface');
  });
});
