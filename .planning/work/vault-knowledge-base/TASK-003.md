---
id: TASK-003
title: Remove KnowledgeService.refreshGuideSummary and buildGuideSummaryPrompt
status: readyForDevelop
priority: medium
repo: be
epic: vault-knowledge-base
complexity: 2
created-at: 2026-05-28T00:00:00Z
updated-at: 2026-05-28T00:00:00Z
spec: .planning/work/vault-knowledge-base/SPEC.md
---

## Description

Delete `refreshGuideSummary()` and `buildGuideSummaryPrompt()` from `KnowledgeService` entirely along with any private helpers exclusive to them (constants, prompt templates, type aliases). Remove any private imports that become unused after deletion.

## Acceptance Criteria

- [ ] `knowledge.service.ts` no longer exports or defines `refreshGuideSummary`
- [ ] `knowledge.service.ts` no longer defines `buildGuideSummaryPrompt`
- [ ] Helpers and constants used only by these two methods are removed
- [ ] No remaining `import` lines in `knowledge.service.ts` reference deleted symbols
- [ ] `nx build ai-service` succeeds with no TypeScript errors in this file
- [ ] `grep -r "refreshGuideSummary" ai-platform/apps/ai-service/src` returns 0 matches

## Technical Notes

- Path: `ai-platform/apps/ai-service/src/...` — locate `knowledge.service.ts` via grep for `refreshGuideSummary`
- Caller in `DocumentController` is removed in TASK-004 — that grep will surface during your edit; leave the controller untouched in this task
- If `generateDocNotes` shares any helper with the removed guide methods, keep the shared helper
- No DB changes — schema work is in TASK-001
