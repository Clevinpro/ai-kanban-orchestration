# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-20
**Phase:** 1-Foundation
**Areas discussed:** Root CLAUDE.md approach, Sub-repo path isolation rules, Status transition enforcement, Task schema completeness

---

## Root CLAUDE.md Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Rewrite from scratch | Replace all content with a clean constitution | ✓ |
| Trim in-place | Edit existing, remove stack/framework details | |
| Keep existing, add constitution block | Prepend a cross-repo section at the top | |

**Q2 — Primary purpose:**

| Option | Description | Selected |
|--------|-------------|----------|
| Hard routing rules only | Which sub-repo to touch, which CLAUDE.md to read next | ✓ |
| Routing + project identity | Routing + concise project summary | |
| Routing + shared constraints | Routing + cross-cutting constraints for all agents | |

**Q3 — GSD workflow enforcement:**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, keep it | GSD enforcement is critical for Claude Code sessions | |
| No, remove it | GSD rules are meta-tooling, not project rules | ✓ |

**Q4 — Explicit references:**

| Option | Description | Selected |
|--------|-------------|----------|
| Sub-repo CLAUDE.md files only | Points to BE and FE CLAUDE.md files | |
| Sub-repo CLAUDE.md + .planning/ structure | Also references task files and agent entry points | ✓ |

**Notes:** User wants a minimal routing document. The existing root CLAUDE.md is a GSD workflow guide that shouldn't be part of the project's agent system contract.

---

## Sub-Repo Path Isolation Rules

**Q1 — Enforcement mechanism:**

| Option | Description | Selected |
|--------|-------------|----------|
| System prompt only | Strong imperative text | |
| System prompt + forbidden paths list | Instruction + explicit NEVER list | |
| System prompt + allowed paths only | Allowlist — list what's permitted | ✓ |

**Q2 — Existing ai-platform/CLAUDE.md:**

| Option | Description | Selected |
|--------|-------------|----------|
| Add isolation rules on top, keep existing content | Prepend isolation section | |
| Rewrite to isolation-first | Isolation primary, move conventions elsewhere | ✓ (with note) |

**User's choice:** Rewrite to isolation-first AND move existing NestJS conventions to `.claude/skills/` files.

**Q3 — Where conventions live:**

| Option | Description | Selected |
|--------|-------------|----------|
| .claude/skills/ file per sub-repo | Skills loaded explicitly by agents | ✓ |
| Inline in agent definition files | Conventions in agent definitions (Phase 3) | |
| Keep in sub-repo CLAUDE.md but shorter | Condensed conventions section | |

**Notes:** User wants the sub-repo CLAUDE.md files to be pure isolation contracts. Tech conventions belong in skills that agents can load on demand.

---

## Status Transition Enforcement

**Q1 — Transition rules location:**

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded in hook | Transition map inline in hook file | |
| Schema-driven (task-schema.yaml) | Hook reads YAML at runtime | |
| Both: schema as reference + hook inline | Accept duplication for readability + performance | ✓ |

**Q2 — Invalid transition behavior:**

| Option | Description | Selected |
|--------|-------------|----------|
| Block with error (exit non-zero) | Agent sees error, must revert manually | |
| Warn but allow (log + continue) | Advisory only | |
| Revert + error | Hook reverts frontmatter to git HEAD state + exits non-zero | ✓ |

**Q3 — Previous status source:**

| Option | Description | Selected |
|--------|-------------|----------|
| Git (git show HEAD:path/to/file) | Read last committed version | ✓ |
| In-memory .task-state cache file | .state-cache.json maintained by hook | |
| File itself (value-only guard) | Only check if new status is any valid value | |

**Q4 — Hook trigger scope:**

| Option | Description | Selected |
|--------|-------------|----------|
| Edits only | New files start at readyForDevelop by convention | |
| Creates + edits | Validate both new files and edits | ✓ |

**Notes:** Revert+error makes invalid transitions self-healing from the agent's perspective. Git as source means the previous state must have been committed — this creates an implicit contract that TeamLead commits tasks before agents pick them up.

---

## Task Schema Completeness

**Q1 — Optional fields:**

| Option | Description | Selected |
|--------|-------------|----------|
| epic only | 7 required, epic optional | |
| epic + complexity | 6 required, 2 optional | |
| All fields required at creation | All 9 fields required | ✓ |

**Q2 — repo: both handling:**

| Option | Description | Selected |
|--------|-------------|----------|
| Disallow repo: both — split into two tasks | Cleaner pipeline isolation | ✓ |
| Allow repo: both — sequential spawn | BE then FE, one task | |
| Allow repo: both — parallel spawn | Both agents simultaneously | |

**Q3 — updated-at maintenance:**

| Option | Description | Selected |
|--------|-------------|----------|
| Same PostToolUse hook as status guard | One hook, two responsibilities | ✓ |
| Agents maintain it manually | Each agent updates the timestamp | |
| Separate PostToolUse hook | Two hooks, cleaner separation | |

**Q4 — Task ID and file location:**

| Option | Description | Selected |
|--------|-------------|----------|
| TASK-01.md in .planning/work/ (flat, 2-digit) | Simple flat structure | |
| TASK-001.md in .planning/work/ (flat, 3-digit) | Flat, handles 999+ tasks | |
| TASK-001.md in .planning/work/<epic>/ | Organized by epic | ✓ |

**Notes:** All-required forces TeamLead completeness. No repo:both enforces clean isolation (matches the isolation-first direction). Epic-organized directories align with task IDs being namespaced under their epic.

---

## Claude's Discretion

- Exact wording of isolation instructions in sub-repo CLAUDE.md files
- YAML schema format in `task-schema.yaml`
- Hook implementation language (likely Node.js to match existing hooks pattern)
- YAML frontmatter parsing approach in hook

## Deferred Ideas

None — discussion stayed within Phase 1 scope.
