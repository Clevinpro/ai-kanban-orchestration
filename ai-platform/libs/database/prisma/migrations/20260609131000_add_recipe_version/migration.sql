-- Add the index recipe-version fingerprint to embedding_provider_state.
-- Joins (provider, model) so any future index-strategy change auto-truncates
-- chunks and re-indexes the vault on next boot when INDEX_RECIPE_VERSION is bumped.
-- Nullable so rows written before recipe tracking remain valid (treated as "differs").
ALTER TABLE "embedding_provider_state" ADD COLUMN "recipe_version" TEXT;
