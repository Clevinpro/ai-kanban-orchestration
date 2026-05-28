# Architecture

## Backend — `ai-platform/` (NestJS / Nx monorepo)

| Service | Port | Responsibility |
|---------|------|----------------|
| api-gateway | 3000 | Public HTTP entry point, JWT auth, route proxying |
| auth-service | 3001 | User registration, login, JWT issuance |
| ai-service | 4001 | Document upload, chunking, pgvector indexing, chat RAG |

Shared libraries: `libs/database` (Prisma + PostgreSQL), `libs/kafka` (event bus), `libs/shared` (DTOs, guards).

## Frontend — `ai-platform-fe/` (React + Vite module federation)

| App | Description |
|-----|-------------|
| shell | Host application, global layout and routing |
| auth | Login / register micro-frontend |
| chat | AI chat interface |
| docs | Document management and vault viewer |

## Infrastructure

- **PostgreSQL + pgvector** — relational store + 768-dim vector embeddings
- **Kafka** — async inter-service events
- **Ollama** — local embedding model (`nomic-embed-text`)
- **Docker Compose** — local development stack (`ai-platform/docker-compose.yml`)

## Data Flow (RAG)

```
Upload .md → splitIntoChunks → OllamaEmbeddingService → INSERT chunks (pgvector)
Chat query → similaritySearch (cosine) → top-k chunks → LLM context → response
```
