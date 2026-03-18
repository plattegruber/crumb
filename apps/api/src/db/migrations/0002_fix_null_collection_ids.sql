-- Fix collections created before server-side ID generation was added.
-- SQLite TEXT PRIMARY KEY allows NULLs, so multiple collections ended up
-- with id = NULL, causing duplicate-key errors on the frontend.

-- Assign a random hex ID to each NULL-id collection.
-- randomblob() is non-deterministic so each row gets a unique value.
UPDATE collections
SET id = lower(
  hex(randomblob(4)) || '-' ||
  hex(randomblob(2)) || '-' ||
  hex(randomblob(2)) || '-' ||
  hex(randomblob(2)) || '-' ||
  hex(randomblob(6))
)
WHERE id IS NULL;

-- Clean up any orphaned collection_recipes rows with NULL collection_id.
DELETE FROM collection_recipes WHERE collection_id IS NULL;
