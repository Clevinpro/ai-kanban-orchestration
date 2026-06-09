---
id: TASK-002
title: Remove .toLowerCase() from embedding input on index + query semantic side
status: done
priority: high
repo: be
epic: contextual-retrieval
complexity: 2
created-at: 2026-06-09T09:40:04Z
updated-at: 2026-06-09T13:00:17+03:00
started-at: 2026-06-09T12:54:01+03:00
completed-at: 2026-06-09T13:00:17+03:00
spec: .planning/work/contextual-retrieval/SPEC.md
---

## Description

bge-m3 is trained on cased natural text; lowercasing both sides pushes them out of distribution and strips proper-noun / acronym / sentence-boundary signal. Remove `.toLowerCase()` from the embedding input on BOTH the index side (`document.service.ts`) and the query semantic side (`query-normalizer.ts`) in the same task — a one-sided change breaks cosine symmetry. `QueryNormalizer` keeps its NFC-normalize + trim. The lexical (trigram) path is already case-as-is and must stay unchanged.

## Acceptance Criteria

- [ ] `.toLowerCase()` removed from embedding input on the index side (`document.service.ts`) (AC-10)
- [ ] `.toLowerCase()` removed from the query semantic side (`query-normalizer.ts`) (AC-10)
- [ ] `QueryNormalizer` keeps NFC-normalize + trim; lexical path unchanged (AC-10)
- [ ] `nx test ai-service` passes

## Technical Notes

- Index lowercasing: `document.service.ts:60,131`. Query lowercasing: `search/query-normalizer.ts:19`.
- Both removals MUST land together (kept symmetric) — do not split across tasks.
- Lexical/trigram path already case-as-is; touch nothing there.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the no-lowercase change across `document.service.ts`, `query-normalizer.ts`, and `query-normalizer.spec.ts` against TASK-002. `.toLowerCase()` is absent from embedding input on both the index side (`prefixed`/`storedContent`) and the query semantic side; `QueryNormalizer` correctly keeps NFC-normalize + trim and leaves the lexical/trigram path case-as-is. Cross-checked `search.service.ts` to confirm `semantic` feeds the vector/embedding path and `lexical` feeds the trigram path, so cosine symmetry is preserved. The only remaining `.toLowerCase()` (file-extension check at `document.service.ts:427`) is unrelated and correct. Tests assert case preservation for both Latin and Cyrillic input. Change is minimal, correct, and symmetric.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported "No tasks were run" (the TASK-002 changes are in the working tree, not in the HEAD~1..HEAD commit range) — no affected tests via the commit-range diff (D-06).

Ran `nx test ai-service` directly to verify the task's required coverage: Test Suites 19 passed / 19 total, Tests 203 passed / 203 total. Includes case-preservation assertions in `query-normalizer.spec.ts` and `document.service.spec.ts`. All green.

## TeamLead Check

Status: APPROVED

All acceptance criteria for TASK-002 verified against the implementation:
- AC-10 (index side): `.toLowerCase()` removed from the embedding input in `document.service.ts`; the only remaining `toLowerCase()` is the unrelated file-extension check at line 427.
- AC-10 (query semantic side): `query-normalizer.ts` `semantic` field preserves case (NFC-normalize, angle-bracket strip, whitespace collapse, trim — no lowercasing).
- AC-10 (QueryNormalizer + lexical): `lexical` remains NFC-normalize + trim only; trigram/lexical path untouched, cosine symmetry preserved.
- Tests: `nx test ai-service` passes (19 suites / 203 tests); `query-normalizer.spec.ts` asserts case preservation for both Latin (`FAQ`) and Cyrillic (`тег FAQ`) input.
