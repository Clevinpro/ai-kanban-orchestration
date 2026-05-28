# AI Agent Microservices

Multi-agent development automation system. A TeamLead agent reads a SPEC, breaks it into task files, and an automated pipeline (Developer -> CodeReview -> QA -> TeamLeadCheck -> Done) executes each task.

## Sub-services

| Directory         | Description                                                       |
| ----------------- | ----------------------------------------------------------------- |
| `ai-platform/`    | Backend services — api-gateway, auth-service, ai-service (NestJS) |
| `ai-platform-fe/` | Frontend apps — shell, auth, chat, docs MFEs (React/Vite)         |
| `kanban-server/`  | Kanban task board server and client                               |

## Prerequisites

- Node.js 20+
- npm

## Install

Install dependencies in each workspace you plan to use:

```bash
npm install

cd ai-platform && npm install
cd ../ai-platform-fe && npm install
cd ../kanban-server && npm install
cd client && npm install
```

## Run

### Backend services

Runs `api-gateway`, `auth-service`, and `ai-service` in parallel:

```bash
cd ai-platform
npm run start
```

### Frontend apps

Runs the shell, auth, and chat frontend apps in parallel:

```bash
cd ai-platform-fe
npm run start
```

### Kanban board

Run the Kanban API server:

```bash
cd kanban-server
npm run start
```

Run the Kanban client in dev mode:

```bash
cd kanban-server
npm run dev
```

Build or preview the Kanban client:

```bash
cd kanban-server
npm run build
npm run preview
```

## Checks

Run root lint across the configured workspaces:

```bash
npm run lint
```

Run service-specific checks:

```bash
cd ai-platform && npm run lint && npm run test
cd ../ai-platform-fe && npm run lint && npm run test
cd ../kanban-server && npm run lint && npm run test
```

## Git Hooks

### Install git hooks

Run once after cloning to activate the Obsidian commit-documentation hook:

```bash
bash scripts/install-hooks.sh
```

This creates `.git/hooks/post-commit` as a symlink to `scripts/obsidian-commit-doc.sh`. The hook generates an Obsidian note for every commit under `docs/obsidian-vault/commits/`.
