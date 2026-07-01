import type { SearchService, SimilaritySearchResult } from '../../search/search.service';
import {
  createRagSearchTool,
  RAG_SEARCH_TOOL_DESCRIPTION,
  RAG_SEARCH_TOOL_NAME,
} from './rag-search.tool';
import type { ToolContext } from './tool.interface';

/** Build a mocked SearchService exposing only the methods the tool consumes. */
function makeSearchService(): jest.Mocked<
  Pick<SearchService, 'similaritySearch' | 'formatContext'>
> {
  return {
    similaritySearch: jest.fn(),
    formatContext: jest.fn(),
  };
}

const ctx: ToolContext = { conversationId: 'conv-1' };

describe('createRagSearchTool', () => {
  it('exposes the stable name and a planner description', () => {
    const search = makeSearchService();
    const tool = createRagSearchTool(search as unknown as SearchService);

    expect(tool.name).toBe(RAG_SEARCH_TOOL_NAME);
    expect(tool.name).toBe('similaritySearch');
    expect(tool.description).toBe(RAG_SEARCH_TOOL_DESCRIPTION);
  });

  it('forwards the query to similaritySearch and applies formatContext', async () => {
    const search = makeSearchService();
    const chunks: SimilaritySearchResult[] = [
      { id: 'c1', content: 'alpha', title: 'Doc A', similarity: 0.9 },
    ];
    search.similaritySearch.mockResolvedValue(chunks);
    search.formatContext.mockReturnValue('Documentation context:\n[Doc A]\nalpha\n---');

    const tool = createRagSearchTool(search as unknown as SearchService);
    const observation = await tool.run('how to deploy', ctx);

    expect(search.similaritySearch).toHaveBeenCalledTimes(1);
    expect(search.similaritySearch).toHaveBeenCalledWith('how to deploy');
    expect(search.formatContext).toHaveBeenCalledTimes(1);
    expect(search.formatContext).toHaveBeenCalledWith(chunks);
    expect(observation).toBe('Documentation context:\n[Doc A]\nalpha\n---');
  });

  it('returns the formatted observation string', async () => {
    const search = makeSearchService();
    search.similaritySearch.mockResolvedValue([]);
    search.formatContext.mockReturnValue('formatted-result');

    const tool = createRagSearchTool(search as unknown as SearchService);

    await expect(tool.run('q', ctx)).resolves.toBe('formatted-result');
  });

  it('handles empty results gracefully', async () => {
    const search = makeSearchService();
    search.similaritySearch.mockResolvedValue([]);
    // SearchService.formatContext returns this sentinel for empty chunk lists.
    search.formatContext.mockReturnValue('Documentation context:');

    const tool = createRagSearchTool(search as unknown as SearchService);
    const observation = await tool.run('nothing here', ctx);

    expect(search.similaritySearch).toHaveBeenCalledWith('nothing here');
    expect(search.formatContext).toHaveBeenCalledWith([]);
    expect(observation).toBe('Documentation context:');
  });

  it('forwards filePathPrefix to similaritySearch when provided', async () => {
    const search = makeSearchService();
    const prefix = 'docs/technical/';
    search.similaritySearch.mockResolvedValue([]);
    search.formatContext.mockReturnValue('scoped-context');

    const tool = createRagSearchTool(search as unknown as SearchService, prefix);
    await tool.run('how does the API work', ctx);

    expect(search.similaritySearch).toHaveBeenCalledTimes(1);
    expect(search.similaritySearch).toHaveBeenCalledWith('how does the API work', 6, prefix);
    expect(search.formatContext).toHaveBeenCalledWith([]);
  });

  it('searches the whole index when filePathPrefix is omitted', async () => {
    const search = makeSearchService();
    search.similaritySearch.mockResolvedValue([]);
    search.formatContext.mockReturnValue('whole-index-context');

    const tool = createRagSearchTool(search as unknown as SearchService);
    await tool.run('general question', ctx);

    expect(search.similaritySearch).toHaveBeenCalledTimes(1);
    expect(search.similaritySearch).toHaveBeenCalledWith('general question');
  });
});
