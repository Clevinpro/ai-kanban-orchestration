import type { SimilaritySearchResult } from './search.service';

export interface RrfOptions {
  /** Reciprocal Rank Fusion constant. Canonical value is 60. */
  k: number;
  /** Weight applied to the vector ranker contribution. */
  wVector: number;
  /** Weight applied to the lexical ranker contribution. */
  wLexical: number;
}

interface RrfEntry {
  row: SimilaritySearchResult;
  vectorRank?: number;
  lexicalRank?: number;
}

/**
 * Pure Reciprocal Rank Fusion helper.
 *
 * Combines two ranked result lists (vector and lexical) into a single fused
 * list ordered by descending RRF score.
 *
 * Score formula per document:
 *   score = wVector * 1/(k + vectorRank) + wLexical * 1/(k + lexicalRank)
 *
 * Ranks are 1-based. A document absent from a ranker contributes 0 for that
 * ranker. Tiebreaker: `id` ascending (stable sort).
 *
 * The returned `similarity` field holds the final RRF score so that call sites
 * treat it as an opaque relevance score.
 *
 * @param vectorRows  Top results from the vector (embedding cosine) ranker.
 * @param lexicalRows Top results from the lexical (trigram/FTS) ranker.
 * @param options     RRF tuning parameters.
 * @returns           Fused list sorted by descending RRF score.
 */
export function rrfFuse(
  vectorRows: SimilaritySearchResult[],
  lexicalRows: SimilaritySearchResult[],
  options: RrfOptions,
): SimilaritySearchResult[] {
  const { k, wVector, wLexical } = options;

  const map = new Map<string, RrfEntry>();

  for (let i = 0; i < vectorRows.length; i++) {
    const row = vectorRows[i];
    map.set(row.id, { row, vectorRank: i + 1 });
  }

  for (let i = 0; i < lexicalRows.length; i++) {
    const row = lexicalRows[i];
    const existing = map.get(row.id);
    if (existing) {
      existing.lexicalRank = i + 1;
    } else {
      map.set(row.id, { row, lexicalRank: i + 1 });
    }
  }

  const fused: SimilaritySearchResult[] = [];

  for (const { row, vectorRank, lexicalRank } of map.values()) {
    const vectorContribution = vectorRank !== undefined ? wVector * (1 / (k + vectorRank)) : 0;
    const lexicalContribution = lexicalRank !== undefined ? wLexical * (1 / (k + lexicalRank)) : 0;
    const rrfScore = vectorContribution + lexicalContribution;

    fused.push({
      id: row.id,
      content: row.content,
      title: row.title,
      similarity: rrfScore,
    });
  }

  fused.sort((a, b) => {
    if (b.similarity !== a.similarity) {
      return b.similarity - a.similarity;
    }
    // Stable tiebreaker: id ascending
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return fused;
}
