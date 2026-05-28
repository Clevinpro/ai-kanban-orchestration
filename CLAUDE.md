# AI Agent Dev Workflow

Multi-agent development automation system. A TeamLead agent reads a SPEC.md, breaks it into task files, and an automated pipeline (Developer → CodeReview → QA → TeamLeadCheck → Done) executes each task.

## Repos

Single repository, three services co-located at workspace root:

- **`ai-platform/`** — backend services (api-gateway, auth-service, ai-service)
  - Agent context: `ai-platform/CLAUDE.md`
  - Conventions skill: `ai-platform/.claude/skills/be-conventions/SKILL.md`

- **`ai-platform-fe/`** — frontend apps (shell, auth, chat, docs MFEs)
  - Agent context: `ai-platform-fe/CLAUDE.md`
  - Conventions skill: `ai-platform-fe/.claude/skills/fe-conventions/SKILL.md`

- **`kanban-server/`** — standalone Express + SSE dev-tool server for the Kanban UI
  - Plain CommonJS Node.js, no Nx, no TypeScript
  - Lives outside the Nx workspace at the repo root

## Task Files

- Task files live at `.planning/work/<epic-name>/TASK-XXX.md`
- Task ID format: `TASK-001` (three-digit zero-padded)
- The `epic` field in frontmatter must match the parent directory name

## Agent Workflow Entry Points

- `/team-lead:plan <SPEC.md>` — Break a spec into TASK-XXX.md files for human review
- `/team-lead:execute <TASK-ID>` — Run the full automated pipeline for one task
- `/team-lead:test <epic-name>` — Epic-level acceptance gate: runs after all tasks are `done`, verifies every SPEC.md acceptance criterion holistically, writes `TEST-REPORT.md`

## Task Ordering

Tasks run **sequentially within an epic**: a task can only transition `readyForDevelop → inProgress` once the previous task (next-lower `TASK-NNN` in the same epic directory) is `done`. Enforced by the `task-state-guard.js` PreToolUse hook.

## Routing Rules

- **Before editing `ai-platform/` code:** load `ai-platform/CLAUDE.md` first
- **Before editing `ai-platform-fe/` code:** load `ai-platform-fe/CLAUDE.md` first
- **Before editing `kanban-server/` code:** treat as standalone Node.js service — no Nx, no shared deps with the other two
- **Never edit across multiple services in a single task** — tasks are `repo: be`, `repo: fe`, or `repo: kanban`, never combined
- **Each task executes in a fresh context window** — do not assume state from previous tasks

## Commit Hooks

Root-level Husky pre-commit runs scoped lint + tests per service based on staged file paths:

- Staged files under `ai-platform/` → `nx affected -t lint test` inside `ai-platform/`
- Staged files under `ai-platform-fe/` → `nx affected -t lint test` inside `ai-platform-fe/`
- Staged files under `kanban-server/` → `npm run lint && npm test` inside `kanban-server/`
