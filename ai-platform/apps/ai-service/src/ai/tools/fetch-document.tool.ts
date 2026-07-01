import type { PrismaService } from '@ai-platform/database';
import { Prisma } from '@prisma/client';
import { extractTagName, TAG_EXTRACTION_PATTERN } from './tag-query.tool';
import type { Tool, ToolContext } from './tool.interface';

/**
 * Stable tool name. Used as the registry key and dispatch identifier for the
 * document-content fetch capability.
 */
export const FETCH_DOCUMENT_TOOL_NAME = 'fetchDocument';

/**
 * Planner-facing description. Steers the planner to call `fetchDocument` after a
 * `tagQuery` (or any reference to a known document) to retrieve the actual body
 * text, and to pass a tag token directly when the user names a tag.
 */
export const FETCH_DOCUMENT_TOOL_DESCRIPTION =
  'Fetch the actual content (body text) of an indexed document. Input is EITHER ' +
  'a single tag token (<faq>) — returns the content of the document(s) containing ' +
  'that tag — OR a document title (returns that document body). Use this AFTER a ' +
  'tagQuery (or whenever the user asks for the contents/description of a document ' +
  'you only know by title or tag) to read the full text before answering. Returns ' +
  'a bounded, possibly truncated excerpt; if several documents match it lists their ' +
  'titles so you can pick one and call fetchDocument again with that title.';

/**
 * Maximum number of content characters returned in a single observation. Kept
 * well under the planner/answer token budget (PLANNER_MAX_TOKENS=512,
 * ANSWER_MAX_TOKENS=2048 in `ai.service.ts`) so a fetched body cannot overflow
 * the context handed back to the model. ~6000 chars ≈ 1500 tokens.
 */
export const MAX_CONTENT_CHARS = 6000;

/**
 * Maximum number of candidate documents resolved for a single fetch. When more
 * than one document matches, the tool lists their titles instead of dumping
 * every body, so the model can disambiguate by re-calling with a title.
 */
export const MAX_CANDIDATES = 10;

/** Marker appended when a document body is truncated to {@link MAX_CONTENT_CHARS}. */
const TRUNCATION_MARKER = '…(truncated)';

/** A matched document: title plus its (full) body content. */
type DocContentRow = { title: string; content: string };

/**
 * Truncate `content` to {@link MAX_CONTENT_CHARS}, appending an explicit marker
 * when the body was cut so the model knows the excerpt is partial.
 */
export function truncateContent(content: string): string {
  if (content.length <= MAX_CONTENT_CHARS) {
    return content;
  }

  return `${content.slice(0, MAX_CONTENT_CHARS)}${TRUNCATION_MARKER}`;
}

/**
 * Render the observation for a fetch.
 *
 * - Zero matches → a clear, non-throwing "not found" line.
 * - Exactly one match → the document title plus its truncated body.
 * - More than one match → a candidate title list for the model to pick from.
 */
export function formatFetchObservation(query: string, rows: DocContentRow[]): string {
  if (rows.length === 0) {
    return `No document found for "${query}".`;
  }

  if (rows.length === 1) {
    const [doc] = rows;
    return `Document: ${doc.title}\n\n${truncateContent(doc.content)}`;
  }

  const lines = rows.map((row) => `- ${row.title}`);
  return (
    `Multiple documents (${rows.length}) match "${query}". ` +
    `Call fetchDocument again with one of these exact titles:\n${lines.join('\n')}`
  );
}

/**
 * Build the document-content fetch {@link Tool}.
 *
 * Resolves input two ways:
 * - A single tag token (`<faq>`) → the content of every document containing that
 *   tag, using the same `documents`/`chunks` UNION + `regexp_matches` predicate as
 *   `tag-query.tool.ts`, but projecting the document body.
 * - Otherwise the input is treated as a title and matched with `ILIKE`.
 *
 * Bodies are truncated to a bounded budget; not-found and multi-match cases
 * return non-throwing observation strings.
 *
 * @param prismaService Database access for the content lookup queries.
 * @returns A {@link Tool} ready to register in the {@link ToolRegistry}.
 */
export function createFetchDocumentTool(prismaService: PrismaService): Tool {
  return {
    name: FETCH_DOCUMENT_TOOL_NAME,
    description: FETCH_DOCUMENT_TOOL_DESCRIPTION,

    async run(input: string, _ctx: ToolContext): Promise<string> {
      const query = input.trim();
      const tagName = extractTagName(query);

      if (tagName !== null) {
        // Tag → content: find the distinct documents whose body or any chunk
        // contains the tag, then return each matched document's own body. The
        // tag name is matched against the canonical extraction pattern (casing
        // and self-closing form normalized) and passed as a bound parameter.
        const rows = await prismaService.$queryRaw<DocContentRow[]>(
          Prisma.sql`
            WITH combined AS (
              SELECT d.id AS document_id, d.content FROM documents d
              UNION ALL
              SELECT c.document_id, c.content
              FROM chunks c
              JOIN documents d ON d.id = c.document_id
            ),
            matched AS (
              SELECT DISTINCT combined.document_id
              FROM combined,
              LATERAL regexp_matches(combined.content, ${TAG_EXTRACTION_PATTERN}, 'gi') AS m
              WHERE lower((m)[1]) = ${tagName}
            )
            SELECT d.title, d.content
            FROM documents d
            JOIN matched ON matched.document_id = d.id
            ORDER BY d.title ASC
            LIMIT ${MAX_CANDIDATES}
          `,
        );

        return formatFetchObservation(query, rows);
      }

      // Title → content: case-insensitive substring match on the document title.
      const pattern = `%${query}%`;
      const rows = await prismaService.$queryRaw<DocContentRow[]>(
        Prisma.sql`
          SELECT title, content
          FROM documents
          WHERE title ILIKE ${pattern}
          ORDER BY title ASC
          LIMIT ${MAX_CANDIDATES}
        `,
      );

      return formatFetchObservation(query, rows);
    },
  };
}
