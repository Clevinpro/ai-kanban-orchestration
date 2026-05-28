---
phase: 4
slug: pipeline-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-25
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node (built-in assertions / shell scripts) |
| **Config file** | none — no test framework configured |
| **Quick run command** | `node .planning/work/*/TASK-*.md --dry-run` (manual inspection) |
| **Full suite command** | Manual pipeline run via `/team-lead:execute TASK-ID` |
| **Estimated runtime** | ~2-5 minutes per full pipeline run |

---

## Sampling Rate

- **After every task commit:** Verify task file state transitions are correct (status field)
- **After every plan wave:** Run a full pipeline pass on a test task
- **Before `/gsd:verify-work`:** Full pipeline must complete with all three success criteria met
- **Max feedback latency:** ~5 minutes

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | PIPE-01 | — | Pipeline completes without skipping stages | manual | manual (agent-dependent) | ❌ | ⬜ pending |
| 4-01-02 | 01 | 1 | PIPE-02 | — | Rejection loop returns to developer with evidence | manual | manual (agent-dependent) | ❌ | ⬜ pending |
| 4-01-03 | 01 | 1 | PIPE-03 | — | TLC rejects misaligned task, approves correct task | manual | manual (agent-dependent) | ❌ | ⬜ pending |
| 4-01-02a | 01 | 1 | D-06 | T-04-04 | Annotation-gated reverse transitions enforced by hook | unit | bash scripts/test-pipeline-guard.sh | ❌ (created by Plan 01 Task 2) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test task file at `.planning/work/test-pipeline/TASK-TEST.md` — used to exercise the full pipeline
- [ ] Confirm Phase 2 (agent skill files) and Phase 3 (execute.md orchestration) are complete before running

*Note: This phase requires existing infrastructure from Phase 2 and Phase 3 to be complete.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full pipeline run completes Developer→CodeReview→QA→TLC→Done | PIPE-01 | Requires Claude agents to run; no automated test harness | Run `/team-lead:execute TASK-TEST` and observe stage transitions |
| QA rejection loop fires on failing test | PIPE-02 | Requires deliberate test failure + agent re-run | Use a task with a known-failing acceptance criterion |
| TLC reject-and-return works correctly | PIPE-03 | Requires misaligned task vs SPEC + agent judgment | Use a task whose implementation diverges from SPEC.md |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
