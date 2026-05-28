---
phase: 3
slug: 03-sub-agents
status: verified
threats_open: 0
asvs_level: 1
created: 2026-05-25
---

# Phase 3 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| system prompt → sub-repo filesystem | Agent instructed to restrict writes to one sub-repo; enforcement is prompt-only (no filesystem sandbox) | Task file content, source code writes |
| agent output → orchestrator receipt parser | execute.md greps final output line for signal word; malformed output could mislead orchestrator | One-line receipt string |
| code-reviewer output → task file (via orchestrator) | code-reviewer cannot write directly; output parsed by Phase 4 execute.md for review block | Code review text, APPROVED/CHANGES_REQUESTED signal |
| qa agent → task file body | QA agents write directly via Edit; hook validates any status: field in the edit | QA result block, Status: annotation |
| qa agent → sub-repo filesystem | QA agents run Bash in sub-repos; must not run nx outside sub-repo directory | nx test output |
| team-lead-check → SPEC.md filesystem | Agent reads SPEC.md at path from spec: field; path is user-supplied via /team-lead:plan | SPEC.md contents, acceptance criteria |
| team-lead-check annotation → task file body | Agent writes ## TeamLead Check block via Edit; hook validates for lowercase status: patterns | Approval/rejection text |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-01-01 | Tampering | be-developer system prompt | mitigate | Hard STOP clause explicitly names ai-platform-fe/ as forbidden; error receipt `[be-developer] ERROR` encodes violation for orchestrator | closed |
| T-03-01-02 | Tampering | fe-developer system prompt | mitigate | Hard STOP clause names ai-platform/ as forbidden; error receipt `[fe-developer] ERROR` encodes violation | closed |
| T-03-01-03 | Spoofing | agent name: field | mitigate | name: must match execute.md subagent_type exactly (hyphens, lowercase); verified by grep `^name: be-developer$` acceptance criterion | closed |
| T-03-01-04 | Elevation of Privilege | tools: array ordering | mitigate | Glob at position 1, Grep at last position — verified by grep -E `^tools: Glob,.+,Grep$` (bug #60237) | closed |
| T-03-01-05 | Repudiation | receipt protocol | mitigate | Receipt line is the final output — orchestrator parses deterministically; agent system prompt instructs exact format | closed |
| T-03-02-01 | Tampering | code-reviewer disallowedTools | mitigate | `disallowedTools: Write, Edit, Bash` declaratively blocks all file writes at runtime; no `tools:` allowlist field present | closed |
| T-03-02-02 | Tampering | QA body annotation — hook evasion | mitigate | System prompt instructs capitalized `Status:` (capital S) in ## QA Results block; task-state-guard.js regex is case-sensitive lowercase-only | closed |
| T-03-02-03 | Elevation of Privilege | qa-be running nx outside sub-repo | mitigate | System prompt mandates explicit `cd ai-platform/` before any nx invocation; workspace root has no nx.json — wrong directory fails immediately | closed |
| T-03-02-04 | Elevation of Privilege | qa-fe running nx outside sub-repo | mitigate | `cd ai-platform-fe/` mandated; explicit `--base=HEAD~1 --head=HEAD` prevents over-wide test scope | closed |
| T-03-02-05 | Spoofing | receipt format mismatch | mitigate | System prompts encode exact receipt strings; execute.md greps for signal word in `[agent-name] SIGNAL` format | closed |
| T-03-02-06 | Tampering | code-reviewer REVIEW-BLOCK delimiters | mitigate | `---REVIEW-BLOCK-START---` / `---REVIEW-BLOCK-END---` delimiters are unusual enough that task file content is unlikely to contain them naturally | closed |
| T-03-03-01 | Tampering | team-lead-check body annotation (hook evasion) | mitigate | System prompt mandates capitalized `Status:` in ## TeamLead Check block; task-state-guard.js hook regex is case-sensitive lowercase-only; verified by grep | closed |
| T-03-03-02 | Spoofing | spec: field path injection | mitigate | team-lead-check reads spec: from task frontmatter (written by plan.md from $ARGUMENTS); no shell expansion; read-only Glob lookup | closed |
| T-03-03-03 | Repudiation | team-lead-check missing SPEC.md | mitigate | Explicit rejection receipt `[team-lead-check] REJECTED: spec field missing from task file` — orchestrator surfaces to user rather than silently failing | closed |
| T-03-03-04 | Tampering | spec: field absent in old tasks | mitigate | Fallback: if spec: absent, glob `.planning/work/<epic>/SPEC.md` using epic: field value | closed |
| T-03-03-05 | Tampering | plan.md schema extension — overwrite risk | mitigate | Both task-schema.yaml and plan.md edits use narrow Edit (old_string) rather than full file rewrites; lifecycle: section and command frontmatter preserved | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-25 | 16 | 16 | 0 | Claude (gsd-security-auditor inline) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-25
