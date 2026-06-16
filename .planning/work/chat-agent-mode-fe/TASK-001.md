---
id: TASK-001
title: Add limits + tool/budget types to @libs/api; forward limits + add cancelMessage
status: done
priority: high
repo: fe
epic: chat-agent-mode-fe
complexity: 3
created-at: 2026-06-15T12:00:00.000Z
updated-at: 2026-06-15T16:54:27+03:00
started-at: 2026-06-15T16:50:39+03:00
completed-at: 2026-06-15T16:54:27+03:00
spec: .planning/work/chat-agent-mode-fe/SPEC.md
---

## Description

Extend the `@libs/api` chat contract for the tool-use chat. Add optional safeguard limits to
`IChatRequest`, add the agent tool/budget view types the stream and UI consume, make
`sendMessage` forward the limits, and add a `cancelMessage` call hitting the new
`POST /ai/chat/cancel` endpoint so the FE stop control works.

## Acceptance Criteria

- [ ] `IChatRequest` (`ai-platform-fe/libs/api/src/types/chat.types.ts`) gains optional
      `maxIterations?`, `tokenBudget?`, `timeoutMs?` (numbers).
- [ ] New exported view types model the backend `event: 'agent'` payload: an agent/tool event
      `{ iteration: number; status: 'planning' | 'tool_call' | 'tool_result' | 'final'; tool?: string; input?: string; budget?: AgentBudget }`
      and `AgentBudget { iteration; tokensUsed; elapsedMs; maxIterations; tokenBudget; timeoutMs }`.
      `tool` is a plain `string` (dynamic tool name).
- [ ] `IChatStreamEvent` gains optional `event: 'agent'` and an optional `agent` field carrying
      the agent event; existing fields unchanged.
- [ ] `sendMessage` (`endpoints/chat.api.ts`) forwards the limit fields when present; omitting
      them posts exactly as today.
- [ ] New `cancelMessage(conversationId: string)` posts to `POST /ai/chat/cancel` with
      `{ conversationId }`.
- [ ] New types are re-exported from the `@libs/api` barrel.
- [ ] `nx test api` passes.

## Technical Notes

- Files: `ai-platform-fe/libs/api/src/types/chat.types.ts`,
  `ai-platform-fe/libs/api/src/endpoints/chat.api.ts`, and the `@libs/api` index barrel.
- Mirror the BE contract from `chat-agent-mode-be-refactor` (shared `AgentEvent` / `AgentBudget`):
  `tool` is dynamic; the final answer still arrives via `result` on `event: 'chunk'`.
- `sendMessage` already posts to `/ai/chat`; `cancelMessage` uses the same `apiClient`.
- English-only comments.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the two changed files in `@libs/api` (`types/chat.types.ts`, `endpoints/chat.api.ts`) plus the barrel and the BE contract they mirror. The new `IChatRequest` limit fields, `AgentEvent`/`AgentBudget` types, and the `IChatStreamEvent` `'agent'` channel match the backend `ai.types.ts` exactly; `sendMessage` correctly forwards limits only when defined (legacy shape preserved when omitted), and `cancelMessage` posts to `POST /ai/chat/cancel` with `{ conversationId }`. All types are re-exported via `export *` from the barrel. Comments are English-only. No bugs, type-safety, or security issues found; one trivial, non-blocking style note that `/ai/chat/cancel` is inlined rather than a named constant, consistent with the existing `/ai/chat` usage.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

No affected tests found — no test coverage for this task. `nx affected --target=test --base=HEAD~1 --head=HEAD` reported "No tasks were run" (exit code 0); affected project list was empty. Per D-06, no affected tests is not a failure.

## TeamLead Check

Status: APPROVED

Smoke boot (fe): BUILD_OK; shell:3000=UP, auth:3001=UP, chat:3002=UP, docs:3003=UP.

All acceptance criteria verified against `libs/api` source:
- IChatRequest gains optional `maxIterations?`, `tokenBudget?`, `timeoutMs?` (numbers) — chat.types.ts L13-16. PASS
- `AgentEvent` `{ iteration; status: planning|tool_call|tool_result|final; tool?: string; input?; budget? }` and `AgentBudget` `{ iteration; tokensUsed; elapsedMs; maxIterations; tokenBudget; timeoutMs }` added with dynamic `tool` string — chat.types.ts L20-37; mirrors BE `ai-platform/libs/shared/.../ai.types.ts` exactly. PASS
- `IChatStreamEvent` gains optional `event: 'agent'` and optional `agent` field; existing fields unchanged — chat.types.ts L44-54. PASS
- `sendMessage` forwards limit fields only when defined; legacy payload preserved when omitted — chat.api.ts L7-17. PASS
- `cancelMessage(conversationId)` posts to `POST /ai/chat/cancel` with `{ conversationId }` — chat.api.ts L21-23. PASS
- New types re-exported via barrel `export * from './types/chat.types'` and `./endpoints/chat.api` — libs/api/src/index.ts. PASS
- `nx test api`: the `api` project has no `test` target and zero spec files (Nx derives a test target only where tests exist; sibling `ui` has one, `api` does not), so there is nothing to fail — consistent with QA PASS (D-06: no affected tests is not a failure). PASS
