# SPEC: Chat History Window & Document-Content Fetch Tool

**Epic:** `chat-history-window-and-document-fetch`
**Created:** 2026-06-26
**Status:** Ready for Planning
**Repo:** `be`

---

## Problem

A user reproduced a chat defect (screenshot evidence): tag-lookup queries answer
correctly ("The `<faq>` tag is found in 1 document: …"), but **every follow-up that needs
the document's actual content** — "give me that info", "get info from doc about tag",
"description tag faq", "Дай тег faq", "Про що він?" — returns the fallback notice
**"The model did not produce a usable answer. Please rephrase your question and try
again."**

All failing follow-ups route to the tool-enabled **complex** lane
(`query-router.service.ts:84-98`) and reach `executeAgentLoop`, yet still fail, for two
converging root causes:

1. **`loadHistory` loads the OLDEST 10 messages, not the newest.**
   `conversation.service.ts:50-64` uses `orderBy: { createdAt: 'asc' }` + `take: 10`.
   In a conversation longer than 10 turns the model only ever sees the *first* 10 turns —
   never the recent tag result or what "that info" / "він" refers to. With no referent the
   model emits empty output, which is substituted with `EMPTY_FINAL_ANSWER_FALLBACK`
   (`ai.service.ts:75-76`, applied at `:542-543`).

2. **No document-content tool exists.** `tagQuery` returns only document **titles**
   (`tag-query.tool.ts:139` `SELECT title`), never the body. The only content tool is
   `similaritySearch` (hybrid search over a query string); a bare "give me that info"
   gives it nothing to match. The full body lives in `documents.content` and is fetchable
   by id (a private `DocumentService.getDocumentContent`, `document.service.ts:988-991`),
   but **no model-facing tool exposes it** — only `similaritySearch` + `tagQuery` are
   registered (`ai.module.ts:65-68`).

## Goal

In a long conversation the model retains recent context, and when asked to elaborate on a
tagged document it can fetch and summarize that document's content — so content follow-ups
return a real answer instead of the fallback notice. No new infrastructure.

## User Stories / Requirements

### US-01: Follow-ups remember the recent conversation
> As a chat user, I want the assistant to remember what we just discussed (the document a
> tag was found in), so a follow-up like "give me that info" or "Про що він?" is answered
> in context instead of failing.

### US-02: Retrieve a tagged document's content
> As a chat user, I want to ask for the contents/description of a document I found by tag
> and get the actual text summarized, not just the document's title.

### US-03 (developer): Recent-window history
> As a developer, I want `loadHistory` to load the most recent N turns (chronologically
> ordered) so the planner always sees the live tail of the conversation.

## Acceptance Criteria

- [ ] AC-01: `ConversationService.loadHistory` returns the **newest** `MAX_HISTORY_MESSAGES`
      in chronological (oldest→newest) order. Implemented via `orderBy: { createdAt: 'desc' }`
      + `take: MAX_HISTORY_MESSAGES` then `.reverse()`; the `ConversationPrismaClient`
      `orderBy` type widened to `'asc' | 'desc'`.
- [ ] AC-02: A unit test in `conversation.service.spec.ts` seeds >10 messages and asserts
      the newest 10 are selected and returned oldest→newest (guards against re-introducing
      the asc+take bug).
- [ ] AC-03: A `fetchDocument` tool exists
      (`apps/ai-service/src/ai/tools/fetch-document.tool.ts`,
      `FETCH_DOCUMENT_TOOL_NAME = 'fetchDocument'`, `createFetchDocumentTool(prismaService)`)
      and is registered in the `ToolRegistry` factory (`ai.module.ts:65-68`) alongside
      `similaritySearch` and `tagQuery`.
- [ ] AC-04: `fetchDocument` input accepts **either** a tag token (`<faq>`) or a document
      title. Tag token → returns the content of the document(s) containing that tag (same
      `documents`/`chunks` UNION + `regexp_matches` predicate as `tag-query.tool.ts:124-141`,
      projecting `content`). Title → `WHERE title ILIKE` match returning that body.
- [ ] AC-05: Returned content is truncated to a bounded budget (module constant) so it
      cannot overflow the planner/answer token budget. Not-found returns a clear,
      non-throwing observation; multiple matches list candidate titles for the model to pick.
- [ ] AC-06: A unit test (`fetch-document.tool.spec.ts`) covers: found-by-tag returns
      truncated content, found-by-title returns body, not-found returns the "not found"
      string, multi-match lists candidates.
- [ ] AC-07: In the complex lane the planner can chain reference/`tagQuery` → `fetchDocument`
      → a natural-language answer (integration test with a stubbed provider emitting a
      `TOOL fetchDocument: …` line, asserting a non-empty final answer — not the fallback).
- [ ] AC-08: No regression — existing chat / tag / RAG flows still work. The bare-`<faq>`
      structured lane behavior is unchanged. `nx test ai-service` is green and ai-service
      type-checks (`npx tsc --noEmit -p apps/ai-service/tsconfig.app.json`).
- [ ] AC-09: A real e2e/supertest exercises the changed observable behavior, per
      `ai-platform/CLAUDE.md` (e2e required for observable behavior changes).

## Technical Design

### Files touched

```
ai-platform/apps/ai-service/src/conversation/conversation.service.ts        (Slice A)
ai-platform/apps/ai-service/src/conversation/conversation.service.spec.ts   (Slice A test)
ai-platform/apps/ai-service/src/ai/tools/fetch-document.tool.ts             (new, Slice B)
ai-platform/apps/ai-service/src/ai/tools/fetch-document.tool.spec.ts        (new, Slice B test)
ai-platform/apps/ai-service/src/ai/ai.module.ts                            (register tool, Slice B)
```
Plus an ai-service integration/e2e spec exercising the chained tool flow (AC-07/AC-09).

### Slice A — recent-context history window

- `conversation.service.ts:50-64`: switch `orderBy` to `{ createdAt: 'desc' }`, keep
  `take: MAX_HISTORY_MESSAGES`, then `return messages.reverse()` so the planner receives
  the transcript oldest→newest. Widen `ConversationPrismaClient.message.findMany` `orderBy`
  (`:11`) to `{ createdAt: 'asc' | 'desc' }`.
- No call-site changes — `ai.service.ts:467-484` already consumes the returned array in order.

### Slice B — `fetchDocument` content tool

- Mirror the shape of `tag-query.tool.ts` / `rag-search.tool.ts` (a `Tool` with `name`,
  `description`, `run(input, ctx)`); take `prismaService` in the factory.
- Resolve input: if it matches the single-tag pattern (reuse `extractTagName` semantics
  from `tag-query.tool.ts:24,36-39`), run the tag→content query; otherwise treat as a title
  and `ILIKE` match.
- Truncate `content` to a constant budget; format a clear observation string (include the
  title), "not found" when empty, and a candidate list when >1 doc matches.
- Register in the `ToolRegistry` factory (`ai.module.ts:65-68`). The agent loop already
  enumerates the registry via `toolRegistry.describe()` (`ai.service.ts:643-654`), so the
  planner sees the new tool with no prompt edit. Description steers the planner to chain
  `tagQuery → fetchDocument → answer` and to pass a tag token directly when the user names
  a tag.

## Out of Scope

| Item | Reason |
|------|--------|
| Reasoning-model empty-output (qwen3 512-token planner budget) | Already mitigated by the prior `reasoning_effort` fix |
| Changing the structured-lane tag-listing behavior | Bare `<faq>` listing docs by title is correct by design; follow-ups are complex-lane |
| Persisting intermediate tool observations across runs | History window fix restores the needed context; observation persistence is a separate concern |
| New infrastructure (Redis, new services) | Not needed |

## Open Questions

- [ ] Truncation budget value (chars vs. token estimate) and whether to summarize vs.
      return raw truncated body — pick a sensible default constant.
- [ ] Title matching: exact `ILIKE` vs. fuzzy/trigram when the model echoes an approximate
      title — start with `ILIKE`, revisit if round-trip fragility shows up.

## Constraints

- Single repo (`be`) — no cross-service work in one task; the two slices are separate
  sequential tasks (Slice A first, Slice B second).
- No new runtime infrastructure.
- Do not regress existing chat / tag / RAG flows or the structured tag-listing lane.
