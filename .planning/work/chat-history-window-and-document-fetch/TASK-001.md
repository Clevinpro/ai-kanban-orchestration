---
id: TASK-001
title: "Load newest-N messages in ConversationService.loadHistory"
status: done
priority: high
repo: be
epic: chat-history-window-and-document-fetch
complexity: 2
created-at: 2026-06-26T12:47:29Z
updated-at: 2026-06-26T15:57:21+03:00
started-at: 2026-06-26T15:51:47+03:00
completed-at: 2026-06-26T15:57:21+03:00
spec: .planning/work/chat-history-window-and-document-fetch/SPEC.md
---

## Description

`ConversationService.loadHistory` currently loads the **oldest** `MAX_HISTORY_MESSAGES`
of a conversation (`orderBy: { createdAt: 'asc' }` + `take: 10`), so in any conversation
longer than 10 turns the agent loop only ever sees the *first* 10 turns and never the live
tail. This makes content follow-ups ("give me that info", "Про що він?") lose their
referent and fail with the empty-answer fallback. Change `loadHistory` to load the
**newest** `MAX_HISTORY_MESSAGES` and return them in chronological (oldest→newest) order so
the planner receives the recent context in natural order.

## Acceptance Criteria

- [ ] `loadHistory` selects the newest `MAX_HISTORY_MESSAGES` via
      `orderBy: { createdAt: 'desc' }` + `take: MAX_HISTORY_MESSAGES`, then returns them
      reversed to chronological (oldest→newest) order.
- [ ] The `ConversationPrismaClient.message.findMany` `orderBy` type is widened to
      `{ createdAt: 'asc' | 'desc' }` so the change type-checks.
- [ ] A unit test in `conversation.service.spec.ts` seeds >10 messages and asserts (a) the
      newest 10 are returned, (b) in oldest→newest order — guarding against re-introducing
      the asc+take bug.
- [ ] `nx test ai-service` is green and ai-service type-checks
      (`npx tsc --noEmit -p apps/ai-service/tsconfig.app.json`).

## Technical Notes

- File: `ai-platform/apps/ai-service/src/conversation/conversation.service.ts:50-64`
  (the `loadHistory` method) and the `ConversationPrismaClient` type at `:7-40`.
- Keep `MAX_HISTORY_MESSAGES = 10` and the existing log line. Only the query ordering and a
  final `.reverse()` change; no call-site changes needed — `ai.service.ts:467-484` already
  consumes the returned array in order.
- The unit test mocks the prisma client; assert the `findMany` args (`orderBy.createdAt`
  `'desc'`, `take` 10) AND that the returned array order is reversed relative to what the
  mock returns. Mirror the existing mocking style already used in
  `conversation.service.spec.ts`.
- E2E coverage omitted for this task: it is an internal data-access ordering change with no
  new endpoint/contract, and a real-LLM "context retention" E2E would be non-deterministic.
  The deterministic unit test plus the epic-level live verification (team-lead:test) cover
  the observable effect.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed conversation.service.ts and conversation.service.spec.ts. `loadHistory` now correctly selects the newest 10 messages (`orderBy desc` + `take 10`) and reverses to chronological order; the `findMany` `orderBy` type was widened to `'asc' | 'desc'` as required. The added unit test seeds >10 messages, asserts the query args and the oldest→newest return order, and guards against re-introducing the asc+take bug. All acceptance criteria are met; the change is minimal and correct with no bugs or security concerns.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

Unit: nx affected --base=HEAD~1 --head=HEAD found no tasks because the task's changes (conversation.service.ts + new conversation.service.spec.ts) are uncommitted, so HEAD~1..HEAD only contained an unrelated RESEARCH doc. Re-ran via `nx affected --target=test --uncommitted`, which correctly captured ai-service and 5 other projects: ai-service 347 tests / 26 suites passed, all 6 projects green. Typecheck `npx tsc --noEmit -p apps/ai-service/tsconfig.app.json` exits 0. The new `ConversationService.loadHistory` unit test asserts the findMany args (`orderBy: { createdAt: 'desc' }`, `take: 10`, correct select/where), asserts the returned array is reversed to chronological oldest→newest order (m6..m15), and guards against re-introducing the asc+take bug — directly covering all acceptance criteria.
E2E: EXEMPT — task notes justify omitting E2E: this is an internal data-access ordering change with no new endpoint/contract, and a real-LLM context-retention E2E would be non-deterministic. The deterministic unit test plus epic-level live verification (team-lead:test) cover the observable effect. Exemption accepted.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway=DOWN (infra), auth-service=DOWN (infra), ai-service=UP. ai-service — the only service this task touches — built and booted cleanly; the two DOWN services are non-blocking (missing local DB/Redis), not code defects.

All acceptance criteria verified. This task is Slice A of the epic (SPEC splits it into two sequential tasks); the slice-relevant SPEC ACs are met: AC-01 (loadHistory uses orderBy desc + take MAX_HISTORY_MESSAGES + .reverse(), orderBy type widened to 'asc'|'desc' in conversation.service.ts), AC-02 (conversation.service.spec.ts seeds the newest-10 window, asserts findMany args and oldest→newest m6..m15 order with an explicit asc+take regression guard), and the slice portion of AC-08 (nx test ai-service green, tsc --noEmit exits 0 per QA). AC-03–AC-07 and AC-09 belong to Slice B (TASK-002) and are out of scope here.
