-- Add a nullable, unique run_id to messages for durable assistant-run persistence.
--
-- NOTE (Prisma-drift trap): `prisma migrate dev` auto-generates a DROP INDEX for
-- chunks_content_trgm_idx and chunks_embedding_hnsw_idx here, because gin_trgm_ops /
-- hnsw are raw-SQL indexes not representable in schema.prisma, so Migrate sees them
-- as drift. This migration is hand-authored to AVOID those drops. The defensive
-- CREATE INDEX IF NOT EXISTS statements below re-assert them so the indexes survive
-- regardless of any prior drift.

-- AlterTable
ALTER TABLE "messages" ADD COLUMN "run_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "messages_run_id_key" ON "messages"("run_id");

-- Preserve hybrid-search indexes (idempotent re-assert; never dropped by this migration).
CREATE INDEX IF NOT EXISTS chunks_content_trgm_idx ON "chunks" USING gin ("content" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx ON "chunks" USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64);
