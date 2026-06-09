-- Backfill the document async-indexing lifecycle status for pre-existing rows.
-- The previous migration added "status" with a default of 'pending'. Every row that
-- existed at that point was indexed before lifecycle tracking existed (the async logic
-- that writes 'pending'/'indexing' is introduced in later tasks), so those rows must be
-- treated as already indexed. Mark them 'ready'. New rows continue to default to 'pending'.
UPDATE "documents" SET "status" = 'ready' WHERE "status" = 'pending';
