-- Migrate chunks.embedding from vector(768) to vector(1024) for multilingual embeddings.
-- Order is mandatory: pgvector cannot alter a column dimension while populated or
-- while an HNSW index references it. Drop index -> truncate -> alter -> recreate index.

-- 1. Drop the HNSW index that references the embedding column
DROP INDEX IF EXISTS "chunks_embedding_hnsw_idx";

-- 2. Truncate chunks (documents survive; startup vault scan re-embeds)
TRUNCATE TABLE "chunks";

-- 3. Alter the embedding column to the new 1024 dimension
ALTER TABLE "chunks" ALTER COLUMN "embedding" TYPE vector(1024);

-- 4. Recreate the HNSW cosine index with the original params
CREATE INDEX chunks_embedding_hnsw_idx ON "chunks" USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- 5. Add nullable model column to embedding_provider_state
ALTER TABLE "embedding_provider_state" ADD COLUMN "model" TEXT;
