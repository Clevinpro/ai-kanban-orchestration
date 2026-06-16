import type { SearchService } from '../../search/search.service';
import type { Tool, ToolContext } from './tool.interface';

/**
 * Stable tool name. Kept identical to the identifier the agent loop currently
 * emits on its `tool` field so the streamed event shape stays stable for the FE.
 */
export const RAG_SEARCH_TOOL_NAME = 'similaritySearch';

/**
 * Planner-facing description of the RAG search capability.
 */
export const RAG_SEARCH_TOOL_DESCRIPTION =
  'Search the indexed documentation via hybrid (vector + lexical) similarity ' +
  'and return the most relevant chunks as a formatted context block. Input is ' +
  'a natural-language search query.';

/**
 * Build the RAG (retrieval-augmented generation) search {@link Tool}.
 *
 * Wraps {@link SearchService.similaritySearch} + {@link SearchService.formatContext}
 * behind the {@link Tool} contract so the agent loop dispatches it through the
 * {@link ToolRegistry} instead of a hardcoded branch. The behaviour mirrors the
 * existing loop exactly: run the query, format the resulting chunks, return the
 * observation string.
 *
 * @param searchService The search service providing similarity search + context
 *   formatting. Injected as a closure dependency — the tool performs no direct
 *   DB access of its own.
 * @param filePathPrefix Optional document path prefix to scope retrieval to a
 *   subset of the index (e.g. technical docs only). When omitted, the whole
 *   index is searched.
 * @returns A {@link Tool} ready to register in the {@link ToolRegistry}.
 */
export function createRagSearchTool(
  searchService: SearchService,
  filePathPrefix?: string,
): Tool {
  return {
    name: RAG_SEARCH_TOOL_NAME,
    description: RAG_SEARCH_TOOL_DESCRIPTION,

    async run(input: string, _ctx: ToolContext): Promise<string> {
      const chunks =
        filePathPrefix !== undefined
          ? await searchService.similaritySearch(input, 6, filePathPrefix)
          : await searchService.similaritySearch(input);
      return searchService.formatContext(chunks);
    },
  };
}
