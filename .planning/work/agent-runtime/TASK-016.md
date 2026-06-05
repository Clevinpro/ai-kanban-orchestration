---
id: TASK-016
title: Register /agent route in chat router
status: done
priority: high
repo: fe
epic: agent-runtime
complexity: 2
created-at: 2026-06-03T12:00:00Z
updated-at: 2026-06-03T12:00:00Z
started-at: null
completed-at: null
spec: .planning/work/agent-runtime/SPEC.md
---

## Description

Register the new `agent.tsx` page in the chat app router so `/agent` is reachable in the browser.

## Acceptance Criteria

- [ ] The `agent.tsx` route is registered in the chat router (`ai-platform-fe/apps/chat/src/router.ts`)
- [ ] `/agent` is reachable and renders the agent page
- [ ] `nx affected -t lint test` passes for ai-platform-fe

## Technical Notes

- Follow the existing TanStack Router registration pattern used for the chat routes in `ai-platform-fe/apps/chat/src/router.ts`.
- This task only wires routing — the page component is delivered by TASK-015.
- AC reference: AC-28.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the in-scope working-tree change: the `/agent` route registration in `ai-platform-fe/apps/chat/src/router.ts`. The change correctly imports `AgentPage` from `./routes/agent`, defines `agentRoute` with `path: '/agent'` under `rootRoute`, and adds it to `addChildren([...])` — matching the existing `chatRoute` pattern exactly. Verified the imported `AgentPage` component, the `useAgent` hook, and all consumed `@libs/ui` exports (`AgentSteps`, `BudgetIndicator`, `ToolCallList`) exist, so the route compiles. No bugs, security issues, or quality concerns in the registration. The page component and hook were delivered by prior tasks and are out of scope here.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

No affected tests found — no test coverage for this task. `nx affected --target=test --base=HEAD~1 --head=HEAD` ran with exit code 0 and reported no affected projects ("No tasks were run"). Per D-06, no affected tests is not a failure.

## TeamLead Check

Status: APPROVED

All acceptance criteria verified against SPEC AC-28:
- Task AC 1 (route registered in `ai-platform-fe/apps/chat/src/router.ts`): PASS — `agentRoute` defined with `path: '/agent'`, `component: AgentPage`, imported from `./routes/agent`, and added to `rootRoute.addChildren([indexRoute, chatRoute, agentRoute])`, matching the existing `chatRoute` pattern.
- Task AC 2 (`/agent` reachable and renders the agent page): PASS — `ai-platform-fe/apps/chat/src/routes/agent.tsx` exists and is wired as `AgentPage`; code review confirmed it and its consumed `@libs/ui` exports compile.
- Task AC 3 (`nx affected -t lint test` passes): PASS — QA reports exit code 0 with no affected projects (acceptable per D-06); code review APPROVED.
- SPEC AC-28 (new route registered so `/agent` is reachable): PASS.
