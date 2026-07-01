# Epic Test Report — ai-write-idempotency-and-abort-persistence

Verdict: PASS
Generated: 2026-06-24T16:10:00+03:00
Tasks verified: 5 (all done)
SPEC: .planning/work/ai-write-idempotency-and-abort-persistence/SPEC.md
Live verification: ON (Claude-in-Chrome MCP @ localhost:3000)
Re-run: yes (after previous Verdict FAIL on AC-07; ACs 1–6, 8 carried)

## Acceptance Criteria

| # | Criterion | Result | Live Check | Evidence |
|---|-----------|--------|-----------|----------|
| 1 | `runId` minted in AI_REQUEST handler, added to payload, threaded `streamAiResponse` → `processMessage({...runId})` | PASS (carried) | — | Verified in previous run — `ai.module.ts:101` mint, `:107` threaded, `:244` into processMessage; `ai.service.ts:174` consumes |
| 2 | Redelivered AI_REQUEST reuses same `runId` (unit/integration test) | PASS (carried) | — | Verified in previous run — mint-once-per-delivery; idempotency test in `conversation.service.spec.ts` |
| 3 | `Message.runId @map("run_id")` + `@@unique([runId, role])`; new migration that does NOT drop trgm/hnsw chunk indexes | PASS (carried) | — | Verified in previous run — `schema.prisma`; migrations `20260616000000` + `20260623213000`; no DROP of `chunks_content_trgm_idx`/`chunks_embedding_hnsw_idx` |
| 4 | `saveMessage` idempotent upsert on `(runId, role)`; twice → one row (test) | PASS (carried) | — | Verified in previous run — `conversation.service.ts` `upsert({ where: { runId_role }, update: {} })`; ai-service suite proves single row |
| 5 | Absent `runId` → exactly one row, no throw (back-compat) | PASS (carried) | — | Verified in previous run — plain `create` fallback when `runId` undefined |
| 6 | Abort/stream-error after partial gen → best-effort persist via idempotent path; later success is no-op | PASS (carried) | — | Verified in previous run — `persistPartialOnAbort` in error handler + safeguard-abort persist before rethrow, both try/catch-wrapped |
| 7 | Existing chat/agent flows still persist exactly one user + one assistant turn (no regression) | PASS | LIVE PASS | **Re-verified.** TASK-005 added `src/**/*.e2e-spec.ts` to all 3 app tsconfigs; `nx build api-gateway --node-env=production` (the command that emitted 11 TS2304/TS2593 errors before) now compiles clean; backend boots (gateway 4000 + ai-service 4001 + Kafka consumer UP); browser: shell renders, `/chat`→`/auth` 401 interceptor (documented), no console errors; `nx e2e api-gateway` 3/3 (chat HTTP→Kafka), `nx test ai-service` 346/346. `.test-evidence/AC-07-live-verify.txt` |
| 8 | `nx test ai-service` passes and ai-service type-checks | PASS (carried) | — | Verified in previous run; re-confirmed live this run — `nx test ai-service` 26 suites / 346 tests pass |

## Summary

Verdict PASS. This is a re-run after the previous gate's single failure (AC-07). The
core idempotency + abort-persistence work (AC-01–06, AC-08) was fully delivered and
verified in the prior run and is carried forward. The AC-07 regression — the
api-gateway production build broke because the new `ai.e2e-spec.ts` (jest globals)
was compiled into the production bundle, so gateway 4000 + ai-service 4001 never
booted — is now fixed by TASK-005: `src/**/*.e2e-spec.ts` is excluded from the
api-gateway, ai-service, and auth-service app tsconfigs. Live verification confirms
the resolution end-to-end: the exact failing production build (`webpack-cli build
--node-env=production`) compiles cleanly, the backend boots (gateway, ai-service with
its Kafka consumer, auth) and the frontend federates, and the committed regression
suites pass (gateway chat-flow e2e 3/3 publishing the AI_REQUEST, ai-service 346/346
including the `(runId, role)` single-row upsert). All 8 acceptance criteria are met.
