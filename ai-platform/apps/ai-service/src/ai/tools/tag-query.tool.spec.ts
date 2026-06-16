import type { PrismaService } from '@ai-platform/database';
import {
  createTagQueryTool,
  extractTagName,
  formatTagCountObservation,
  formatTagListObservation,
  formatTagLookupObservation,
  parseTagQueryIntent,
  TAG_QUERY_TOOL_DESCRIPTION,
  TAG_QUERY_TOOL_NAME,
} from './tag-query.tool';
import type { ToolContext } from './tool.interface';

/** Build a mocked PrismaService exposing only `$queryRaw`. */
function makePrismaService(): jest.Mocked<Pick<PrismaService, '$queryRaw'>> {
  return {
    $queryRaw: jest.fn(),
  };
}

const ctx: ToolContext = { conversationId: 'conv-1' };

describe('parseTagQueryIntent', () => {
  it('returns count for count keywords', () => {
    expect(parseTagQueryIntent('count')).toBe('count');
    expect(parseTagQueryIntent('count tags')).toBe('count');
    expect(parseTagQueryIntent('how many tags')).toBe('count');
  });

  it('returns list for list keywords', () => {
    expect(parseTagQueryIntent('list')).toBe('list');
    expect(parseTagQueryIntent('list all tags')).toBe('list');
  });

  it('returns lookup for a bare tag token', () => {
    expect(parseTagQueryIntent('<faq>')).toBe('lookup');
    expect(parseTagQueryIntent('<FAQ>')).toBe('lookup');
    expect(parseTagQueryIntent('  <faq-item/>  ')).toBe('lookup');
  });
});

describe('extractTagName', () => {
  it('extracts and lowercases a single tag token', () => {
    expect(extractTagName('<faq>')).toBe('faq');
    expect(extractTagName('<FAQ>')).toBe('faq');
    expect(extractTagName('  <faq-item/>  ')).toBe('faq-item');
  });

  it('returns null for non-tag or surrounded input', () => {
    expect(extractTagName('faq')).toBeNull();
    expect(extractTagName('show me <faq>')).toBeNull();
    expect(extractTagName('</faq>')).toBeNull();
    expect(extractTagName('list all tags')).toBeNull();
  });
});

describe('formatTagListObservation', () => {
  it('formats an empty tag set', () => {
    expect(formatTagListObservation([])).toBe('Tags: (none)');
  });

  it('formats a sorted tag list with count header', () => {
    const observation = formatTagListObservation([
      { tag_name: 'faq' },
      { tag_name: 'note' },
    ]);

    expect(observation).toBe('Tags (2):\n<faq>\n<note>');
  });
});

describe('formatTagCountObservation', () => {
  it('formats the tag count', () => {
    expect(formatTagCountObservation(3)).toBe('Tag count: 3');
    expect(formatTagCountObservation(0)).toBe('Tag count: 0');
  });
});

describe('formatTagLookupObservation', () => {
  it('formats a not-found lookup', () => {
    expect(formatTagLookupObservation('faq', [])).toBe('<faq>: not found in any document');
  });

  it('formats a single-document lookup', () => {
    expect(formatTagLookupObservation('faq', [{ title: 'API Guide' }])).toBe(
      '<faq>: found in 1 document\n- API Guide',
    );
  });

  it('formats a multi-document lookup', () => {
    const observation = formatTagLookupObservation('note', [
      { title: 'API Guide' },
      { title: 'Onboarding' },
    ]);

    expect(observation).toBe('<note>: found in 2 documents\n- API Guide\n- Onboarding');
  });
});

describe('createTagQueryTool', () => {
  it('exposes the stable name and a planner description', () => {
    const prisma = makePrismaService();
    const tool = createTagQueryTool(prisma as unknown as PrismaService);

    expect(tool.name).toBe(TAG_QUERY_TOOL_NAME);
    expect(tool.name).toBe('tagQuery');
    expect(tool.description).toBe(TAG_QUERY_TOOL_DESCRIPTION);
  });

  it('lists tags from the DB and returns a formatted observation', async () => {
    const prisma = makePrismaService();
    prisma.$queryRaw.mockResolvedValue([{ tag_name: 'faq' }, { tag_name: 'note' }]);

    const tool = createTagQueryTool(prisma as unknown as PrismaService);
    const observation = await tool.run('list all tags', ctx);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(observation).toBe('Tags (2):\n<faq>\n<note>');
  });

  it('returns an empty-list observation when no tags exist', async () => {
    const prisma = makePrismaService();
    prisma.$queryRaw.mockResolvedValue([]);

    const tool = createTagQueryTool(prisma as unknown as PrismaService);
    const observation = await tool.run('list', ctx);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(observation).toBe('Tags: (none)');
  });

  it('counts tags from the DB and returns a formatted observation', async () => {
    const prisma = makePrismaService();
    prisma.$queryRaw.mockResolvedValue([{ tag_count: 4 }]);

    const tool = createTagQueryTool(prisma as unknown as PrismaService);
    const observation = await tool.run('count tags', ctx);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(observation).toBe('Tag count: 4');
  });

  it('returns zero when the count query yields no row', async () => {
    const prisma = makePrismaService();
    prisma.$queryRaw.mockResolvedValue([]);

    const tool = createTagQueryTool(prisma as unknown as PrismaService);
    const observation = await tool.run('count', ctx);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(observation).toBe('Tag count: 0');
  });

  it('looks up the documents that contain a bare tag token', async () => {
    const prisma = makePrismaService();
    prisma.$queryRaw.mockResolvedValue([{ title: 'API Guide' }, { title: 'Onboarding' }]);

    const tool = createTagQueryTool(prisma as unknown as PrismaService);
    const observation = await tool.run('<faq>', ctx);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(observation).toBe('<faq>: found in 2 documents\n- API Guide\n- Onboarding');
  });

  it('returns a not-found observation when the tag is absent', async () => {
    const prisma = makePrismaService();
    prisma.$queryRaw.mockResolvedValue([]);

    const tool = createTagQueryTool(prisma as unknown as PrismaService);
    const observation = await tool.run('<missing>', ctx);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(observation).toBe('<missing>: not found in any document');
  });
});
