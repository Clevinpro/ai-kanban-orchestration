---
id: TASK-007
title: Forward limits on normal chat request in gateway dto/controller
status: done
priority: high
repo: be
epic: chat-agent-mode-be-refactor
complexity: 3
created-at: 2026-06-15T12:00:00.000Z
updated-at: 2026-06-15T16:39:15+03:00
started-at: 2026-06-15T16:34:28+03:00
completed-at: 2026-06-15T16:39:15+03:00
spec: .planning/work/chat-agent-mode-be-refactor/SPEC.md
---

## Description

Make the public chat edge carry safeguard limits on the ordinary request (no mode required).
The gateway DTO keeps the three optional limit fields and forwards them into the `AI_REQUEST`
Kafka payload; `mode` stays accepted-but-ignored for back-compat.

## Acceptance Criteria

- [ ] `ChatRequestDto` (`ai-platform/apps/api-gateway/src/ai/ai.dto.ts`) keeps optional
      positive-integer `maxIterations` / `tokenBudget` / `timeoutMs`; `mode` remains optional and
      validated but is no longer required to enable limits.
- [ ] `AiController.chat` forwards the limit fields into the `AI_REQUEST` value whenever present;
      omitting all of them publishes today's payload shape unchanged.
- [ ] Limits are honored regardless of `mode` (a request with limits and no `mode` still applies
      them).
- [ ] Invalid values (negative / non-integer) are rejected with 400.
- [ ] `nx test api-gateway` passes; `nx test shared api-gateway` green.

## Technical Notes

- Files: `ai-platform/apps/api-gateway/src/ai/ai.dto.ts`,
  `ai-platform/apps/api-gateway/src/ai/ai.controller.ts`.
- Most of this already exists from `chat-agent-mode-be` TASK-011 — the change is decoupling
  limit-forwarding from `mode` (limits apply on the normal request) and keeping `mode` tolerated.
- Keep the `AI_REQUEST` publish shape additive; ai-service reads limits optionally (TASK-006).
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the gateway DTO and controller changes that decouple safeguard-limit forwarding from `mode`. `ChatRequestDto` correctly keeps `mode` optional/validated (`@IsIn`) without gating, and `maxIterations`/`tokenBudget`/`timeoutMs` as optional positive integers; `AiController.chat` forwards each field additively via `!== undefined` guards so omitting all preserves today's payload shape, and limits are forwarded independently of `mode`. All five acceptance criteria are satisfied with thorough controller and DTO test coverage; no bugs, security issues, or convention violations found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

No affected tests found — no test coverage for this task. `nx affected --target=test --base=HEAD~1 --head=HEAD` reported "No tasks were run" (exit code 0). The HEAD~1..HEAD diff only touched a command markdown file, so no Nx projects were affected.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; api-gateway=UP, auth-service=DOWN (infra), ai-service=DOWN (infra). All three services compiled cleanly; the two DOWN services are non-blocking (missing local DB/Redis, not code defects).

All acceptance criteria verified:
- AC-1 (DTO keeps optional limits + non-gating optional `mode`): `ChatRequestDto` declares `mode` as `@IsOptional() @IsIn(['chat','agent'])` and `maxIterations`/`tokenBudget`/`timeoutMs` as `@IsOptional() @IsInt() @IsPositive()`; comment confirms `mode` does not gate limits. PASS.
- AC-2 (controller forwards limits when present, unchanged shape when omitted): `AiController.chat` builds the `AI_REQUEST` value additively with `!== undefined` guards per field; omitting all preserves today's payload. PASS.
- AC-3 (limits honored regardless of `mode`): forwarding is independent of `mode`; dto.spec test "accepts positive integer limits without a mode" confirms. PASS.
- AC-4 (invalid values rejected with 400): `@IsInt() @IsPositive()` rejects negative/zero/non-integer; dto.spec covers negative maxIterations, zero tokenBudget, non-integer timeoutMs. PASS.
- AC-5 (`nx test api-gateway` / `shared api-gateway` green): ran `nx run-many --target=test --projects=api-gateway,shared` — api-gateway 20/20 passed, shared passWithNoTests. PASS.

Note: the QA "no affected tests" line was a false negative from the HEAD~1 diff base (code changes are in the working tree, not that commit). The spec tests (`ai.dto.spec.ts`, `ai.controller.spec.ts`) exist and pass when run directly.
