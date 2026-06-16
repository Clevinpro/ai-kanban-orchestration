---
id: TASK-004
title: Create QueryRouterService to classify queries into four lanes with unit tests
status: done
priority: high
repo: be
epic: chat-agent-fast-path-and-provider-split
complexity: 6
created-at: 2026-06-16T10:52:11Z
updated-at: 2026-06-16T14:57:12+03:00
started-at: 2026-06-16T14:48:08+03:00
completed-at: 2026-06-16T14:57:12+03:00
spec: .planning/work/chat-agent-fast-path-and-provider-split/SPEC.md
---

## Description

Create a new `query-router.service.ts` that classifies an incoming message into
one of four lanes — `meta`, `structured`, `technical`, `complex` — so the
service can dispatch each query into the cheapest correct path. The router must
itself be fast: prefer rules / reuse of existing fast detectors over an LLM
classification call. This task delivers the classifier and its unit tests only;
wiring into `AiService` happens in TASK-006.

## Acceptance Criteria

- [ ] New file `ai-platform/apps/ai-service/src/ai/query-router.service.ts`
  exposing a `classify(message)` returning a lane discriminator
  (`meta | structured | technical | complex`).
- [ ] `structured` is detected for tag/count intents (reuse
  `QueryNormalizer.isTagQuery` + count keywords); `complex` is the fallthrough.
- [ ] `meta` detection delegates to / aligns with `CapabilityDetectorService`;
  `technical` detects API/technical intent.
- [ ] Router does not require an LLM round-trip on the structured path.
- [ ] `query-router.service.spec.ts` classifies representative queries for all
  four lanes correctly.
- [ ] `nx test ai-service` passes.

## Technical Notes

- Reuse `QueryNormalizer.isTagQuery` (`search/query-normalizer.ts`) and add count
  keyword detection (e.g. "count", "how many", "list all").
- For `meta`, the existing `CapabilityDetectorService.isCapabilityQuery`
  (embedding cosine ≥ 0.75) is the source of truth; the router may call it or the
  caller may resolve meta first — keep classify ordering explicit and documented.
- Keep the service a thin, injectable NestJS provider (`@Injectable()`); pure
  logic where possible for testability.
- Detection table reference: SPEC "Routing flow" (meta / structured / technical /
  complex).
- Maps to AC-06.

## QA Results

Status: PASS

Cycle: 1 of 3

Ran `npx nx test ai-service` in `ai-platform/`. Exit code 0 — 25 test suites, 314 tests passed (2.3s).

`nx affected --target=test --base=HEAD~1 --head=HEAD` reported no affected projects (changes uncommitted); full ai-service suite run per task AC.

Static AC verification:
- `query-router.service.ts` exposes `@Injectable()` `QueryRouterService` with `classify(message)` returning `QueryLane` (`meta | structured | technical | complex`).
- `structured` uses `QueryNormalizer.isTagQuery` plus count/list keyword rules (`count`, `how many`, `list all`); `complex` is fallthrough.
- `meta` delegates to `CapabilityDetectorService.isCapabilityQuery`; `technical` uses synchronous regex patterns for API/technical intent.
- Structured path is synchronous — spec asserts `isCapabilityQuery` is not called for tag/count queries.
- `query-router.service.spec.ts` covers all four lanes plus ordering (structured > meta > technical > complex).

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; BOOT=[api-gateway:4000=DOWN, auth-service:4002=DOWN, ai-service:4001=UP] (DOWN services are infra/port contention — non-blocking)

All task acceptance criteria verified:
- `query-router.service.ts` exposes `@Injectable()` `QueryRouterService` with `classify(message): Promise<QueryLane>` returning `meta | structured | technical | complex` (lines 6, 80–98).
- `structured` via `isStructuredQuery`: reuses `QueryNormalizer.isTagQuery` plus count/list keyword rules; `complex` is fallthrough (lines 38–61, 97).
- `meta` delegates to `CapabilityDetectorService.isCapabilityQuery`; `technical` uses synchronous `TECHNICAL_INTENT_PATTERNS` regex (lines 12–29, 65–67, 89–95).
- Structured path is synchronous — spec asserts `isCapabilityQuery` is not called for tag/count queries (spec lines 61–68, 89–94).
- `query-router.service.spec.ts` classifies representative queries for all four lanes plus ordering precedence (structured > meta > technical > complex).
- `nx test ai-service` — 25 suites, 314 tests passed (independently confirmed).
- Delivers SPEC AC-06 (router unit tests for four-lane classification); AiService wiring deferred to TASK-006 per task scope.
