import { rrfFuse } from './rrf';
import type { SimilaritySearchResult } from './search.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(id: string): SimilaritySearchResult {
  return { id, content: `content-${id}`, title: `title-${id}`, similarity: 0 };
}

const DEFAULT_OPTS = { k: 60, wVector: 1.0, wLexical: 1.0 };

// ---------------------------------------------------------------------------
// (a) Doc appearing in both lists ranks above doc appearing in one list
// ---------------------------------------------------------------------------

describe('rrfFuse — (a) dual presence ranks higher than single presence', () => {
  it('places the doc that appears in both rankers above a doc that appears in only one', () => {
    // "both" appears at rank 1 in vector and rank 1 in lexical.
    // "vectorOnly" appears at rank 2 in vector only.
    const vectorRows = [makeRow('both'), makeRow('vectorOnly')];
    const lexicalRows = [makeRow('both')];

    const result = rrfFuse(vectorRows, lexicalRows, DEFAULT_OPTS);

    expect(result[0].id).toBe('both');
    expect(result[1].id).toBe('vectorOnly');

    // Score check: "both" = 1/(61) + 1/(61) ≈ 0.03279
    //              "vectorOnly" = 1/(62) ≈ 0.01613
    expect(result[0].similarity).toBeGreaterThan(result[1].similarity);
  });
});

// ---------------------------------------------------------------------------
// (b) wLexical=2.0 flips ordering when lexical ranks high but vector ranks low
// ---------------------------------------------------------------------------

describe('rrfFuse — (b) lexical weight=2 flips ordering', () => {
  it('promotes the lexically-top-ranked doc above the vector-top-ranked doc', () => {
    // "lexicalWinner": rank 1 in lexical, absent from vector.
    // "vectorWinner":  rank 1 in vector, absent from lexical.
    //
    // Default weights (1/1): vectorWinner = 1/61 ≈ 0.01639
    //                         lexicalWinner = 1/61 ≈ 0.01639  (tie)
    //
    // With wLexical=2.0:      vectorWinner  = 1.0 * 1/61 ≈ 0.01639
    //                         lexicalWinner = 2.0 * 1/61 ≈ 0.03279  (wins)
    const vectorRows = [makeRow('vectorWinner')];
    const lexicalRows = [makeRow('lexicalWinner')];

    const result = rrfFuse(vectorRows, lexicalRows, { k: 60, wVector: 1.0, wLexical: 2.0 });

    expect(result[0].id).toBe('lexicalWinner');
    expect(result[1].id).toBe('vectorWinner');
    expect(result[0].similarity).toBeGreaterThan(result[1].similarity);
  });
});

// ---------------------------------------------------------------------------
// (c) Docs absent from both inputs are not emitted
// ---------------------------------------------------------------------------

describe('rrfFuse — (c) docs absent from both inputs are not emitted', () => {
  it('returns only docs that appear in at least one input list', () => {
    const vectorRows = [makeRow('a')];
    const lexicalRows = [makeRow('b')];

    const result = rrfFuse(vectorRows, lexicalRows, DEFAULT_OPTS);
    const ids = result.map((r) => r.id);

    expect(ids).toContain('a');
    expect(ids).toContain('b');
    // No phantom entries
    expect(result).toHaveLength(2);
  });

  it('returns an empty array when both inputs are empty', () => {
    const result = rrfFuse([], [], DEFAULT_OPTS);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// (d) Tiebreaker on equal score resolves to id ascending
// ---------------------------------------------------------------------------

describe('rrfFuse — (d) equal-score tiebreaker is id ascending', () => {
  it('sorts by id ascending when two docs have the same RRF score', () => {
    // "bravo" and "alpha" both appear only in vector at the same rank → same score.
    const vectorRows = [makeRow('bravo'), makeRow('alpha')];
    const lexicalRows: SimilaritySearchResult[] = [];

    const _result = rrfFuse(vectorRows, lexicalRows, DEFAULT_OPTS);

    // "alpha" < "bravo" lexicographically → should appear first on tie
    // Note: "bravo" is rank 1, "alpha" is rank 2, so bravo has higher score.
    // To create a true tie, place them in separate rankers at the same rank.
    const vectorRows2: SimilaritySearchResult[] = [makeRow('bravo')];
    const lexicalRows2: SimilaritySearchResult[] = [makeRow('alpha')];

    const result2 = rrfFuse(vectorRows2, lexicalRows2, DEFAULT_OPTS);
    // Both at rank 1 in their own ranker with equal weights → same score.
    expect(result2[0].similarity).toBeCloseTo(result2[1].similarity, 10);
    expect(result2[0].id).toBe('alpha');
    expect(result2[1].id).toBe('bravo');
  });

  it('breaks ties with multiple docs by id ascending', () => {
    // Give 'charlie', 'beta', and 'alpha' identical scores by placing each doc at
    // rank 1 in vector and rank 1 in lexical (each doc only appears in its own
    // individual pair of single-element lists, but we can't call rrfFuse three
    // times). Instead, interleave them symmetrically:
    //
    //   vectorRows:  [ charlie(1), beta(2), alpha(3) ]
    //   lexicalRows: [ alpha(1),   beta(2), charlie(3) ]
    //
    // Score formula:
    //   charlie = 1/(k+1) + 1/(k+3)
    //   beta    = 1/(k+2) + 1/(k+2)
    //   alpha   = 1/(k+3) + 1/(k+1)
    //
    // charlie = alpha (symmetric), beta = 2/(k+2).
    // k=60 → charlie=alpha = 1/61+1/63 ≈ 0.03221; beta = 2/62 ≈ 0.03226.
    //
    // charlie and alpha have exactly the same score → tiebreaker by id: alpha < charlie.

    const vectorRows: SimilaritySearchResult[] = [
      makeRow('charlie'),
      makeRow('beta'),
      makeRow('alpha'),
    ];
    const lexicalRows: SimilaritySearchResult[] = [
      makeRow('alpha'),
      makeRow('beta'),
      makeRow('charlie'),
    ];

    const result = rrfFuse(vectorRows, lexicalRows, DEFAULT_OPTS);

    // Score check (k=60):
    //   charlie = 1/(61) + 1/(63) ≈ 0.032266  (rank 1 vector, rank 3 lexical)
    //   beta    = 1/(62) + 1/(62) ≈ 0.032258  (rank 2 both)
    //   alpha   = 1/(63) + 1/(61) ≈ 0.032266  (rank 3 vector, rank 1 lexical)
    //
    // alpha and charlie share the highest score; tiebreaker id ascending → alpha first.
    // beta has a slightly lower score.
    expect(result[0].similarity).toBeCloseTo(result[1].similarity, 10); // alpha ≈ charlie
    expect(result[0].id).toBe('alpha');
    expect(result[1].id).toBe('charlie');
    expect(result[2].id).toBe('beta');
    expect(result[0].similarity).toBeGreaterThan(result[2].similarity);
  });
});

// ---------------------------------------------------------------------------
// Score formula verification
// ---------------------------------------------------------------------------

describe('rrfFuse — score formula', () => {
  it('computes the correct RRF score for a doc in both lists at rank 1', () => {
    const vectorRows = [makeRow('doc1')];
    const lexicalRows = [makeRow('doc1')];

    const result = rrfFuse(vectorRows, lexicalRows, { k: 60, wVector: 1.0, wLexical: 1.0 });

    // Expected: 1/61 + 1/61 = 2/61
    const expected = 2 / 61;
    expect(result[0].similarity).toBeCloseTo(expected, 10);
  });

  it('uses the similarity field of returned rows as the RRF score, not the input similarity', () => {
    const row = { id: 'x', content: 'c', title: 't', similarity: 0.99 };
    const result = rrfFuse([row], [], { k: 60, wVector: 1.0, wLexical: 1.0 });

    // Input similarity (0.99) must be replaced by the RRF score.
    expect(result[0].similarity).not.toBe(0.99);
    expect(result[0].similarity).toBeCloseTo(1 / 61, 10);
  });
});
