# AI Agent Microservices

Multi-agent development automation system. A TeamLead agent reads a SPEC, breaks it into task files, and an automated pipeline (Developer -> CodeReview -> QA -> TeamLeadCheck -> Done) executes each task.

## Sub-services

| Directory         | Description                                                   |
|-------------------|---------------------------------------------------------------|
| `ai-platform/`    | Backend services — api-gateway, auth-service, ai-service (NestJS) |
| `ai-platform-fe/` | Frontend apps — shell, auth, chat, docs MFEs (React/Vite)    |
| `kanban-server/`  | Kanban task board server and client                           |


## Setup

### Install git hooks

Run once after cloning to activate the Obsidian commit-documentation hook:

```bash
bash scripts/install-hooks.sh
```

This creates `.git/hooks/post-commit` as a symlink to `scripts/obsidian-commit-doc.sh`. The hook generates an Obsidian note for every commit under `docs/obsidian-vault/commits/`.
