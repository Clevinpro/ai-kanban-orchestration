# Roadmap

## Phase Status

| Phase | Title | Status |
|-------|-------|--------|
| 01 | Foundation — NestJS monorepo, DB, Kafka | Done |
| 02 | TeamLead skills — plan + execute pipeline | Done |
| 03 | Sub-agents — Developer, CodeReview, QA | Done |
| 04 | Pipeline integration | Done |
| 05 | Kanban server | Done |
| 06 | Kanban board UI (React + D&D) | Done |
| 07 | Obsidian vault integration | In Progress |

## Current Focus

Epic `obsidian-integration`: wire a post-commit git hook to auto-generate
Markdown notes in this vault, index them into pgvector, and surface them in
the Docs micro-frontend.
