---
phase: 3
slug: sub-agents
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-25
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — agent definition files; validation is structural inspection via grep |
| **Config file** | none |
| **Quick run command** | `ls .claude/agents/be-developer.md .claude/agents/fe-developer.md .claude/agents/code-reviewer.md .claude/agents/qa-be.md .claude/agents/qa-fe.md .claude/agents/team-lead-check.md 2>&1` |
| **Full suite command** | `grep -E "^name:" .claude/agents/{be-developer,fe-developer,code-reviewer,qa-be,qa-fe,team-lead-check}.md` |
| **Estimated runtime** | ~1 second |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite + grep checks must pass
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | AGENT-01 | — | be-developer cannot write outside ai-platform/ (system prompt enforcement) | structural | `grep -E "^tools: Glob,.+,Grep$" .claude/agents/be-developer.md` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | AGENT-02 | — | fe-developer cannot write outside ai-platform-fe/ (system prompt enforcement) | structural | `grep -E "^tools: Glob,.+,Grep$" .claude/agents/fe-developer.md` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | AGENT-03 | — | code-reviewer cannot invoke Write/Edit/Bash | structural | `grep "^disallowedTools:.*Write.*Edit.*Bash" .claude/agents/code-reviewer.md` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | AGENT-04 | — | qa-be has Glob first, Grep last, Bash included | structural | `grep -E "^tools: Glob,.+Bash.+,Grep$" .claude/agents/qa-be.md` | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 | 1 | AGENT-05 | — | qa-fe has Glob first, Grep last, Bash included | structural | `grep -E "^tools: Glob,.+Bash.+,Grep$" .claude/agents/qa-fe.md` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 1 | AGENT-06 | — | team-lead-check has no Bash in tools | structural | `grep "^tools:" .claude/agents/team-lead-check.md \| grep -v Bash` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- All 6 agent definition files must be created in `.claude/agents/` before structural verification commands can run.
- No test framework installation needed — all verification is grep-based.

*Existing infrastructure covers automated verification; Wave 0 consists of file creation in the plan tasks themselves.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| be-developer isolates to ai-platform/ at runtime | AGENT-01 | System prompt enforcement only verifiable by invoking agent | Invoke be-developer with a task that references ai-platform-fe/; verify it returns error receipt |
| fe-developer isolates to ai-platform-fe/ at runtime | AGENT-02 | Same as above | Invoke fe-developer with a task referencing ai-platform/; verify error receipt |
| code-reviewer emits APPROVED/CHANGES_REQUESTED structured output | AGENT-03 | Requires real invocation | Invoke code-reviewer on a sample task; verify output contains `## Code Review` section and `[code-reviewer] APPROVED` or `[code-reviewer] CHANGES_REQUESTED:` receipt |
| qa-be runs nx test in ai-platform/ subdir | AGENT-04 | Requires nx + git state | Run qa-be on a task with committed changes; verify `## QA Results` output |
| team-lead-check locates SPEC.md via epic fallback | AGENT-06 | Logic path verification | Run team-lead-check on a task; verify it reads the correct SPEC.md |

---

## Validation Sign-Off

- [ ] All tasks have structural grep verify or manual-only justification
- [ ] Sampling continuity: each wave has at least one automated check
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s for all automated checks
- [ ] `nyquist_compliant: true` set in frontmatter after executor confirms

**Approval:** pending
