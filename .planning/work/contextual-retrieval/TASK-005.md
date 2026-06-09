---
id: TASK-005
title: Stepped operation logging — logStep helper across upload + reindex pipeline
status: done
priority: medium
repo: be
epic: contextual-retrieval
complexity: 3
created-at: 2026-06-09T09:40:04Z
updated-at: 2026-06-09T13:22:42+03:00
started-at: 2026-06-09T13:12:30+03:00
completed-at: 2026-06-09T13:22:42+03:00
spec: .planning/work/contextual-retrieval/SPEC.md
---

## Description

Make the index operation step-traceable. Add a `logStep(n, total, label, meta, level='log')` private helper that emits `STEP {n}/{total}: {label}` with parameters in the LoggerService `meta` arg (3rd param — `log(message, context, meta)`), never string-concatenated. Apply the canonical step sequence across both `uploadDocument` and `reindexDocument` (reindex skips read/store). Where a log call already exists in `document.service.ts` (lines ~45, 48, 51, 56, 75, 88, 99, 107, 125), only ADD the `STEP {n}/{total}:` prefix + a `meta` object — keep the existing message text and `'DocumentService'` context. Each step's `meta` carries a correlation id (`documentId` + `operation: 'upload' | 'reindex'`); per-chunk steps also carry `chunkIndex` + `chunkTotal`. Log lengths/counts only — never raw chunk or file content. High-level steps at `log` (info); per-chunk detail (STEP 5/6) at `debug` — matching existing levels.

## Acceptance Criteria

- [ ] Every stage of upload AND reindex logged as `STEP {n}/{total}: {label}` with params in `meta` (3rd arg), not concatenated (AC-15)
- [ ] Existing log calls (~lines 45,48,51,56,75,88,99,107,125) get only the `STEP n/total:` prefix + `meta`; existing text + `'DocumentService'` context kept (AC-16)
- [ ] Each `meta` carries `documentId` + `operation` tag; per-chunk steps also carry `chunkIndex` + `chunkTotal` (AC-17)
- [ ] Per-step params per SPEC table: read (title/ext/textLength), split (chunkCount), store (documentId), context (chunkIndex/chunkTotal/section/contentLength/llmProvider/llmModel), embed (provider/model/batchSize), insert (count), done (chunksCount/durationMs) (AC-18)
- [ ] Lengths/counts only, never raw content; high-level at `log`, per-chunk at `debug` (AC-19)
- [ ] `nx test ai-service` passes

## Technical Notes

- File: `apps/ai-service/src/document/document.service.ts`. Helper signature in SPEC §"Stepped operation logging".
- Canonical 7-step sequence (SPEC table): validate file → read → split → store row → generate context (per chunk) → embed → insert+done.
- `LoggerService.log(message, context?, meta?: Record<string, unknown>)` (pino) already takes structured fields.
- This task depends on TASK-003 (context step) + TASK-004 (batchSize in embed step) existing to log their params.

---REVIEW-BLOCK-START---
## Code Review

Status: CHANGES_REQUESTED

**Issues:**
- ai-platform/apps/ai-service/src/document/document.service.ts:263 — reindexDocument STEP 3 (split) log message is `Split into ${chunks.length} chunk(s), storing document` with no `STEP 3/7:` prefix. AC-15 requires "Every stage of upload AND reindex logged as `STEP {n}/{total}: {label}`". The upload path got the prefix (line 139), but the reindex path did not. BLOCKER
- ai-platform/apps/ai-service/src/document/document.service.ts:279 — reindexDocument STEP 6 (embed) log message is `Reindex batch embedding ${contextualized.length} chunk(s) for document id=${documentId}` with no `STEP 6/7:` prefix, violating AC-15 for the reindex path (upload's equivalent at line 166 has the prefix). BLOCKER
- ai-platform/apps/ai-service/src/document/document.service.ts:263 — minor: the carried-over text "storing document" is misleading in the reindex context since reindex skips the store-row step (per the comment on line 262). Consider dropping "storing document" when adding the prefix. WARNING

The logStep helper, meta structure, correlation ids, per-chunk debug levels, and the entire uploadDocument 7-step sequence are implemented correctly and well-covered by tests. The gap is that reindexDocument only applied the `STEP n/total:` prefix to step 7 (and step 5 via contextualizeChunks); steps 3 and 6 emit their original messages without the prefix, so AC-15 is not met for the reindex path. This escaped detection because the spec file only tests uploadDocument — there is no reindex logging coverage. nx test will likely still pass, but the acceptance criterion is not satisfied.
---REVIEW-BLOCK-END---

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Both prior BLOCKERs are resolved: reindexDocument STEP 3 (document.service.ts:263) and STEP 6 (document.service.ts:278-279) now carry the `STEP n/7:` prefix, satisfying AC-15 for the reindex path, and the misleading "storing document" text was dropped on reindex (prior WARNING addressed). New reindex logging coverage was added in document.service.spec.ts (a makeReindexHarness plus three tests asserting the STEP prefix, DocumentService context, meta structure, documentId + operation:reindex correlation, documented per-step params, and debug-vs-info levels), closing the gap that let the regression escape. Implementation and tests are clean and the logging contract is consistent across upload and reindex.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

The `--base=HEAD~1 --head=HEAD` range reported "No tasks were run" (exit 0) because the task's changes are uncommitted in the working tree. Running nx affected against the working tree exercised the relevant projects:

- ai-service: 19 test suites passed, 217 tests passed
- auth-service: 1 test suite passed, 1 test passed
- database: no tests (passWithNoTests)
- api-gateway: no tests (passWithNoTests)

All affected projects passed (exit code 0). The task's `document.service.ts` / `document.service.spec.ts` changes are covered by the ai-service suite, including the new reindex logging tests.

## TeamLead Check

Status: APPROVED

All acceptance criteria for this task (AC-15 through AC-19, plus the `nx test ai-service` gate) verified against `document.service.ts` and `document.service.spec.ts`:

- AC-15: Every upload stage (STEP 1-7) and every reindex stage (STEP 3,5,6,7 — read/store correctly skipped) emits `STEP {n}/{total}: {label}` with params in the 3rd `meta` arg, not concatenated. The reindex STEP 3 + STEP 6 prefix gaps flagged in the first code review are resolved.
- AC-16: Existing log calls (read, split, store, done) keep their original message text and `'DocumentService'` context with only the STEP prefix + meta added.
- AC-17: Each `meta` carries `documentId` (where available — STEP 1 pre-id correlates by filePath) + `operation` tag; per-chunk STEP 5 carries `chunkIndex` + `chunkTotal`.
- AC-18: Documented per-step params present: read (title/textLength), split (chunkCount), store (documentId/title), context (chunkIndex/chunkTotal/section/contentLength/llmProvider/llmModel), embed (embedProvider/embedModel/batchSize), done (count/chunksCount/durationMs).
- AC-19: meta logs lengths/counts/names only — no raw chunk or file content; high-level steps at `log`, per-chunk STEP 5/6 at `debug`.
- `nx test ai-service`: 19 suites / 217 tests pass, including the new reindex logging coverage (makeReindexHarness + 3 tests).
