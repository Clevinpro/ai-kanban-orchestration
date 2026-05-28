# ai-platform-fe — Frontend (React)

## Path Isolation

You are operating ONLY within `ai-platform-fe/`. Do not read, write, or reference files outside this directory.

## Allowed Paths

- `ai-platform-fe/apps/**` — React MFE application source (shell, auth, chat, docs)
- `ai-platform-fe/libs/**` — Shared FE libraries (@libs/api, @libs/store, @libs/ui)
- `ai-platform-fe/nx.json` — Nx workspace config
- `ai-platform-fe/tsconfig.base.json` — Shared TypeScript paths and compiler options
- `ai-platform-fe/package.json` — FE workspace dependencies
- `ai-platform-fe/.env*` — Environment configuration
- `ai-platform-fe/vitest.config.ts` — Unit test configuration
- `ai-platform-fe/playwright.config.ts` — E2E test configuration

## Skills

Load `ai-platform-fe/.claude/skills/fe-conventions/SKILL.md` before implementing React features.

## Rules

- All code comments, documentation, and descriptions must be in **English**.
- Do not create new MFE apps or libs without checking `ai-platform-fe/nx.json` first.
- Run `nx test <app|lib>` (Vitest) to validate unit tests before marking a task complete.
- Run `nx e2e <app>-e2e` (Playwright) for E2E tests.
