# ai-platform — Backend (NestJS)

## Path Isolation

You are operating ONLY within `ai-platform/`. Do not read, write, or reference files outside this directory.

## Allowed Paths

- `ai-platform/apps/**` — NestJS application source (api-gateway, auth-service, ai-service)
- `ai-platform/libs/**` — Shared NestJS libraries (database, kafka, shared)
- `ai-platform/libs/database/prisma/**` — Prisma schema and migrations
- `ai-platform/docker-compose.yml` — Local infrastructure
- `ai-platform/nx.json` — Nx workspace config
- `ai-platform/tsconfig.base.json` — Shared TypeScript paths and compiler options
- `ai-platform/package.json` — Root workspace scripts and dependencies
- `ai-platform/.env*` — Environment configuration

## Skills

Load `ai-platform/.claude/skills/be-conventions/SKILL.md` before implementing NestJS features.

## Rules

- All code comments, documentation, and descriptions must be in **English**.
- Do not create new NestJS apps or libs without checking `ai-platform/nx.json` first.
- Run `nx test <app|lib>` to validate before marking a task complete.
