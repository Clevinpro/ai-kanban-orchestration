---
id: TASK-001
title: Test
status: done
priority: low
repo: be
epic: test-epic
complexity: 1
created-at: 2026-01-01T00:00:00.000Z
updated-at: 2026-05-26T20:31:43.888Z
started-at: 2026-01-01T00:00:00.000Z
completed-at: 2026-05-28T21:44:12+03:00
---

---REVIEW-BLOCK-START---
## Code Review

Status: CHANGES_REQUESTED

**Issues:**
- kanban-server/client/src/App.jsx:15,22-27 — `taskUid(task)` is called unconditionally before checking `task.deleted`. The server's `unlink` event emits `{ id: ..., deleted: true }` with no `epic` field (index.js line 345), so `taskUid` returns `"undefined/TASK-NNN"`. The filter on line 25 never matches any real task uid (which is `"<epic>/TASK-NNN"`), so deleted tasks are never removed from the board. Fix: guard with `if (task.deleted)` before calling `taskUid`, or emit `epic` in the unlink event from the server. BLOCKER
- kanban-server/index.js:295 — `require('child_process')` is called inside the request handler on every `inProgress` drag. Move to the top-level requires block. WARNING
- kanban-server/client/src/components/TaskCard.jsx:19 — `task.repo.toUpperCase()` will throw if `task.repo` is undefined or null (e.g., a task file missing the `repo` frontmatter field). Add a guard such as `(task.repo ?? '').toUpperCase()`. WARNING

The deleted-task path in `boardReducer` is broken — `uid` is constructed from an undefined `epic` and the filter never matches, leaving stale task cards on the board indefinitely. The other two issues are robustness/style warnings. Overall code quality is good; the drag-and-drop wiring, SSE reconnect logic, and server-side input validation are well-implemented.
---REVIEW-BLOCK-END---

---REVIEW-BLOCK-START---
## Code Review (cycle 2)

Status: APPROVED

All three issues from cycle 1 are resolved. The `unlink` event in `kanban-server/index.js` line 344 now emits the `epic` field via `path.basename(path.dirname(f))`, fixing the BLOCKER. The `child_process` require is top-level at line 15. The `task.repo ?? ''` nullish-coalescing guard is present in `TaskCard.jsx` line 19. No new issues were introduced.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

No affected tests found — no test coverage for this task.

## TeamLead Check

Status: REJECTED

**Reason:** No SPEC.md found for epic `test-epic` — searched at `.planning/work/test-epic/SPEC.md`. Without a spec, acceptance criteria cannot be verified.

## QA Results

Status: PASS

No affected tests found — no test coverage for this task.

## TeamLead Check

Status: APPROVED

No SPEC.md exists for epic `test-epic` and the task carries no Description or Acceptance Criteria — this is a test pipeline task. Judgment call: code review was APPROVED on cycle 2 (all three issues including the BLOCKER resolved) and QA passed twice. No criteria exist to reject against. Pipeline verified as functional.
