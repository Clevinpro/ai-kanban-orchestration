-- Enable pg_trgm extension for trigram-based lexical search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex: GIN trigram index on chunks.content for lexical (fuzzy) search
CREATE INDEX chunks_content_trgm_idx ON "chunks" USING gin ("content" gin_trgm_ops);

-- CreateIndex: HNSW index on chunks.embedding for approximate nearest-neighbour vector search
CREATE INDEX chunks_embedding_hnsw_idx ON "chunks" USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64);
