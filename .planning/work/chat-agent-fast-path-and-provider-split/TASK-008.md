---
id: TASK-008
title: Add AiProviderFactory config-only dev-prod switch test and document env
status: done
priority: medium
repo: be
epic: chat-agent-fast-path-and-provider-split
complexity: 3
created-at: 2026-06-16T10:52:11Z
updated-at: 2026-06-16T19:16:11+03:00
started-at: 2026-06-16T19:03:35+03:00
completed-at: 2026-06-16T19:16:11+03:00
spec: .planning/work/chat-agent-fast-path-and-provider-split/SPEC.md
---

## Description

Lock in the provider split (Option C): switching the active provider between a
dev-local LLM (`ollama`/`lmstudio`) and a prod paid API (`claude`) must be a
config/env change only — no edits to `AiService` or loop logic.
`AiProviderFactory.getProvider()` already selects on the `AI_PROVIDER` config;
this task proves it with a factory test across all provider values and documents
the env switch.

## Acceptance Criteria

- [ ] `AiProviderFactory` test asserts that `AI_PROVIDER=claude` →
  `ClaudeProvider`, `ollama` → `OllamaProvider`, `lmstudio` → `LmStudioProvider`,
  driven only by config (`ConfigService`) with no business-logic change.
- [ ] An unsupported `AI_PROVIDER` value throws the existing error.
- [ ] Env switch is documented (e.g. `.env*` comment or the relevant env doc):
  dev = `ollama`/`lmstudio`, prod = `claude`.
- [ ] `nx test ai-service` passes.

## Technical Notes

- File: `ai-platform/apps/ai-service/src/ai/providers/ai-provider.factory.ts`
  and a co-located `ai-provider.factory.spec.ts`.
- The factory reads `configService.get<string>('AI_PROVIDER') ?? 'ollama'`; mock
  `ConfigService` per case. Do not branch in `AiService`.
- `IAIConfig.provider` (`claude | ollama | lmstudio`) in
  `ai-platform/libs/shared/src/lib/types/ai.types.ts` is the reference union.
- Two-tier (fast/strong) model selector is explicitly out of scope.
- Maps to AC-07.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; BOOT=[api-gateway:4000=UP, auth-service:4002=UP, ai-service:4001=UP]

All task acceptance criteria verified:
- `ai-provider.factory.spec.ts` parametrizes `AI_PROVIDER` via mocked `ConfigService` and asserts `claude` → `ClaudeProvider`, `ollama` → `OllamaProvider`, `lmstudio` → `LmStudioProvider`; unset defaults to `OllamaProvider` — config-only, no `AiService` branching.
- Unsupported value (`huggingface`) throws `Unsupported AI_PROVIDER: huggingface` — matches factory error contract.
- Dev/prod switch documented in `ai-platform/.env.example` lines 28–34: dev = `ollama` | `lmstudio`, prod = `claude`.
- `nx test ai-service` — 25 suites, 319 tests passed (independently confirmed).
- SPEC AC-07 satisfied: `AiService` resolves provider only via `factory.getProvider()` with no `AI_PROVIDER` / provider-name branching in loop logic.

