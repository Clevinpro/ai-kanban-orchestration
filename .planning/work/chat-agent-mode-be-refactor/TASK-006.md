---
id: TASK-006
title: Unify /ai/chat path — remove mode duality, rename runChatFlow, apply defaults
status: done
priority: high
repo: be
epic: chat-agent-mode-be-refactor
complexity: 6
created-at: 2026-06-15T12:00:00.000Z
updated-at: 2026-06-15T16:34:08+03:00
started-at: 2026-06-15T16:26:15+03:00
completed-at: 2026-06-15T16:34:08+03:00
spec: .planning/work/chat-agent-mode-be-refactor/SPEC.md
---

## Description

Collapse the `mode: 'chat' | 'agent'` duality so the single `/ai/chat` flow always runs the
bounded tool-use loop. Remove the agent-vs-RAG branch in `processMessage`, rename the loop
entry to `runChatFlow`, and apply default safeguard limits when the request omits them so plain
questions behave as before.

## Acceptance Criteria

- [ ] `processMessage` no longer branches on `payload.mode`; it routes every request to the
      unified loop entry (`runChatFlow`, renamed from `runAgentFlow`).
- [ ] `runRagFlow`'s single-shot agent-branch split is removed/folded; the loop (with the RAG
      tool registered) is the one chat path. The model may answer directly (zero tool calls) or
      call the RAG tool.
- [ ] Default limits (`DEFAULT_MAX_ITERATIONS` / `DEFAULT_TOKEN_BUDGET` / `DEFAULT_TIMEOUT_MS`)
      apply when the request omits them; an omitted/`'chat'`/`'agent'` `mode` all behave
      identically (field ignored).
- [ ] A plain question with no limits returns a sensible answer within defaults (regression for
      SPEC AC-04 / behavior parity).
- [ ] `nx test ai-service` passes; smoke boot of ai-service is UP.

## Technical Notes

- File: `ai-platform/apps/ai-service/src/ai/ai.service.ts` (`processMessage` ~line 89-114,
  `runAgentFlow` ~line 178).
- Capability path (SPEC Open Question): keep `CapabilityDetectorService` as an optional pre-step
  that short-circuits to `answerCapabilityQuery`, otherwise run the unified loop — preserve
  current capability behavior; do not delete it in this task.
- `mode` stays accepted-but-ignored (per TASK-003 decision); do not throw on it.
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the unified `/ai/chat` refactor across `ai.service.ts`, `ai.module.ts`, `ai.types.ts`, and `ai.service.spec.ts`. All five acceptance criteria are satisfied: `processMessage` no longer branches on `mode` and routes every non-capability request to the renamed `runChatFlow`; the RAG single-shot branch is folded into the bounded loop via the `ToolRegistry`; defaults (`DEFAULT_MAX_ITERATIONS`/`DEFAULT_TOKEN_BUDGET`/`DEFAULT_TIMEOUT_MS`) are applied through `clampPositiveInt` when limits are omitted; and `mode` is accepted-but-ignored (deprecated in `AgentRunConfig`, not branched on). The capability pre-step is preserved as required. Streaming/final-token forwarding avoids duplicate emission (the `finalStreamingStarted` guard), user-message persistence paths are mutually exclusive with no double-save, token budget is enforced at `track()` time, and the kill-switch stacking handles concurrent same-conversation runs correctly. Comments are English-only per CLAUDE.md. Test coverage maps directly to the ACs including the plain-question parity regression. Note: `nx test ai-service` and the smoke boot (AC-05) were not executed here (read-only review) and remain for the QA stage.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

No affected tests found — no test coverage for this task. `nx affected --target=test --base=HEAD~1 --head=HEAD` reported no affected projects (HEAD~1..HEAD diff contains only `.claude/commands/team-lead/execute.md`, which belongs to no Nx project). Exit code 0.

## TeamLead Check

Status: APPROVED

Smoke boot (be): BUILD_OK; ai-service=UP, api-gateway=DOWN (infra), auth-service=DOWN (infra). ai-service is the service in scope for this task and started cleanly; the other two DOWN are non-blocking infra warnings.

Note: QA's nx-affected ran HEAD~1..HEAD and missed the uncommitted working-tree changes (it reported "no affected projects"). I verified all ACs directly against the working tree (`git diff -- ai-platform/`) and re-ran `nx test ai-service` = 287 passed / 23 suites.

All acceptance criteria verified:
- AC-1 (no mode branch; routes to renamed `runChatFlow`): PASS — `processMessage` dropped the `if (payload.mode === 'agent')` branch; every non-capability request routes to `runChatFlow` (renamed from `runAgentFlow`).
- AC-2 (`runRagFlow` single-shot folded into the loop): PASS — `runRagFlow` deleted; the bounded loop with the registry-resolved RAG tool is the single chat path. Model may answer directly (zero tool calls, FINAL on turn 1) or dispatch the RAG tool.
- AC-3 (defaults applied when omitted; mode ignored): PASS — `clampPositiveInt(r.*, DEFAULT_MAX_ITERATIONS|DEFAULT_TOKEN_BUDGET|DEFAULT_TIMEOUT_MS)` applies defaults; `mode` is accepted-but-ignored (no longer read/thrown on; `AgentRunConfig.mode` marked optional/deprecated in ai.types.ts).
- AC-4 (plain-question parity regression): PASS — spec test "a plain question with no mode and no limits answers directly within defaults (behavior parity)" asserts one planning turn, zero tool dispatch, defaults in the budget snapshot; capability-bypass test also present.
- AC-5 (`nx test ai-service` passes; ai-service UP): PASS — 287 tests pass; smoke boot ai-service=UP.
