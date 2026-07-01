-- Replace the single-column unique on messages.run_id with a composite unique on
-- (run_id, role). This makes conversation writes idempotent under Kafka
-- at-least-once redelivery: a (runId, role) pair upserts to a single row, while
-- legacy rows with NULL run_id never collide (Postgres treats NULLs as distinct).
--
-- NOTE (Prisma-drift trap): `prisma migrate dev` auto-generates DROP INDEX for
-- chunks_content_trgm_idx and chunks_embedding_hnsw_idx here, because gin_trgm_ops /
-- hnsw are raw-SQL indexes not representable in schema.prisma, so Migrate sees them
-- as drift. This migration is hand-authored to AVOID those drops, and the defensive
-- CREATE INDEX IF NOT EXISTS statements below re-assert them so the indexes survive
-- regardless of any prior drift.

-- DropIndex: remove the old single-column unique added by 20260616000000_add_message_run_id.
DROP INDEX IF EXISTS "messages_run_id_key";

-- CreateIndex: composite unique on (run_id, role) — the idempotency upsert key.
CREATE UNIQUE INDEX "messages_run_id_role_key" ON "messages"("run_id", "role");

-- Preserve hybrid-search indexes (idempotent re-assert; never dropped by this migration).
CREATE INDEX IF NOT EXISTS chunks_content_trgm_idx ON "chunks" USING gin ("content" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx ON "chunks" USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64);
