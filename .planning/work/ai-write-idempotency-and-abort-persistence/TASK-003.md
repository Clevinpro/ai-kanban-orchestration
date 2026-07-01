---
id: TASK-003
title: Convert saveMessage to idempotent upsert keyed on (runId, role)
status: done
priority: high
repo: be
epic: ai-write-idempotency-and-abort-persistence
complexity: 4
created-at: 2026-06-23T21:21:00+03:00
updated-at: 2026-06-23T22:07:51+03:00
started-at: 2026-06-23T22:01:39+03:00
completed-at: 2026-06-23T22:07:51+03:00
spec: .planning/work/ai-write-idempotency-and-abort-persistence/SPEC.md
---

## Description

Make `ConversationService.saveMessage` idempotent: when a `runId` is supplied,
upsert keyed on the `(runId, role)` unique constraint so a redelivered run writes
a no-op/update instead of a duplicate row. Keep a plain `create` fallback when
`runId` is absent (back-compat). Widen the injected Prisma client type to allow
`upsert`.

## Acceptance Criteria

- [ ] `saveMessage` performs `prisma.message.upsert({ where: { runId_role: { runId, role } }, create: {...}, update: {} })` when `runId` is present.
- [ ] `saveMessage` falls back to `prisma.message.create` when `runId` is undefined,
      writing exactly one row and not throwing.
- [ ] `ConversationPrismaClient` type declares `message.upsert` (widened from
      create-only).
- [ ] `runId` is actually persisted to the column (no longer discarded — the
      current comment "Not persisted ... no such column" is removed).
- [ ] A test proves calling `saveMessage` twice with the same `(runId, role)`
      results in exactly one row.
- [ ] Service type-checks and `nx test ai-service` passes.

## Technical Notes

- File: `ai-platform/apps/ai-service/src/conversation/conversation.service.ts`.
- `saveMessage` at `:51-63` is currently a bare `prisma.message.create` that
  explicitly discards `runId` (see the comment in the param block).
- Injected client type `ConversationPrismaClient` at `:7-25` only declares
  `message.create`/`findMany` — add `message.upsert` to it.
- The compound unique input name Prisma generates for `@@unique([runId, role])`
  is `runId_role` (confirm against the regenerated client from TASK-001).
- Depends on TASK-001 (column + unique index + regenerated client) — that runs
  first per epic sequential ordering.
- Callers `persistAssistantMessage` (`ai.service.ts:965`) and
  `ensurePersistedUserTurn` (`ai.service.ts:408`) already forward `runId` — no
  change needed there.
- Back-compat fallback resolves SPEC Open Question on absent-runId callers; keep
  it until a follow-up confirms no caller omits `runId`.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed `conversation.service.ts` and the new `conversation.service.spec.ts` against all six acceptance criteria. The implementation is correct: `saveMessage` upserts on `{ runId_role: { runId, role } }` with `create`/`update: {}` when `runId` is present, falls back to a plain `create` (one row, no throw) when absent, the `ConversationPrismaClient` type is widened with a precise `upsert` signature, and `runId` is now persisted (stale "no such column" comment removed). The schema dependency from TASK-001 is in place — `Message.runId String?` with `@@unique([runId, role])` — and PostgreSQL's NULL-distinct semantics mean the create-fallback path never collides. Tests faithfully emulate the unique constraint with a fake Prisma and prove single-row idempotency across redelivery, runId persistence, and the undefined-runId fallback. Types are tight (no `any`), comments are English, and back-compat is preserved. No bugs, security, or quality issues found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported no affected projects ("No tasks were run", exit 0) because the TASK-003 implementation lives in the uncommitted working tree, while HEAD~1..HEAD only contains an unrelated docs/research commit. Per D-06, no affected committed tests is not a failure.

Directly exercised the task's new spec against the working-tree changes to confirm coverage: `nx test ai-service --testFile=conversation.service.spec.ts` passed — Test Suites: 1 passed, Tests: 3 passed (upsert idempotency / single-row redelivery, runId persistence, undefined-runId create fallback). Exit code 0.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway=DOWN (infra), auth-service=DOWN (infra), ai-service=UP. Build compiled cleanly for all services; ai-service (the service this task touches) booted up. The two DOWN services are non-blocking infra WARNs, not code defects.

All acceptance criteria verified and re-confirmed independently:
- AC-1 (upsert on `(runId, role)` when runId present): `conversation.service.ts:79-86` does `upsert({ where: { runId_role: { runId, role } }, create: {...}, update: {} })`. PASS
- AC-2 (create fallback when runId undefined — one row, no throw): `:88-90`; spec test confirms one row, null runId, resolves. PASS
- AC-3 (`ConversationPrismaClient` declares `message.upsert`): type widened with a precise upsert signature at `:23-32`. PASS
- AC-4 (runId persisted, stale "no such column" comment removed): `create` data now includes `runId` (`:82`); comment documents idempotency. PASS
- AC-5 (test proves twice-same-`(runId,role)` = one row): `conversation.service.spec.ts:61-94`. PASS
- AC-6 (type-checks + `nx test ai-service` passes): `tsc --noEmit` exit 0; test 3 passed. PASS

Schema dependency from TASK-001 confirmed present (`schema.prisma:85` `runId String? @map("run_id")`, `:90` `@@unique([runId, role])`).
