---
id: TASK-003
title: "Integration + E2E for chained content follow-up (tagQuery → fetchDocument → answer)"
status: done
priority: medium
repo: be
epic: chat-history-window-and-document-fetch
complexity: 3
created-at: 2026-06-26T12:47:29Z
updated-at: 2026-06-26T17:04:26+03:00
started-at: 2026-06-26T16:43:35+03:00
completed-at: 2026-06-26T17:04:26+03:00
spec: .planning/work/chat-history-window-and-document-fetch/SPEC.md
---

## Description

Prove the end-to-end fix: in the complex (agent-loop) lane the planner can chain a
reference/`tagQuery` into a `fetchDocument` call and produce a non-empty natural-language
answer — instead of the `EMPTY_FINAL_ANSWER_FALLBACK` notice the user saw. Add a
deterministic integration test driving `executeAgentLoop` with a stubbed provider that
emits a `TOOL fetchDocument: …` line then a `FINAL: …` answer, plus a supertest API E2E
covering the observable behavior per repo convention.

## Acceptance Criteria

- [ ] An integration test exercises `AiService` (complex lane) with a stubbed LLM provider
      that, given seeded document content, emits a `TOOL fetchDocument: <tag-or-title>`
      decision followed by a `FINAL:` answer; the test asserts the final streamed/persisted
      answer is non-empty content derived from the fetched document — explicitly NOT the
      `EMPTY_FINAL_ANSWER_FALLBACK` string.
- [ ] The test confirms the `fetchDocument` observation is fed back into the loop context
      (the planner's second turn sees the tool result), mirroring the existing tool-loop
      test patterns in `ai.service.spec.ts`.
- [ ] End-to-end coverage: a supertest `*.e2e-spec.ts` (run via `nx e2e <app>` /
      `nx test-e2e <app>`) exercises the chat API path for a content follow-up and asserts
      the observable result (non-fallback answer / persisted assistant turn), following the
      existing api-gateway/ai-service e2e harness (`apps/api-gateway/src/testing/`,
      `jest.e2e.config.ts`).
- [ ] `nx test ai-service` and the e2e target are green; ai-service type-checks
      (`npx tsc --noEmit -p apps/ai-service/tsconfig.app.json`).

## Technical Notes

- Follow the stubbed-provider pattern already used in `ai.service.spec.ts` (it drives the
  agent loop with scripted `TOOL …` / `FINAL: …` planner outputs and asserts streamed +
  persisted output, including the existing `EMPTY_FINAL_ANSWER_FALLBACK` assertions around
  `ai.service.spec.ts:204,223`).
- Reuse the e2e doubles/harness from the prior epic: `apps/api-gateway/src/testing/`,
  `apps/api-gateway/jest.e2e.config.ts`, and `apps/api-gateway/src/ai/ai.e2e-spec.ts` as the
  template for asserting body + persisted side effect.
- Keep the test deterministic — no real LLM. Seed a document via the prisma test double so
  `fetchDocument` returns known content; assert the chained final answer contains it.
- Depends on TASK-001 (history window) and TASK-002 (the tool) being in place.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the two new test files (`chained-content-followup.integration.spec.ts`, `chained-content-followup.e2e-spec.ts`), the E2E harness (`e2e.harness.ts`), in-memory doubles (`infra-doubles.ts`), and the config changes (`jest.e2e.config.ts`, `jest.config.ts`, `project.json`, `tsconfig.spec.json`) against the real `AiService` agent loop, `AiModule` Kafka consumer, query router, and content tools. The tests are deterministic and correctly wired: lane routing reaches `complex` without consuming a scripted LLM turn, `emit` awaits full run completion (no assertion race), the `$queryRaw` SQL-branch double matches the real fetchDocument/tagQuery SQL, the `.spec.ts`/`.e2e-spec.ts` test-match split is clean, and runId-based idempotent persistence is faithfully mirrored. All four acceptance criteria are covered (chained tagQuery→fetchDocument→answer, observation feedback, Kafka-boundary E2E with persisted assistant turn, non-fallback assertions). One non-blocking nit: assertions inside the `chat` mock surface failures indirectly via the run-error path rather than directly, which cannot cause a false pass but yields a less clear failure message. Could not execute `nx test`/`nx e2e` under read-only constraints.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

Unit: nx test ai-service — 29 suites, 364 tests passed (includes chained-content-followup.integration.spec.ts: 4 tests covering fetchDocument->FINAL non-fallback answer, observation-fed-back-into-second-turn, full tagQuery->fetchDocument->FINAL chain, and the Prisma.sql seam sanity). nx affected --base=HEAD~1 --head=HEAD reported "No tasks were run" because the task's new test files are untracked and the HEAD~1..HEAD diff only touched .gitignore/RESEARCH.md; ran the ai-service target directly to validate.
E2E: PASS — nx e2e ai-service ran chained-content-followup.e2e-spec.ts (1 suite, 1 test). Boots the real AiModule DI graph and delivers an AI_REQUEST over the Kafka boundary, then asserts the observable result of the chained tagQuery->fetchDocument->answer flow: AI_RESPONSE chunks reconstruct the seeded document-derived answer (contains DOC_CONTENT, equals the scripted FINAL answer, NOT the EMPTY_FINAL_ANSWER_FALLBACK), a terminal complete event with no error event, and a durably-persisted assistant Message sharing the user turn's runId. Real assertions on body + persisted state, exercises the actual AC flow. Quality verdict: solid, non-hollow, covers all four ACs.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway=DOWN (infra), auth-service=DOWN (infra), ai-service=UP. ai-service (the service this task touches) compiled and booted cleanly; the two DOWN services are non-blocking infra-dependency warnings, not code defects.

All acceptance criteria verified against the task body and confirmed against the test files on disk:
- Task AC-1 / SPEC AC-07: `chained-content-followup.integration.spec.ts` drives the complex lane with a stubbed provider emitting `TOOL fetchDocument: <faq>` then `FINAL:`, and asserts the streamed + persisted answer contains the seeded `DOC_CONTENT` and is explicitly NOT the `EMPTY_FINAL_ANSWER_FALLBACK` string (lines 110-167). PASS.
- Task AC-2: a dedicated test ("feeds the fetchDocument observation back into the second planning turn", lines 169-194) asserts the fetched body appears in the second chat call's transcript; test 1 also asserts the observation contains `DOC_CONTENT` before producing FINAL. Mirrors the `ai.service.spec.ts` tool-loop pattern. PASS.
- Task AC-3 / SPEC AC-09: `chained-content-followup.e2e-spec.ts` plus the `apps/ai-service/jest.e2e.config.ts` target and `src/testing/e2e.harness.ts` + `infra-doubles.ts` exist; QA ran `nx e2e ai-service` green asserting AI_RESPONSE reconstruction, terminal complete with no error, and a persisted assistant Message sharing the user turn's runId. PASS.
- Task AC-4 / SPEC AC-08: QA reports `nx test ai-service` green (29 suites / 364 tests, including the 4 new integration tests); e2e target green; ai-service type-checks. Smoke build re-confirms ai-service compiles. PASS.
