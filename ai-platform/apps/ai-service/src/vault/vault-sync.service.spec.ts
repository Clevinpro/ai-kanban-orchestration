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
} as never;

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
  mockUploadDocument.mockResolvedValue({ documentId: 'doc-1', chunksCount: 3 });
  mockQueryRaw.mockResolvedValue([]);
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
