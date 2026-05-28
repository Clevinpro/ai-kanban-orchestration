import { BadRequestException } from '@nestjs/common';
import { resolve } from 'path';
import { VaultSyncService } from './vault-sync.service';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const mockUploadDocument = jest.fn();
const mockQueryRaw = jest.fn();
const mockExecuteRaw = jest.fn();
const mock$transaction = jest.fn();

const mockDocumentService = { uploadDocument: mockUploadDocument } as never;
const mockPrismaService = {
  $queryRaw: mockQueryRaw,
  $executeRaw: mockExecuteRaw,
  $transaction: mock$transaction,
} as never;
const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeService(): VaultSyncService {
  return new VaultSyncService(mockDocumentService, mockPrismaService, mockLogger);
}

function absVaultPath(relative: string): string {
  return resolve(process.cwd(), 'docs/obsidian-vault', relative);
}

// Access private methods without TypeScript complaints
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function priv(service: VaultSyncService): any {
  return service as never;
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  // Clear VAULT_PATH so tests use process.cwd()-relative resolution
  // (cwd in Jest = ai-platform/; absVaultPath() builds paths from there)
  delete process.env['VAULT_PATH'];
  delete process.env['EMBEDDING_PROVIDER'];
  mockUploadDocument.mockResolvedValue({ documentId: 'doc-1', chunksCount: 3 });
  mockQueryRaw.mockResolvedValue([]);
  mockExecuteRaw.mockResolvedValue(1);
  mock$transaction.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// deriveTitle
// ---------------------------------------------------------------------------

describe('VaultSyncService.deriveTitle', () => {
  it('commit path preserves date segments and short hash', () => {
    const service = makeService();
    const path = absVaultPath('commits/2026-05-26-abc1234.md');
    expect(priv(service).deriveTitle(path)).toBe('Commits 2026-05-26 Abc1234');
  });

  it('project/Overview.md → "Project Overview"', () => {
    const service = makeService();
    expect(priv(service).deriveTitle(absVaultPath('project/Overview.md'))).toBe(
      'Project Overview',
    );
  });

  it('Index.md at vault root → "Index"', () => {
    const service = makeService();
    expect(priv(service).deriveTitle(absVaultPath('Index.md'))).toBe('Index');
  });

  it('_MOC.md → "MOC" (leading underscore stripped)', () => {
    const service = makeService();
    expect(priv(service).deriveTitle(absVaultPath('commits/_MOC.md'))).toBe('Commits MOC');
  });

  it('multi-segment date YYYY-MM-DD stays intact', () => {
    const service = makeService();
    const title = priv(service).deriveTitle(absVaultPath('commits/2026-12-31-deadbeef.md'));
    expect(title).toContain('2026-12-31');
  });

  it('epics/obsidian-integration.md → drops hyphens between words', () => {
    const service = makeService();
    const title = priv(service).deriveTitle(absVaultPath('epics/obsidian-integration.md'));
    expect(title).toBe('Epics Obsidian Integration');
  });
});

// ---------------------------------------------------------------------------
// assertWithinVault (path-traversal guard)
// ---------------------------------------------------------------------------

describe('VaultSyncService.assertWithinVault', () => {
  it('accepts absolute path inside vault', () => {
    const service = makeService();
    expect(() =>
      priv(service).assertWithinVault(absVaultPath('commits/note.md')),
    ).not.toThrow();
  });

  it('accepts relative path docs/obsidian-vault/...', () => {
    const service = makeService();
    expect(() =>
      priv(service).assertWithinVault('docs/obsidian-vault/commits/note.md'),
    ).not.toThrow();
  });

  it('rejects path that escapes vault via ..', () => {
    const service = makeService();
    expect(() =>
      priv(service).assertWithinVault('docs/obsidian-vault/../../ai-platform/.env'),
    ).toThrow(BadRequestException);
  });

  it('rejects absolute path outside vault', () => {
    const service = makeService();
    expect(() => priv(service).assertWithinVault('/etc/passwd')).toThrow(BadRequestException);
  });

  it('rejects deep traversal that starts with vault prefix', () => {
    const service = makeService();
    expect(() =>
      priv(service).assertWithinVault('docs/obsidian-vault/../../../etc/hosts'),
    ).toThrow(BadRequestException);
  });
});

// ---------------------------------------------------------------------------
// getStatus
// ---------------------------------------------------------------------------

describe('VaultSyncService.getStatus', () => {
  it('returns indexed=0 and lastSync="never" before any sync', () => {
    const service = makeService();
    expect(service.getStatus()).toEqual({ indexed: 0, lastSync: 'never' });
  });
});

// ---------------------------------------------------------------------------
// syncFile
// ---------------------------------------------------------------------------

describe('VaultSyncService.syncFile', () => {
  const validRelPath = 'docs/obsidian-vault/commits/2026-05-26-abc1234.md';

  it('rejects path outside vault immediately (no DB calls)', async () => {
    const service = makeService();
    await expect(service.syncFile('/etc/passwd')).rejects.toThrow(BadRequestException);
    expect(mockUploadDocument).not.toHaveBeenCalled();
  });

  it('rejects path-traversal attack', async () => {
    const service = makeService();
    await expect(service.syncFile('docs/obsidian-vault/../../.env')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('updates lastSync to ISO timestamp after successful sync', async () => {
    const service = makeService();
    // Stub upsertFile so we skip real FS/DB calls
    priv(service).upsertFile = jest
      .fn()
      .mockResolvedValue({ documentId: 'doc-42', chunksCount: 5 });

    await service.syncFile(validRelPath);

    const { lastSync } = service.getStatus();
    expect(lastSync).not.toBe('never');
    expect(Number.isNaN(new Date(lastSync).getTime())).toBe(false);
  });

  it('returns documentId and chunksCount from upsertFile', async () => {
    const service = makeService();
    priv(service).upsertFile = jest
      .fn()
      .mockResolvedValue({ documentId: 'doc-99', chunksCount: 7 });

    const result = await service.syncFile(validRelPath);
    expect(result).toEqual({ documentId: 'doc-99', chunksCount: 7 });
  });
});

// ---------------------------------------------------------------------------
// readStoredProvider
// ---------------------------------------------------------------------------

describe('VaultSyncService.readStoredProvider', () => {
  it('returns null when no row exists', async () => {
    const service = makeService();
    mockQueryRaw.mockResolvedValue([]);
    const result = await service.readStoredProvider();
    expect(result).toBeNull();
  });

  it('returns the stored provider name when a row exists', async () => {
    const service = makeService();
    mockQueryRaw.mockResolvedValue([{ provider: 'openai' }]);
    const result = await service.readStoredProvider();
    expect(result).toBe('openai');
  });
});

// ---------------------------------------------------------------------------
// upsertStoredProvider
// ---------------------------------------------------------------------------

describe('VaultSyncService.upsertStoredProvider', () => {
  it('calls $executeRaw to insert/update the singleton row', async () => {
    const service = makeService();
    await service.upsertStoredProvider('ollama');
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// detectAndHandleProviderChange
// ---------------------------------------------------------------------------

describe('VaultSyncService.detectAndHandleProviderChange', () => {
  it('does not truncate on first boot (no stored row)', async () => {
    const service = makeService();
    // No stored row — readStoredProvider returns null
    mockQueryRaw.mockResolvedValue([]);
    process.env['EMBEDDING_PROVIDER'] = 'ollama';

    await service.detectAndHandleProviderChange();

    // TRUNCATE and DELETE should NOT have been called — only the upsert $executeRaw
    const truncateCalled = mockExecuteRaw.mock.calls.some((args) => {
      const sql = String(args[0]);
      return sql.includes('TRUNCATE');
    });
    expect(truncateCalled).toBe(false);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('does not truncate when stored provider matches active provider', async () => {
    const service = makeService();
    mockQueryRaw.mockResolvedValue([{ provider: 'ollama' }]);
    process.env['EMBEDDING_PROVIDER'] = 'ollama';

    await service.detectAndHandleProviderChange();

    const truncateCalled = mockExecuteRaw.mock.calls.some((args) => {
      const sql = String(args[0]);
      return sql.includes('TRUNCATE');
    });
    expect(truncateCalled).toBe(false);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('truncates chunks and deletes vault docs when provider changes', async () => {
    const service = makeService();
    mockQueryRaw.mockResolvedValue([{ provider: 'ollama' }]);
    process.env['EMBEDDING_PROVIDER'] = 'openai';

    await service.detectAndHandleProviderChange();

    const allSqlCalls = mockExecuteRaw.mock.calls.map((args) => String(args[0]));
    expect(allSqlCalls.some((sql) => sql.includes('TRUNCATE'))).toBe(true);
    expect(allSqlCalls.some((sql) => sql.includes('docs/obsidian-vault/%'))).toBe(true);
  });

  it('logs a warning with old → new provider names when provider changes', async () => {
    const service = makeService();
    mockQueryRaw.mockResolvedValue([{ provider: 'ollama' }]);
    process.env['EMBEDDING_PROVIDER'] = 'openai';

    await service.detectAndHandleProviderChange();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Embedding provider changed: ollama → openai; truncating chunks'),
      'VaultSyncService',
    );
  });

  it('upserts the active provider after detection logic', async () => {
    const service = makeService();
    mockQueryRaw.mockResolvedValue([]);
    process.env['EMBEDDING_PROVIDER'] = 'openai';

    await service.detectAndHandleProviderChange();

    // $executeRaw is called for the upsert
    expect(mockExecuteRaw).toHaveBeenCalled();
  });

  it('defaults to "ollama" when EMBEDDING_PROVIDER env var is absent', async () => {
    const service = makeService();
    mockQueryRaw.mockResolvedValue([]);
    delete process.env['EMBEDDING_PROVIDER'];

    // Should not throw
    await expect(service.detectAndHandleProviderChange()).resolves.toBeUndefined();
  });
});
