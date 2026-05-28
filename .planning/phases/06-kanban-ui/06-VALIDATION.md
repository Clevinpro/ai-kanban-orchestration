---
phase: 6
slug: kanban-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-26
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual — browser UI phase; automated tests out of scope for MVP |
| **Config file** | none |
| **Quick run command** | `open http://localhost:5173` (dev) or `open http://localhost:6111` (prod) |
| **Full suite command** | Manual checklist against SC-1 through SC-4 |
| **Estimated runtime** | ~2 minutes |

---

## Sampling Rate

- **After every task commit:** Open browser, verify primary flow for implemented component
- **After every plan wave:** Full manual checklist against wave acceptance criteria
- **Before `/gsd:verify-work`:** Full suite must pass (all SC-1 through SC-4)
- **Max feedback latency:** ~120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| PATCH endpoint | 01 | 1 | KANBAN-04 | manual-smoke | `curl -X PATCH http://localhost:6111/tasks/TASK-001/status -H "Content-Type: application/json" -d '{"status":"done"}'` | ⬜ pending |
| CORS PATCH | 01 | 1 | D-06 | manual-smoke | `curl -X OPTIONS http://localhost:6111/tasks/TASK-001/status -H "Access-Control-Request-Method: PATCH" -v` | ⬜ pending |
| Invalid status 400 | 01 | 1 | D-05 | manual-smoke | `curl -X PATCH http://localhost:6111/tasks/TASK-001/status -d '{"status":"notValid"}' -v` | ⬜ pending |
| Vite client setup | 02 | 1 | KANBAN-01 | manual-smoke | `cd kanban-server && npm run dev` — board loads at localhost:5173 | ⬜ pending |
| SSE live updates | 03 | 2 | KANBAN-02 | manual-smoke | Edit task file status; verify card moves within 1s | ⬜ pending |
| Drag-and-drop | 03 | 2 | KANBAN-04 | manual-smoke | Drag card to new column; verify task file frontmatter updated | ⬜ pending |
| Card fields | 03 | 2 | KANBAN-03 | manual-smoke | Verify title, complexity, repo, epic all visible on card | ⬜ pending |
| Optimistic revert | 03 | 2 | KANBAN-04 | manual-smoke | Kill server mid-drag; verify card reverts to original column | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

*This phase creates new files (kanban-server/client/) — no pre-existing test stubs to create. Manual smoke tests are sufficient for MVP scope.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Six columns visible at 1440px without horizontal scroll | KANBAN-01 | Browser layout — no automated assertion | Open board at 1440px viewport; verify all 6 column headers visible |
| SSE card moves live on file change | KANBAN-02 | Browser EventSource behavior | Edit task file status in terminal; verify card moves in <1s |
| Card displays title, complexity, repo, epic | KANBAN-03 | Visual rendering | Inspect a rendered card for all 4 fields |
| Drag card → task file status updated | KANBAN-04 | Browser drag interaction + file I/O | Drag card; `cat` the task file to verify `status:` updated |
| PATCH failure reverts card | KANBAN-04 | Network error simulation | Stop server; drag card; verify card returns to source column |

---

## Validation Sign-Off

- [ ] All tasks have manual smoke test or curl command in map above
- [ ] Sampling continuity: browser check after each plan wave
- [ ] Wave 0: N/A — no automated test infrastructure needed for browser MVP
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter when sign-off complete

**Approval:** pending
