# Architecture Decisions

## ADR-001: pgvector for vector embeddings

**Date:** 2026-05-01
**Status:** Accepted

**Context:** The ai-service needs to store and query 768-dimensional embeddings for
semantic document search. Options considered: dedicated vector DB (Qdrant, Weaviate),
pgvector extension in existing PostgreSQL.

**Decision:** Use `pgvector` extension inside the existing PostgreSQL container.

**Rationale:**
- No additional infrastructure component — PostgreSQL already required for relational data
- Cosine similarity over 768-dim vectors is fast enough for the current document volume
- Prisma raw queries provide sufficient ergonomics for vector insert/search
- Migration to a dedicated vector DB is explicitly out of scope for v1

**Consequences:** Vector search is co-located with relational queries. At high document
volume (>100k chunks), a dedicated vector DB will outperform pgvector.

---

## ADR-002: Obsidian vault as in-repo knowledge base

**Date:** 2026-05-26
**Status:** Accepted

**Context:** Project documentation was scattered across `.planning/` markdown files with no
unified browsable view. Team wanted searchable knowledge accessible via both Obsidian and chat.

**Decision:** Add `docs/obsidian-vault/` to the monorepo root; auto-populate via post-commit hook.

**Rationale:**
- Git-tracked vault keeps docs alongside code with full history
- Existing pgvector RAG pipeline can index vault `.md` files without schema changes
- Obsidian provides a free, local-first knowledge graph UI

**Consequences:** Every `git commit` triggers a Claude CLI call (fail-safe: skipped if absent).
