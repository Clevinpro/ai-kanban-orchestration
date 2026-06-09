/**
 * QueryNormalizer — pure static utility for normalizing raw user queries
 * into a { semantic, lexical } pair used by the hybrid search pipeline.
 *
 * No DI, no NestJS decorators. Intentionally framework-free.
 */
export class QueryNormalizer {
  /**
   * Produce a normalized query pair from a raw user string.
   *
   * - `lexical`  — NFC-normalized and trimmed only; preserves angle brackets
   *                and punctuation for lexical/trigram search.
   * - `semantic` — Case preserved (bge-m3 is cased); angle brackets replaced
   *                with spaces, and consecutive whitespace collapsed; used for
   *                embedding.
   */
  static normalize(raw: string): { semantic: string; lexical: string } {
    const lexical = raw.normalize('NFC').trim();
    const semantic = lexical
      .replace(/[<>]/g, ' ') // strip angle brackets
      .replace(/\s+/g, ' ')
      .trim();
    return { semantic, lexical };
  }

  /**
   * Return true when `raw` is a single self-contained tag-shaped query such
   * as `<faq>`, `<FAQ>`, or `<faq-item/>`.
   *
   * Closing tags (`</faq>`) and queries with surrounding text do NOT match.
   * Regex: /^<[a-z][a-z0-9-]*\/?>$/i
   */
  static isTagQuery(raw: string): boolean {
    return /^<[a-z][a-z0-9-]*\/?>$/i.test(raw.trim());
  }
}
