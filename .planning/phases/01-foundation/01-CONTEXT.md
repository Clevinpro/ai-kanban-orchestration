# Phase 1: Foundation - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the structural contract that all six phases build on: the task file schema and directory layout, the three-layer CLAUDE.md hierarchy (root constitution → BE isolation → FE isolation), the status lifecycle enforcement hook, and the machine-readable task schema. No features, no pipeline logic — only the foundational files every downstream phase reads.

</domain>

<decisions>
## Implementation Decisions

### Root CLAUDE.md

- **D-01:** Rewrite the root CLAUDE.md from scratch. Replace all existing content (the current file is a GSD workflow guide, not a project constitution).
- **D-02:** Purpose is hard routing rules only — no tech stack details, no NestJS patterns, no React conventions. Those live in sub-repo CLAUDE.md files and skills.
- **D-03:** Do NOT include a GSD workflow enforcement section in the rewritten root CLAUDE.md.
- **D-04:** Root CLAUDE.md must explicitly reference: (1) `ai-platform/CLAUDE.md` for BE, (2) `ai-platform-fe/CLAUDE.md` for FE, (3) `.planning/work/<epic>/` for task files, (4) `/team-lead:plan` and `/team-lead:execute` as the agent workflow entry points.

### Sub-Repo Path Isolation

- **D-05:** Use an allowlist (not blocklist) approach in sub-repo CLAUDE.md files. List what agents ARE ALLOWED to touch, not what's forbidden.
- **D-06:** Rewrite `ai-platform/CLAUDE.md` isolation-first. Isolation/allowlist section is the primary content. Existing NestJS conventions are removed from this file.
- **D-07:** NestJS/BE conventions move to `ai-platform/.claude/skills/be-conventions/SKILL.md`. Agents load them explicitly, not always.
- **D-08:** Create `ai-platform-fe/CLAUDE.md` fresh, isolation-first (same pattern as BE). FE conventions go to `ai-platform-fe/.claude/skills/fe-conventions/SKILL.md`.

### Status Transition Enforcement

- **D-09:** Two artifacts: (1) `.planning/task-schema.yaml` documents the transition map for agents/humans; (2) the PostToolUse hook hardcodes the same transitions inline. Duplication is intentional — schema for readability, hook for performance (no file read in hot path).
- **D-10:** On invalid transition: hook reverts the task file frontmatter to the previous valid status (read from `git show HEAD:<path>`) and exits non-zero. The edit is undone; Claude Code surfaces the error to the agent.
- **D-11:** Previous status source = git. Use `git show HEAD:<relative-path-to-task-file>` to read the last committed version and extract the status field.
- **D-12:** Hook fires on both creates (new task files) AND edits to existing task files in `.planning/work/`.
- **D-13:** New task files must have `status: readyForDevelop` at creation time. Any other initial status is rejected.

### Task File Schema

- **D-14:** All YAML frontmatter fields are required at creation time: `id`, `title`, `status`, `priority`, `repo`, `epic`, `complexity`, `created-at`, `updated-at`. No optional fields.
- **D-15:** `repo: both` is disallowed. TeamLead must split full-stack work into separate BE (`repo: be`) and FE (`repo: fe`) tasks. The hook rejects any task file with `repo: both`.
- **D-16:** `updated-at` is maintained by the same PostToolUse hook that validates status transitions. Agents do not need to set it manually — the hook injects the current ISO timestamp on every valid write.
- **D-17:** Task ID format: three-digit zero-padded (e.g., `TASK-001`). Accommodates projects with more than 99 tasks.
- **D-18:** Task files are organized by epic: `.planning/work/<epic-name>/TASK-001.md`. The epic field in frontmatter must match the directory name.

### Claude's Discretion

- Exact wording of isolation instructions in sub-repo CLAUDE.md files (beyond the allowlist structure)
- YAML schema format in `task-schema.yaml` (can be YAML or JSON, whichever is cleaner)
- Hook implementation language (Node.js to match existing `.claude/hooks/*.js` pattern)
- How the hook parses YAML frontmatter (can use a minimal regex or a yaml library)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Foundation
- `.planning/REQUIREMENTS.md` — FOUND-01 through FOUND-07 (exact field names, lifecycle states, success criteria)
- `.planning/ROADMAP.md` — Phase 1 goal and success criteria (success conditions that verification checks)
- `.planning/PROJECT.md` — Key decisions: agents-per-repo isolation, markdown task files, pipeline entry points

### Existing Files to Rewrite
- `CLAUDE.md` — Current root CLAUDE.md (read before rewriting to understand what exists)
- `ai-platform/CLAUDE.md` — Current BE CLAUDE.md (read before rewriting)

### Existing Infrastructure
- `.claude/hooks/` — Existing GSD hook files (new task-state hook must follow the same pattern as existing `.js` hooks)
- `.planning/codebase/STRUCTURE.md` — Filesystem layout (where files live, naming conventions)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.claude/hooks/*.js` — All existing hooks are Node.js scripts. The new PostToolUse hook for task-state validation should follow the same pattern (shebang, `process.stdin` read, JSON parse of hook payload, `process.exit(1)` for rejection).

### Established Patterns
- `.claude/hooks/gsd-validate-commit.sh` — Shows hook pattern: read stdin, validate, exit 0 or 1 with error message to stderr.
- `ai-platform/CLAUDE.md` — Lean CLAUDE.md precedent: bullet-point rules, no prose, no fluff. The rewritten files should match this density.

### Integration Points
- `.planning/work/` — Must be created by this phase (directory doesn't exist yet). Task files land here.
- Root `.claude/hooks/` — New `task-state-guard.js` hook registered in `.claude/settings.json` as a PostToolUse hook.
- `ai-platform/.claude/skills/` and `ai-platform-fe/.claude/skills/` — Must be created; conventions skills land here.

</code_context>

<specifics>
## Specific Ideas

- Root CLAUDE.md should be under 200 lines (FOUND-03 hard limit)
- TeamLead agent success criteria (FOUND-06, FOUND-07): max ~10 min per task, fresh context window per task — these constraints must be visible in the root CLAUDE.md or TeamLead agent definition so the agent acknowledges them when sizing tasks
- Skills directory pattern: `<repo>/.claude/skills/<skill-name>/SKILL.md` — follows the project-skills pattern described in CLAUDE.md

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 1-Foundation*
*Context gathered: 2026-05-20*
