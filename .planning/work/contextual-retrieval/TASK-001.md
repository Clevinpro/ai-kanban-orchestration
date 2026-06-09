---
id: TASK-001
title: Boundary-aware chunking + replace Section literal with plain heading context
status: done
priority: high
repo: be
epic: contextual-retrieval
complexity: 4
created-at: 2026-06-09T09:40:04Z
updated-at: 2026-06-09T12:53:24+03:00
started-at: 2026-06-09T12:48:44+03:00
completed-at: 2026-06-09T12:53:24+03:00
spec: .planning/work/contextual-retrieval/SPEC.md
---

## Description

Improve `DocumentService` chunking for unstructured input and remove the English `Section:` literal. When a document has no markdown headings / numbered items, block it by paragraph (`\n\n` boundaries) and pack paragraphs up to `MAX_CHUNK_SIZE` instead of treating the whole thing as one monolithic block hard-split at a character count. Replace the oversized-block split (`lastIndexOf(' ')` only) with a boundary preference cascade: paragraph → sentence (`.`/`!`/`?`/`…` + whitespace) → word → hard cut, preserving existing overlap logic. Replace the `Section: {heading}` prefix with the heading carried as plain leading context (`"{heading}\n{body}"`), no English keyword; documents with no heading are unaffected. Existing markdown structural chunking (headings, numbered lists, coalesce undersized) must keep passing its current tests — this is additive for the unstructured path.

## Acceptance Criteria

- [ ] Text with no markdown headings/numbered items is blocked by paragraph (`\n\n`), then packed up to `MAX_CHUNK_SIZE` — not one monolithic block (AC-07)
- [ ] Oversized-block split prefers boundaries paragraph → sentence → word, instead of `lastIndexOf(' ')` only; overlap preserved (AC-08)
- [ ] Existing markdown structural chunking still passes current tests — additive only (AC-09)
- [ ] `Section: {heading}` literal replaced with plain `"{heading}\n{body}"` leading context; no-heading docs unaffected (AC-11)
- [ ] `nx test ai-service` passes

## Technical Notes

- File: `apps/ai-service/src/document/document.service.ts`. Oversized split currently at ~lines 247-266 (`lastIndexOf(' ')`); `Section:` literal at the chunk-context construction site.
- Unstructured detection = no heading/numbered match across the whole doc → paragraph path.
- Keep coalesce-undersized + overlap logic intact through both paths.
- Do NOT remove `.toLowerCase()` here — that is TASK-002.
- Do NOT add contextual LLM gen here — that is TASK-003.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the working-tree changes to `document.service.ts` and `document.service.spec.ts` for contextual-retrieval TASK-001 (boundary-aware chunking + Section-literal removal, AC-07/08/09/11).

Findings: The unstructured paragraph-blocking path (`blockByParagraph`) correctly packs paragraphs up to `MAX_CHUNK_SIZE` instead of one monolithic block. The boundary cascade (`findSplitBoundary` → paragraph `\n\s*\n` → sentence `[.!?…]\s` → word → hard cut) is implemented correctly, with overlap preserved via the `end - OVERLAP` step-back logic; I traced the split loop and confirmed forward progress is guaranteed (no infinite-loop reachable since oversized blocks always exceed MAX > OVERLAP). The `Section:` literal is gone — heading is now carried as plain `"{section}\n{content}"` at the embed/store sites (lines 57, 128). `.toLowerCase()` is correctly retained (deferred to TASK-002), and no contextual LLM gen was added (deferred to TASK-003). The structured heading/numbered path is untouched and additive. The zero-length-match guard in `lastBoundaryBefore` is harmless dead code (patterns are always ≥2 chars) but not a defect. Tests cover all four ACs including sentence-boundary splitting and the absence of the `Section:` literal.

Overall quality is high; scope discipline is well observed.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

Ran `nx affected --target=test` for ai-service (changes for this task are in the working tree, scoped via --files=apps/ai-service/src/document/document.service.ts). All tests green: 19 test suites passed, 203 tests passed, 0 failures. Includes document.service.spec.ts coverage for the boundary-aware chunking (AC-07/08), additive markdown structural path (AC-09), and Section-literal removal (AC-11).

## TeamLead Check

Status: APPROVED

All acceptance criteria for this task verified against `document.service.ts`:
- AC-07 PASS — `splitIntoChunks` detects no-structure docs (`hasStructure` check) and routes to `blockByParagraph`, which packs paragraphs (split on `\n\s*\n`) up to `MAX_CHUNK_SIZE` rather than one monolithic block.
- AC-08 PASS — `findSplitBoundary` implements the paragraph → sentence (`[.!?…]\s`) → word → hard-cut cascade; overlap preserved via the `end - OVERLAP` step-back in `normalizeBlocks`.
- AC-09 PASS — structured heading/numbered path untouched; QA reports all existing markdown tests green (203 tests, 0 failures).
- AC-11 PASS — `Section:` literal removed; heading now carried as plain `"{section}\n{content}"` at embed/store sites (lines 57, 128); no-heading docs use raw content.
- Test gate PASS — `nx test ai-service` green (19 suites, 203 tests).

Scope discipline confirmed: `.toLowerCase()` retained (deferred to TASK-002) and no contextual LLM gen added (deferred to TASK-003). Out-of-scope ACs (AC-01–06, 10, 12–22) belong to later tasks and are not gated here.
