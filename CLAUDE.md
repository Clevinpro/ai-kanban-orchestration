# AI Agent Dev Workflow

Multi-agent development automation system. A TeamLead agent reads a SPEC.md, breaks it into task files, and an automated pipeline (Developer → CodeReview → QA → TeamLeadCheck → Done) executes each task.

## Repos

This workspace contains two independent sub-repos:

- **`ai-platform/`** — backend services (api-gateway, auth-service, ai-service)
  - Agent context: `ai-platform/CLAUDE.md`
  - Conventions skill: `ai-platform/.claude/skills/be-conventions/SKILL.md`

- **`ai-platform-fe/`** — frontend apps (shell, auth, chat, docs MFEs)
  - Agent context: `ai-platform-fe/CLAUDE.md`
  - Conventions skill: `ai-platform-fe/.claude/skills/fe-conventions/SKILL.md`

## Task Files

- Task files live at `.planning/work/<epic-name>/TASK-XXX.md`
- Task ID format: `TASK-001` (three-digit zero-padded)
- The `epic` field in frontmatter must match the parent directory name

## Agent Workflow Entry Points

- `/team-lead:plan <SPEC.md>` — Break a spec into TASK-XXX.md files for human review
- `/team-lead:execute <TASK-ID>` — Run the full automated pipeline for one task

## Routing Rules

- **Before editing `ai-platform/` code:** load `ai-platform/CLAUDE.md` first
- **Before editing `ai-platform-fe/` code:** load `ai-platform-fe/CLAUDE.md` first
- **Never edit across both repos in a single task** — tasks are `repo: be` or `repo: fe`, never both
- **Each task executes in a fresh context window** — do not assume state from previous tasks
