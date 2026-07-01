import type { PrismaService } from '@ai-platform/database';
import { createFetchDocumentTool, FETCH_DOCUMENT_TOOL_NAME } from './fetch-document.tool';
import { createTagQueryTool, TAG_QUERY_TOOL_NAME } from './tag-query.tool';
import { RAG_SEARCH_TOOL_NAME, createRagSearchTool } from './rag-search.tool';
import type { SearchService } from '../../search/search.service';
import { ToolRegistry } from './tool-registry';
import type { ToolContext } from './tool.interface';

/**
 * Integration coverage for the `fetchDocument` tool wired through the
 * {@link ToolRegistry} the same way `ai.module.ts` builds it. This exercises the
 * observable agent-loop surface end to end at the registry seam: the loop
 * resolves tools by name from the registry and dispatches `run`, so this proves
 * the planner can actually reach `fetchDocument` and get a content observation
 * back. The deeper provider-driven chained flow (tagQuery → fetchDocument →
 * answer) is owned by TASK-003.
 */
describe('fetchDocument registry wiring (integration)', () => {
  const ctx: ToolContext = { conversationId: 'conv-1' };

  /** Build the registry exactly as `ai.module.ts`'s ToolRegistry factory does. */
  function buildRegistry(prisma: Pick<PrismaService, '$queryRaw'>): ToolRegistry {
    const searchService = {
      similaritySearch: jest.fn().mockResolvedValue([]),
      formatContext: jest.fn().mockReturnValue('(no context)'),
    } as unknown as SearchService;

    const registry = new ToolRegistry();
    registry.register(createRagSearchTool(searchService));
    registry.register(createTagQueryTool(prisma as unknown as PrismaService));
    registry.register(createFetchDocumentTool(prisma as unknown as PrismaService));
    return registry;
  }

  it('registers fetchDocument alongside similaritySearch and tagQuery', () => {
    const prisma = { $queryRaw: jest.fn() };
    const registry = buildRegistry(prisma);

    expect(registry.get(RAG_SEARCH_TOOL_NAME)).toBeDefined();
    expect(registry.get(TAG_QUERY_TOOL_NAME)).toBeDefined();
    expect(registry.get(FETCH_DOCUMENT_TOOL_NAME)).toBeDefined();

    // The planner enumerates the registry via describe(); fetchDocument must
    // appear so the model can choose it.
    expect(registry.describe()).toContain(`${FETCH_DOCUMENT_TOOL_NAME}:`);
  });

  it('dispatches a fetchDocument call by name and returns the document body', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ title: 'FAQ Doc', content: 'the answer to everything' }]),
    };
    const registry = buildRegistry(prisma);

    const tool = registry.get(FETCH_DOCUMENT_TOOL_NAME);
    expect(tool).toBeDefined();

    const observation = await (tool as NonNullable<typeof tool>).run('<faq>', ctx);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(observation).toBe('Document: FAQ Doc\n\nthe answer to everything');
  });

  it('dispatches a title-based fetchDocument call by name', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ title: 'Onboarding', content: 'welcome' }]),
    };
    const registry = buildRegistry(prisma);

    const tool = registry.get(FETCH_DOCUMENT_TOOL_NAME);
    const observation = await (tool as NonNullable<typeof tool>).run('Onboarding', ctx);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(observation).toBe('Document: Onboarding\n\nwelcome');
  });
});
