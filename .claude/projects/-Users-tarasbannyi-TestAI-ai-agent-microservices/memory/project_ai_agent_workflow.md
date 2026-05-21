---
name: project-ai-agent-workflow
description: Project context for AI Agent Dev Workflow — multi-agent Claude Code automation system
metadata:
  type: project
---

Building a Claude Code multi-agent dev workflow system on top of existing Nx monorepo (ai-platform BE + ai-platform-fe FE).

**Why:** Automate the development lifecycle — TeamLead reads SPEC.md, breaks into tasks, pipeline (Dev→Review→QA→Check→Done) runs per task automatically. Kanban board shows progress.

**Key decisions:**
- Agents in `.claude/agents/` (root level, not per sub-repo)
- Per-repo CLAUDE.md: ai-platform/CLAUDE.md (BE), ai-platform-fe/CLAUDE.md (FE)
- Task files: `.planning/work/TASK-XX.md` YAML frontmatter
- Kanban: standalone `tools/kanban-server/` + `tools/kanban-ui/` (NOT inside Nx workspace)
- No root git repo — sub-repos (ai-platform, ai-platform-fe) have own .git
- .planning/ is local-only (not git-tracked)

**6 phases:** Foundation → TeamLead Skills → Sub-Agents → Pipeline Integration → Kanban Server → Kanban UI

**How to apply:** Reference when working on any phase of this project. Sub-repos are ai-platform and ai-platform-fe.
