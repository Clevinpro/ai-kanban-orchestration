---
phase: 01-foundation
plan: 03
subsystem: be-isolation
tags: [claude.md, skills, nestjs, path-isolation, be-conventions]
dependency_graph:
  requires: [01-02]
  provides: [be-isolation-allowlist, be-conventions-skill]
  affects: [all-future-be-agent-sessions, phase-02-team-lead-implementation]
tech_stack:
  added: []
  patterns: [isolation-first-claude-md, explicit-load-skill-file]
key_files:
  created:
    - ai-platform/.claude/skills/be-conventions/SKILL.md
  modified:
    - ai-platform/CLAUDE.md
decisions:
  - "ai-platform/CLAUDE.md rewritten isolation-first: 56-line NestJS monorepo guide replaced with 21-line allowlist (D-05, D-06)"
  - "NestJS conventions (service pattern, key conventions, project layout) moved wholesale to be-conventions/SKILL.md (D-07)"
  - "Allowlist uses positive enumeration of allowed paths — not a blocklist — per D-05"
metrics:
  duration: "~4 min"
  completed: "2026-05-21T18:23:10Z"
  tasks_completed: 2
  files_changed: 2
---

# Phase 01 Plan 03: BE Isolation Allowlist + Conventions Skill Summary

BE sub-repo CLAUDE.md rewritten as a 21-line isolation-first allowlist; NestJS conventions extracted to `ai-platform/.claude/skills/be-conventions/SKILL.md` for explicit agent loading.

## What Was Built

### Task 1: Rewrite ai-platform/CLAUDE.md as isolation-first allowlist

Replaced the 56-line NestJS conventions file with a focused 21-line isolation-first allowlist containing four sections:

- `## Path Isolation` — imperative statement that the agent operates ONLY within `ai-platform/`; explicit prohibition on reading/writing/referencing files outside this directory
- `## Allowed Paths` — positive enumeration of 8 allowed path patterns (`apps/**`, `libs/**`, `libs/database/prisma/**`, `docker-compose.yml`, `nx.json`, `tsconfig.base.json`, `package.json`, `.env*`)
- `## Skills` — single directive to load `ai-platform/.claude/skills/be-conventions/SKILL.md` before implementing NestJS features
- `## Rules` — three imperatives: English-only, check nx.json before new apps/libs, run `nx test` before marking complete

All NestJS conventions content (service pattern tree, key conventions bullet list, project layout tree) removed from this file per D-06.

**Commit:** 7c3dcec (ai-platform sub-repo)

### Task 2: Create be-conventions/SKILL.md with NestJS conventions

Created `ai-platform/.claude/skills/be-conventions/SKILL.md` following the skill file format from `app-structure.md` exactly. Content is a direct lift-and-restructure of the NestJS conventions previously in `ai-platform/CLAUDE.md`:

- `# Skill: BE Conventions (NestJS)` — heading with explicit skill name
- `**Purpose:**` — one-liner directing load before NestJS implementation
- `## Rules` — English requirement
- `## Project Layout` — full directory tree (apps/, libs/, prisma location, config files)
- `## Service Pattern` — apps/<name>/src/ structure (main.ts, app.module.ts, feature controller/service/module)
- `## Key Conventions` — all 10 bullet points (monorepo scope `@ai-platform/*`, build/test/lint/commit commands, module pattern, validation, logging)
- `## App Dependencies` — table of internal deps per app (api-gateway, auth-service, ai-service)

**Commit:** c5ef422 (ai-platform sub-repo)

## Verification Results

| Check | Result |
|-------|--------|
| `grep "Service pattern\|Key conventions" ai-platform/CLAUDE.md` returns no matches | PASS |
| `grep "Allowed Paths" ai-platform/CLAUDE.md` returns match | PASS |
| `grep "be-conventions/SKILL.md" ai-platform/CLAUDE.md` returns match | PASS |
| `grep "nx test" be-conventions/SKILL.md` returns match | PASS |
| `grep "ai-platform-fe" ai-platform/CLAUDE.md` returns no matches | PASS |
| SKILL.md has `@ai-platform/database`, `@ai-platform/kafka`, `@ai-platform/shared` references | PASS |
| SKILL.md has service pattern directory tree (main.ts, app.module.ts, feature pattern) | PASS |
| SKILL.md has `class-transformer` + `class-validator` convention reference | PASS |

## Deviations from Plan

None - plan executed exactly as written.

## Requirements Satisfied

| Requirement | Status |
|-------------|--------|
| FOUND-04: ai-platform/CLAUDE.md isolation-first with path restrictions | SATISFIED |

## Known Stubs

None. Both files contain complete, wired content.

## Threat Flags

None. This plan creates only configuration/documentation files. No network endpoints, auth paths, file access patterns, or schema changes at trust boundaries were introduced. T-03-01 mitigation (allowlist prevents BE agents from accessing FE paths) is now implemented.

## Self-Check: PASSED

- ai-platform/CLAUDE.md exists with "Allowed Paths" section: FOUND
- ai-platform/CLAUDE.md references be-conventions/SKILL.md: FOUND
- ai-platform/.claude/skills/be-conventions/SKILL.md exists: FOUND
- Commit 7c3dcec exists in ai-platform sub-repo: FOUND
- Commit c5ef422 exists in ai-platform sub-repo: FOUND
