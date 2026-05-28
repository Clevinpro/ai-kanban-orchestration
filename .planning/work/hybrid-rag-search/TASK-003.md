---
id: TASK-003
title: Add rrfFuse pure helper to SearchService with unit tests covering tag-boost weights
status: done
priority: high
repo: be
epic: hybrid-rag-search
complexity: 4
created-at: 2026-05-28T00:00:00Z
updated-at: 2026-05-28T00:00:00Z
started-at: 2026-05-28T00:00:00Z
completed-at: 2026-05-28T21:44:12+03:00
spec: .planning/work/hybrid-rag-search/SPEC.md
---

## Description

Add a pure `rrfFuse` helper that combines vector and lexical ranked result lists into a single fused list ordered by Reciprocal Rank Fusion. The fuser must accept per-ranker weights so that tag-style queries can boost lexical contribution 2×. Output items carry per-ranker scores plus the final RRF score to enable observability. Implement as a private method on `SearchService` (or co-located helper in `search/`) and cover with unit tests.

## Acceptance Criteria

- [ ] `rrfFuse` accepts two arrays `vectorRows` and `lexicalRows`, each of type `{ id, content, title, similarity }[]`, plus options `{ k: number; wVector: number; wLexical: number }`
- [ ] Returns `SimilaritySearchResult[]` sorted by descending RRF score; stable tiebreaker is `id` ascending
- [ ] Score formula: `score(doc) = wVector * 1/(k + vectorRank) + wLexical * 1/(k + lexicalRank)` where `rank` starts at 1; absent rankers contribute 0
- [ ] Function is pure — no `this`, no I/O, no logging
- [ ] Spec file covers: (a) doc appearing in both lists ranks above doc appearing in one, (b) `wLexical=2.0` flips ordering when lexical ranks high but vector ranks low, (c) docs absent from both inputs are not emitted, (d) tiebreaker on equal score resolves to `id` ascending
- [ ] All four spec cases pass under `nx test ai-service`

## Technical Notes

- Implementation hint per SPEC § Reciprocal Rank Fusion: build a `Map<id, { vectorRank?, lexicalRank?, row }>` by iterating both lists once, then compute the fused score per entry
- Returned row's `similarity` field must be the final RRF score (not the vector cosine) — call sites already treat it as an opaque relevance score
- `k = 60` is the canonical RRF constant; do not change the default
- Co-locate helper in `ai-platform/apps/ai-service/src/search/rrf.ts` if it grows beyond a 30-line private method
- Reference SPEC AC-05

---REVIEW-BLOCK-START---
Signal: APPROVED
Findings:
- `/Users/tarasbannyi/TestAI/ai-agent-microservices/ai-platform/apps/ai-service/src/search/rrf.spec.ts:90-108` — In the first `it` block of case (d), `result` is computed (bravo rank 1, alpha rank 2 — actually different scores, not a tie) but never asserted. The tiebreaker assertion uses `result2` instead. The variable `result` is dead code inside the test. Severity: WARNING (readability/dead code, does not affect test correctness or coverage).
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected` found no affected projects (implementation files are untracked/uncommitted). Direct run of `nx test ai-service` executed all 4 test suites (including `rrf.spec.ts` and `query-normalizer.spec.ts`) with 37 tests — all passed in 0.556 s.

## TeamLead Check

Status: APPROVED

All acceptance criteria verified:
- AC-1 PASS: `rrfFuse` in `/ai-platform/apps/ai-service/src/search/rrf.ts` accepts `vectorRows: SimilaritySearchResult[]`, `lexicalRows: SimilaritySearchResult[]`, and `options: RrfOptions { k, wVector, wLexical }` — exact signature match.
- AC-2 PASS: Returns `SimilaritySearchResult[]` sorted descending by RRF score; tiebreaker is string comparison on `id` ascending (lines 78–84 of `rrf.ts`).
- AC-3 PASS: Score formula `wVector * 1/(k + vectorRank) + wLexical * 1/(k + lexicalRank)` implemented correctly with 1-based ranks; absent rankers contribute 0.
- AC-4 PASS: `rrfFuse` is a standalone exported function — no `this`, no I/O, no logger dependency.
- AC-5 PASS: All four spec cases covered in `rrf.spec.ts`: (a) dual-presence rank advantage, (b) wLexical=2.0 flip, (c) absent-from-both not emitted (including empty-input case), (d) id-ascending tiebreaker. Code reviewer dead-code warning on unused `result` variable is readability-only and does not affect correctness.
- AC-6 PASS: QA confirmed all 37 tests pass under `nx test ai-service` in 0.556 s.
