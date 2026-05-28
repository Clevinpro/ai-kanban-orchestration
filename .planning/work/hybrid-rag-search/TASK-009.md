---
id: TASK-009
title: Update document.service.spec.ts to cover markdown chunker boundary behaviour
status: done
priority: medium
repo: be
epic: hybrid-rag-search
complexity: 3
created-at: 2026-05-28T00:00:00Z
updated-at: 2026-05-28T00:00:00Z
spec: .planning/work/hybrid-rag-search/SPEC.md
---

## Description

Add or update the test spec for `DocumentService.splitIntoChunks` to verify the markdown-aware splitter from TASK-007. Cases must exercise heading boundaries, numbered-list boundaries, oversize splitting, undersize coalescing, empty input, and the `{ content, section }` return shape.

## Acceptance Criteria

- [ ] Spec file present at `apps/ai-service/src/document/document.service.spec.ts` (create if absent; extend if already present)
- [ ] Test: a doc with three `^##` headings produces ≥ 3 chunks, each with the matching `section` field
- [ ] Test: a doc with numbered list `1. <faq>\n…\n2. <table>\n…` produces ≥ 2 chunks whose `content` starts with the numbered-list lines and whose `section` equals the first line of the block
- [ ] Test: a 3000-char paragraph under a single heading produces ≥ 3 chunks each ≤ 1200 chars; consecutive chunks overlap by ~100 chars at a whitespace boundary
- [ ] Test: a doc of 200 tiny lines coalesces into chunks ≤ 1200 chars (no chunk under ~300 chars unless it is the final remainder)
- [ ] Test: `splitIntoChunks('')` returns `[]`
- [ ] Test: every returned chunk has a non-empty `content` (no whitespace-only chunks)
- [ ] `nx test ai-service` passes — all spec cases above succeed

## Technical Notes

- Existing spec example: `apps/ai-service/src/vault/vault-sync.service.spec.ts` shows the project's Jest + NestJS testing-module pattern; `DocumentService` does not require a TestingModule because `splitIntoChunks` is a synchronous instance method — instantiate the service directly with stub deps (`new DocumentService(stubEmbeddings, stubPrisma, stubLogger)`)
- For stubs, cast `{}` to the expected type — `splitIntoChunks` does not touch the injected deps
- Use `it.each` for parameterized boundary cases where it improves readability
- Reference SPEC § Markdown-Aware Chunking and AC-03, AC-12

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

**Issues:**
- None

The spec file correctly covers all seven acceptance criteria from TASK-009: empty string returns `[]`, whitespace-only returns `[]`, three-heading doc produces ≥3 chunks with matching `section` fields, numbered-list boundaries produce the right `content` and `section` values, a 3000-char paragraph splits into ≥3 chunks each ≤1200 chars with overlap detection, 200 tiny lines coalesce into ≤1200-char chunks with no under-300-char chunks except the final remainder, and every returned chunk has non-empty `string` content and `string` section. Constructor stubs using `{} as never` are appropriate since `splitIntoChunks` is purely synchronous and does not touch injected deps. The `it.each` usage for heading-level variants is clean. The overlap detection heuristic (prefix search in tail) is reasonable given the repeated-word paragraph structure and will not produce false positives given the actual 100-char OVERLAP the implementation applies. Test isolation is good — each `it` block calls `makeService()` independently.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

No affected projects detected via `nx affected --base=HEAD~1 --head=HEAD` (the HEAD commit only touched frontend ESLint config and README, not ai-platform/ files). The spec file `apps/ai-service/src/document/document.service.spec.ts` was run directly via `nx test ai-service --testFile=...` and all 19 tests passed (1 suite, 0 failures, 0.546 s).

## TeamLead Check

Status: APPROVED

All acceptance criteria verified:
- AC-1 PASS: Spec file present at `ai-platform/apps/ai-service/src/document/document.service.spec.ts` (268 lines, confirmed by Read tool).
- AC-2 PASS: `buildHeadingDoc(['Introduction', 'Architecture', 'Conclusion'])` test at lines 67-98 confirms ≥3 chunks and each heading's `section` field is matched.
- AC-3 PASS: Numbered-list boundary tests at lines 105-142 verify ≥2 chunks, `content` starts with numbered-list line, and `section` equals the first list line.
- AC-4 PASS: Oversize-splitting tests at lines 148-199 confirm ≥3 chunks from a 3000-char paragraph, all ≤1200 chars, with overlap detection (50–150 char prefix search in tail).
- AC-5 PASS: Coalescing tests at lines 206-231 confirm all chunks ≤1200 chars and all non-final chunks ≥300 chars.
- AC-6 PASS: Empty-input test at line 52 verifies `splitIntoChunks('')` returns `[]`.
- AC-7 PASS: Return-shape tests at lines 237-267 confirm every chunk has non-empty `content` (no whitespace-only chunks) and typed `section` string.
- AC-8 (nx test) PASS: QA confirmed 19 tests passed, 0 failures.
