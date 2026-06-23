import type { PrismaService } from '@ai-platform/database';
import { Prisma } from '@prisma/client';
import type { Tool, ToolContext } from './tool.interface';

/**
 * Stable tool name. Used as the registry key and dispatch identifier for the
 * structured (zero-LLM) tag list/count lane.
 */
export const TAG_QUERY_TOOL_NAME = 'tagQuery';

/**
 * Planner-facing description of the direct DB tag query capability.
 */
export const TAG_QUERY_TOOL_DESCRIPTION =
  'List, count, or look up tag-shaped markers (<faq>, <note>, etc.) found in ' +
  'indexed document and chunk content. Input is a normalized intent such as ' +
  '"list" or "count", or a single tag token (<faq>) to look up which documents ' +
  'contain it (no similarity search, no LLM).';

/** Canonical PostgreSQL regex for tag-shaped opening/self-closing markers. */
const TAG_EXTRACTION_PATTERN = '<([a-z][a-z0-9-]*)/?>';

/** Matches a single self-contained tag token (`<faq>`, `<faq-item/>`). */
const SINGLE_TAG_PATTERN = /^<([a-z][a-z0-9-]*)\/?>$/i;

type TagRow = { tag_name: string };
type CountRow = { tag_count: number };
type DocRow = { title: string };

export type TagQueryIntent = 'list' | 'count' | 'lookup';

/**
 * Extract the canonical (lowercased) tag name when `input` is a single
 * self-contained tag token such as `<faq>`; returns null otherwise.
 */
export function extractTagName(input: string): string | null {
  const match = SINGLE_TAG_PATTERN.exec(input.trim());
  return match ? match[1].toLowerCase() : null;
}

/**
 * Derive list / count / lookup intent from the normalized tool input passed by
 * the router. A bare tag token (`<faq>`) means "look up this specific tag"
 * rather than "list all tags".
 */
export function parseTagQueryIntent(input: string): TagQueryIntent {
  if (extractTagName(input) !== null) {
    return 'lookup';
  }

  const normalized = input.trim().toLowerCase();

  if (
    normalized === 'count' ||
    normalized.startsWith('count ') ||
    normalized.includes('how many')
  ) {
    return 'count';
  }

  return 'list';
}

/** Format a canonical tag token from the captured name (always lowercase). */
function formatTagToken(tagName: string): string {
  return `<${tagName.toLowerCase()}>`;
}

/** Render the list observation string from distinct tag rows. */
export function formatTagListObservation(tags: TagRow[]): string {
  if (tags.length === 0) {
    return 'Tags: (none)';
  }

  const lines = tags.map((row) => formatTagToken(row.tag_name));
  return `Tags (${tags.length}):\n${lines.join('\n')}`;
}

/** Render the count observation string. */
export function formatTagCountObservation(count: number): string {
  return `Tag count: ${count}`;
}

/**
 * Render the lookup observation for a single tag: the documents whose content
 * (or any of their chunks) contains the tag. Empty rows render as "not found".
 */
export function formatTagLookupObservation(tagName: string, docs: DocRow[]): string {
  const token = formatTagToken(tagName);

  if (docs.length === 0) {
    return `${token}: not found in any document`;
  }

  const noun = docs.length === 1 ? 'document' : 'documents';
  const lines = docs.map((row) => `- ${row.title}`);
  return `${token}: found in ${docs.length} ${noun}\n${lines.join('\n')}`;
}

/**
 * Build the direct DB tag query {@link Tool}.
 *
 * Extracts tag-shaped markers from `documents.content` and `chunks.content`
 * via a parameterized Prisma raw query — no LLM, no similarity search.
 *
 * @param prismaService Database access for tag extraction queries.
 * @returns A {@link Tool} ready to register in the {@link ToolRegistry}.
 */
export function createTagQueryTool(prismaService: PrismaService): Tool {
  return {
    name: TAG_QUERY_TOOL_NAME,
    description: TAG_QUERY_TOOL_DESCRIPTION,

    async run(input: string, _ctx: ToolContext): Promise<string> {
      const intent = parseTagQueryIntent(input);

      if (intent === 'lookup') {
        // A bare tag token resolves to the distinct documents that contain it,
        // either in the document's own content or in any of its chunks. The tag
        // name is matched against the canonical extraction pattern (so casing
        // and self-closing form are normalized) and passed as a bound parameter.
        const tagName = extractTagName(input) as string;

        const rows = await prismaService.$queryRaw<DocRow[]>(
          Prisma.sql`
            WITH combined AS (
              SELECT d.id AS document_id, d.title, d.content FROM documents d
              UNION ALL
              SELECT c.document_id, d.title, c.content
              FROM chunks c
              JOIN documents d ON d.id = c.document_id
            ),
            matched AS (
              SELECT DISTINCT combined.document_id, combined.title
              FROM combined,
              LATERAL regexp_matches(combined.content, ${TAG_EXTRACTION_PATTERN}, 'gi') AS m
              WHERE lower((m)[1]) = ${tagName}
            )
            SELECT title FROM matched ORDER BY title ASC
          `,
        );

        return formatTagLookupObservation(tagName, rows);
      }

      if (intent === 'count') {
        const rows = await prismaService.$queryRaw<CountRow[]>(
          Prisma.sql`
            WITH combined AS (
              SELECT content FROM documents
              UNION ALL
              SELECT content FROM chunks
            ),
            tags AS (
              SELECT DISTINCT lower((m)[1]) AS tag_name
              FROM combined c,
              LATERAL regexp_matches(c.content, ${TAG_EXTRACTION_PATTERN}, 'gi') AS m
              WHERE (m)[1] IS NOT NULL
            )
            SELECT COUNT(*)::int AS tag_count FROM tags
          `,
        );

        const count = rows[0]?.tag_count ?? 0;
        return formatTagCountObservation(count);
      }

      const rows = await prismaService.$queryRaw<TagRow[]>(
        Prisma.sql`
          WITH combined AS (
            SELECT content FROM documents
            UNION ALL
            SELECT content FROM chunks
          ),
          tags AS (
            SELECT DISTINCT lower((m)[1]) AS tag_name
            FROM combined c,
            LATERAL regexp_matches(c.content, ${TAG_EXTRACTION_PATTERN}, 'gi') AS m
            WHERE (m)[1] IS NOT NULL
          )
          SELECT tag_name FROM tags ORDER BY tag_name ASC
        `,
      );

      return formatTagListObservation(rows);
    },
  };
}
