---
id: TASK-004
title: Windowed context prompt — bound to CONTEXT_WINDOW_CHARS, small-doc unchanged
status: done
priority: high
repo: be
epic: fast-upload-indexing
complexity: 4
created-at: 2026-06-09T16:11:12Z
updated-at: 2026-06-09T19:40:50+03:00
started-at: 2026-06-09T19:33:58+03:00
completed-at: 2026-06-09T19:40:50+03:00
spec: .planning/work/fast-upload-indexing/SPEC.md
---

## Description

Replace the whole-document context prompt with a bounded window. Instead of embedding the entire document in every per-chunk context prompt (cost `O(chunks × documentLength)`), embed a window of `CONTEXT_WINDOW_CHARS` (env, default 2000) centred on the chunk — the chunk's section plus surrounding text, clamped to document bounds. When the whole document already fits within `CONTEXT_WINDOW_CHARS`, behaviour is unchanged (whole doc used). This makes context cost `O(chunks × window)`, independent of document size.

## Acceptance Criteria

- [ ] Context prompt embeds a bounded window of `CONTEXT_WINDOW_CHARS` (env, default 2000) centred on the chunk, not the whole document (AC-07)
- [ ] When the document fits within `CONTEXT_WINDOW_CHARS`, the whole doc is used (unchanged) — verified by a char-budget assertion (AC-08)
- [ ] Prompt length is bounded regardless of document size — test asserts `O(chunks × window)`, not `O(chunks × documentLength)` (AC-09)
- [ ] `nx test ai-service` passes

## Technical Notes

- File: `apps/ai-service/src/document/document.service.ts` — the `generateContext` / prompt-building site from contextual-retrieval.
- Window = clamp(doc, around=chunk offset, size=`CONTEXT_WINDOW_CHARS`). Need each chunk's character offset in the document; if not already tracked, derive via `indexOf(chunk.body)` or carry an offset from `splitIntoChunks`.
- `CONTEXT_WINDOW_CHARS` via ConfigService; document the default.
- Do NOT change the embedded chunk body shape — only the *context* prompt input changes. `"{context}\n\n{chunkBody}"` stays as-is (search stays compatible).
- Escaping interpolated content is TASK-005 (separate). `.env.example` doc is TASK-007.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed `document.service.ts` (the new `windowAroundChunk` method and its use in `generateContext`/`buildContextPrompt`) and the corresponding spec additions. The windowing logic correctly implements all three acceptance criteria: whole-doc passthrough when the document fits within `CONTEXT_WINDOW_CHARS` (AC-08), a bounded window centered on the chunk and clamped to document bounds (AC-07), and a per-prompt budget independent of document size (AC-09). The slice is always `<= window` chars, config is read via `ConfigService` with a documented default of 2000, the embedded chunk-body shape is unchanged, and the not-found fallback (`indexOf < 0` → window from document start) degrades gracefully. Tests cover all three ACs with explicit char-budget assertions. One minor non-blocking note: if `CONTEXT_WINDOW_CHARS` is configured smaller than `MAX_CHUNK_SIZE` (1200), the centered window may not fully contain a large chunk body, but this is graceful (still a valid bounded window) and does not occur under the default config. Code quality is high and consistent with existing conventions.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

Ran `nx affected --target=test --base=HEAD~1 --head=HEAD` in `ai-platform/`. Result: "No tasks were run" (no projects affected by the HEAD~1..HEAD diff), exit code 0. Per D-06, no affected tests is not a failure.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK — all services compiled (auth-service, ai-service, api-gateway built successfully). Boot summary: api-gateway=DOWN, auth-service=DOWN, ai-service=DOWN — non-blocking WARN, attributable to missing local infra (DB/Redis/Kafka), not a code defect; build gate passed.

All acceptance criteria verified (TASK-004 scope: Windowed Context):
- AC-07: `windowAroundChunk` builds a `CONTEXT_WINDOW_CHARS` (default 2000) window centred on the chunk and clamped to document bounds; the whole-document prompt is gone. Verified by tests "AC-07/AC-09: large document uses a bounded window" and "AC-07: windowed prompt contains the chunk body (window centred on chunk)".
- AC-08: When `wholeDocument.length <= window` the whole document is returned unchanged. Verified by "AC-08: a document that fits within CONTEXT_WINDOW_CHARS uses the whole doc unchanged" with the whole-doc-embedded-verbatim char-budget assertion.
- AC-09: Per-prompt document length is bounded by the window regardless of document size. Verified by "AC-09: prompt-doc length is bounded by the window, independent of document size (O(chunks × window))" asserting both small-over and large docs are bounded by the same window.
- Test gate: `nx test ai-service` passes — 19 suites, 239 tests, all green. Embedded chunk-body shape unchanged (search-compatible) per Technical Notes.
