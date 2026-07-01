import type { PrismaService } from '@ai-platform/database';
import {
  createFetchDocumentTool,
  FETCH_DOCUMENT_TOOL_DESCRIPTION,
  FETCH_DOCUMENT_TOOL_NAME,
  formatFetchObservation,
  MAX_CONTENT_CHARS,
  truncateContent,
} from './fetch-document.tool';
import type { ToolContext } from './tool.interface';

/** Build a mocked PrismaService exposing only `$queryRaw`. */
function makePrismaService(): jest.Mocked<Pick<PrismaService, '$queryRaw'>> {
  return {
    $queryRaw: jest.fn(),
  };
}

const ctx: ToolContext = { conversationId: 'conv-1' };

describe('truncateContent', () => {
  it('returns the body unchanged when within budget', () => {
    expect(truncateContent('short body')).toBe('short body');
  });

  it('truncates and appends a marker when over budget', () => {
    const long = 'x'.repeat(MAX_CONTENT_CHARS + 100);
    const result = truncateContent(long);

    expect(result.startsWith('x'.repeat(MAX_CONTENT_CHARS))).toBe(true);
    expect(result.endsWith('…(truncated)')).toBe(true);
    expect(result.length).toBe(MAX_CONTENT_CHARS + '…(truncated)'.length);
  });
});

describe('formatFetchObservation', () => {
  it('formats a not-found observation', () => {
    expect(formatFetchObservation('<faq>', [])).toBe('No document found for "<faq>".');
  });

  it('formats a single document with its body', () => {
    expect(
      formatFetchObservation('API Guide', [{ title: 'API Guide', content: 'body text' }]),
    ).toBe('Document: API Guide\n\nbody text');
  });

  it('lists candidate titles for a multi-match', () => {
    const observation = formatFetchObservation('guide', [
      { title: 'API Guide', content: 'a' },
      { title: 'User Guide', content: 'b' },
    ]);

    expect(observation).toContain('Multiple documents (2) match "guide".');
    expect(observation).toContain('- API Guide');
    expect(observation).toContain('- User Guide');
  });
});

describe('createFetchDocumentTool', () => {
  it('exposes the stable name and a planner description', () => {
    const prisma = makePrismaService();
    const tool = createFetchDocumentTool(prisma as unknown as PrismaService);

    expect(tool.name).toBe(FETCH_DOCUMENT_TOOL_NAME);
    expect(tool.name).toBe('fetchDocument');
    expect(tool.description).toBe(FETCH_DOCUMENT_TOOL_DESCRIPTION);
  });

  it('found-by-tag returns truncated content', async () => {
    const prisma = makePrismaService();
    const body = 'A'.repeat(MAX_CONTENT_CHARS + 50);
    prisma.$queryRaw.mockResolvedValue([{ title: 'FAQ Doc', content: body }]);

    const tool = createFetchDocumentTool(prisma as unknown as PrismaService);
    const observation = await tool.run('<faq>', ctx);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(observation.startsWith('Document: FAQ Doc\n\n')).toBe(true);
    expect(observation.endsWith('…(truncated)')).toBe(true);
  });

  it('found-by-title returns the body', async () => {
    const prisma = makePrismaService();
    prisma.$queryRaw.mockResolvedValue([{ title: 'Onboarding', content: 'welcome aboard' }]);

    const tool = createFetchDocumentTool(prisma as unknown as PrismaService);
    const observation = await tool.run('Onboarding', ctx);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(observation).toBe('Document: Onboarding\n\nwelcome aboard');
  });

  it('not-found returns the not-found string', async () => {
    const prisma = makePrismaService();
    prisma.$queryRaw.mockResolvedValue([]);

    const tool = createFetchDocumentTool(prisma as unknown as PrismaService);
    const observation = await tool.run('<missing>', ctx);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(observation).toBe('No document found for "<missing>".');
  });

  it('multi-match lists candidate titles', async () => {
    const prisma = makePrismaService();
    prisma.$queryRaw.mockResolvedValue([
      { title: 'API Guide', content: 'a' },
      { title: 'Onboarding', content: 'b' },
    ]);

    const tool = createFetchDocumentTool(prisma as unknown as PrismaService);
    const observation = await tool.run('<faq>', ctx);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(observation).toContain('Multiple documents (2) match "<faq>".');
    expect(observation).toContain('- API Guide');
    expect(observation).toContain('- Onboarding');
  });
});
