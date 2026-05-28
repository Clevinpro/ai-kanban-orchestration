# Overview

**ai-agent-microservices** is a monorepo multi-agent development automation system.

A TeamLead agent reads a SPEC, breaks it into task files, and an automated pipeline
(Developer → CodeReview → QA → TeamLeadCheck → Done) executes each task.

## Sub-Repos

- **`ai-platform/`** — NestJS backend (api-gateway, auth-service, ai-service)
- **`ai-platform-fe/`** — React/Vite micro-frontends (shell, auth, chat, docs)

## Key Capabilities

- Multi-agent task pipeline driven by Markdown task files
- pgvector RAG pipeline for semantic search over uploaded documents
- Obsidian vault auto-documented by a post-commit git hook
