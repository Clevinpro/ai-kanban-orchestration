---
id: TASK-002
title: "Add and register fetchDocument content tool (tag-token or title)"
status: done
priority: high
repo: be
epic: chat-history-window-and-document-fetch
complexity: 4
created-at: 2026-06-26T12:47:29Z
updated-at: 2026-06-26T16:43:13+03:00
started-at: 2026-06-26T16:33:36+03:00
completed-at: 2026-06-26T16:43:13+03:00
spec: .planning/work/chat-history-window-and-document-fetch/SPEC.md
---

## Description

The chat agent loop has no tool that returns a document's **content** — `tagQuery` returns
only titles and `similaritySearch` only does query-matched chunk retrieval. Add a new
`fetchDocument` tool that, given either a tag token (`<faq>`) or a document title, returns
the matching document's content (truncated to a bounded budget), and register it in the
`ToolRegistry` so the planner can chain `tagQuery → fetchDocument → answer`.

## Acceptance Criteria

- [ ] New file `apps/ai-service/src/ai/tools/fetch-document.tool.ts` exports
      `FETCH_DOCUMENT_TOOL_NAME = 'fetchDocument'`, a planner-facing description, and
      `createFetchDocumentTool(prismaService)` returning a `Tool` (same shape as
      `tag-query.tool.ts` / `rag-search.tool.ts`).
- [ ] Input resolution: a single-tag token (`<faq>`) → returns the content of the
      document(s) containing that tag (reuse the `documents`/`chunks` UNION +
      `regexp_matches` predicate from `tag-query.tool.ts:124-141`, projecting `content`);
      otherwise treat input as a title and `WHERE title ILIKE` match returning that body.
- [ ] Returned content is truncated to a bounded budget (module constant). Not-found
      returns a clear, non-throwing observation string; multiple matches return a list of
      candidate titles for the model to pick from.
- [ ] The tool is registered in the `ToolRegistry` factory (`ai.module.ts:65-68`) alongside
      `similaritySearch` and `tagQuery`.
- [ ] Unit test `fetch-document.tool.spec.ts` covers: found-by-tag returns truncated
      content, found-by-title returns body, not-found returns the "not found" string,
      multi-match lists candidates.
- [ ] End-to-end coverage: a new/extended E2E test exercises this task's user-visible flow
      or API contract and passes. (`repo: be` → supertest API E2E `*.e2e-spec.ts` run via
      `nx e2e <app>` / `nx test-e2e <app>`.) For this task the deeper chained-flow E2E is
      TASK-003; at minimum extend/confirm the ai-service tool surface is exercised.
- [ ] `nx test ai-service` is green and ai-service type-checks
      (`npx tsc --noEmit -p apps/ai-service/tsconfig.app.json`).

## Technical Notes

- Mirror `tag-query.tool.ts` for the Prisma `$queryRaw` + `Prisma.sql` parameterization and
  the `Tool` contract from `tool.interface.ts`.
- Reuse the single-tag detection: `SINGLE_TAG_PATTERN` / `extractTagName`
  (`tag-query.tool.ts:24,36-39`) — export/share them rather than duplicating the regex.
- Tag→content query: same UNION/`LATERAL regexp_matches` predicate as the lookup, but
  `SELECT title, content` (DISTINCT on document) instead of just `title`. Title query:
  `SELECT title, content FROM documents WHERE title ILIKE ${pattern} LIMIT <small>`.
- Truncation: a `MAX_CONTENT_CHARS` constant; append an explicit "…(truncated)" marker so
  the model knows the body is partial. Pick a budget that won't overflow the planner/answer
  token budget (see `PLANNER_MAX_TOKENS` context in `ai.service.ts`).
- Description must steer the planner to call `fetchDocument` after a `tagQuery`/reference to
  retrieve full text, and to pass a tag token directly when the user names a tag. No planner
  prompt edit needed — the loop enumerates the registry via `toolRegistry.describe()`
  (`ai.service.ts:643-654`).
- Do NOT change the structured-lane tag-listing behavior (bare `<faq>` still lists docs).

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the new `fetchDocument` tool, its unit + integration specs, the `TAG_EXTRACTION_PATTERN` export in `tag-query.tool.ts`, and the `ToolRegistry` registration in `ai.module.ts`. The implementation cleanly mirrors `tag-query.tool.ts`, uses safe `Prisma.sql` parameter binding (no injection risk), correctly reuses the shared extraction pattern, applies bounded truncation, and handles not-found/single/multi-match non-throwingly. Tests cover all required cases. Two non-blocking notes: an empty/whitespace input falls to the title branch and matches all documents via `%%`, and literal `%`/`_` in a title are treated as ILIKE wildcards — both harmless but could be guarded later.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

Unit: `nx affected --base=HEAD~1 --head=HEAD` reported "No tasks were run" — the TASK-002 implementation is still uncommitted (modified/untracked working-tree files: fetch-document.tool.ts, fetch-document.tool.spec.ts, fetch-document.integration.spec.ts, ai.module.ts, tag-query.tool.ts), so it falls outside the committed HEAD~1..HEAD range. Validated directly instead: `nx test ai-service --skip-nx-cache` → 28 suites / 360 tests passed (includes fetch-document.tool.spec.ts covering found-by-tag truncation, found-by-title body, not-found string, multi-match candidate list, and fetch-document.integration.spec.ts covering ToolRegistry registration + dispatch-by-name). Type-check `tsc --noEmit -p apps/ai-service/tsconfig.app.json` clean.

E2E: PASS — `nx e2e api-gateway` ran apps/api-gateway/src/ai/ai.e2e-spec.ts (3 tests, all green): boots the real AppModule via supertest, asserts the /api/ai/chat HTTP body AND the exact Kafka AI_REQUEST side-effect payload, plus the 400 validation short-circuit. `fetchDocument` is an internal ai-service agent-loop tool invoked inside the Kafka consumer, not an HTTP endpoint, so it is not reachable from the api-gateway HTTP surface; per the task's explicit notes the deeper chained-flow E2E (tagQuery → fetchDocument → answer) is owned by TASK-003, and the minimum "tool surface exercised" requirement is met by fetch-document.integration.spec.ts, which wires the real ToolRegistry exactly as ai.module.ts does and asserts real dispatch-by-name returning the document-body observation (not hollow). Justified exemption — verdict PASS.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK — all three services compiled (api-gateway, auth-service, ai-service webpack OK). Boot: ai-service=UP; api-gateway=DOWN and auth-service=DOWN (non-blocking WARN — both report "Waiting for serve in another nx process", a local infra/port-contention artifact, not a code defect).

All acceptance criteria verified (this task = SPEC Slice B; AC-01/AC-02 belong to TASK-001 Slice A):
- AC (new tool file): `fetch-document.tool.ts` exports `FETCH_DOCUMENT_TOOL_NAME = 'fetchDocument'`, `FETCH_DOCUMENT_TOOL_DESCRIPTION`, and `createFetchDocumentTool(prismaService)` returning a `Tool` mirroring `tag-query.tool.ts`. PASS.
- AC (input resolution): single-tag token resolves via the `documents`/`chunks` UNION + `LATERAL regexp_matches` predicate (reusing the shared `TAG_EXTRACTION_PATTERN`/`extractTagName`) projecting `content`; otherwise title `ILIKE` match. PASS.
- AC (bounded truncation / not-found / multi-match): `MAX_CONTENT_CHARS = 6000` with `…(truncated)` marker; non-throwing "No document found for …"; multi-match lists candidate titles. PASS.
- AC (registration): registered in the `ToolRegistry` factory in `ai.module.ts:69` alongside `similaritySearch` and `tagQuery`. PASS.
- AC (unit test): `fetch-document.tool.spec.ts` covers found-by-tag truncated content, found-by-title body, not-found string, multi-match candidate list. PASS.
- AC (E2E/tool-surface): `fetch-document.integration.spec.ts` wires the real ToolRegistry as ai.module.ts does and asserts dispatch-by-name returns a real document-body observation; `nx e2e api-gateway` green; deeper chained flow deferred to TASK-003 per spec. PASS.
- AC (green tests + type-check): QA confirmed `nx test ai-service` 28 suites / 360 tests passed and `tsc --noEmit -p apps/ai-service/tsconfig.app.json` clean. PASS.
