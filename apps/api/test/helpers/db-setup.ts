/**
 * Shared test helpers for D1 database setup.
 *
 * D1's exec() requires each statement to be executed individually,
 * so we issue separate exec calls for each CREATE TABLE.
 */

export async function createTestTables(d1: D1Database): Promise<void> {
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS creators (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, subscription_tier TEXT NOT NULL DEFAULT 'Free', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS recipes (id TEXT PRIMARY KEY, creator_id TEXT NOT NULL, title TEXT NOT NULL, slug TEXT NOT NULL, description TEXT, source TEXT NOT NULL DEFAULT '{"type":"Manual"}', status TEXT NOT NULL DEFAULT 'Draft', email_ready INTEGER NOT NULL DEFAULT 0, prep_minutes INTEGER, cook_minutes INTEGER, total_minutes INTEGER, yield_quantity INTEGER, yield_unit TEXT, notes TEXT, dietary_tags TEXT NOT NULL DEFAULT '[]', dietary_tags_confirmed INTEGER NOT NULL DEFAULT 0, cuisine TEXT, meal_types TEXT NOT NULL DEFAULT '[]', seasons TEXT NOT NULL DEFAULT '[]', nutrition TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS ingredient_groups (id TEXT PRIMARY KEY, recipe_id TEXT NOT NULL, creator_id TEXT NOT NULL, label TEXT, sort_order INTEGER NOT NULL DEFAULT 0)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS ingredients (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, recipe_id TEXT NOT NULL, creator_id TEXT NOT NULL, quantity TEXT, unit TEXT, item TEXT NOT NULL, notes TEXT, sort_order INTEGER NOT NULL DEFAULT 0)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS instruction_groups (id TEXT PRIMARY KEY, recipe_id TEXT NOT NULL, creator_id TEXT NOT NULL, label TEXT, sort_order INTEGER NOT NULL DEFAULT 0)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS instructions (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, recipe_id TEXT NOT NULL, creator_id TEXT NOT NULL, body TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, recipe_id TEXT NOT NULL, creator_id TEXT NOT NULL, url TEXT NOT NULL, alt_text TEXT, width INTEGER NOT NULL, height INTEGER NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY, creator_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS collection_recipes (collection_id TEXT NOT NULL, recipe_id TEXT NOT NULL, creator_id TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, creator_id TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Draft', title TEXT NOT NULL, collection_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  );
}

export async function cleanTestTables(d1: D1Database): Promise<void> {
  await d1.exec(`DELETE FROM ingredients`);
  await d1.exec(`DELETE FROM ingredient_groups`);
  await d1.exec(`DELETE FROM instructions`);
  await d1.exec(`DELETE FROM instruction_groups`);
  await d1.exec(`DELETE FROM photos`);
  await d1.exec(`DELETE FROM collection_recipes`);
  await d1.exec(`DELETE FROM collections`);
  await d1.exec(`DELETE FROM recipes`);
  await d1.exec(`DELETE FROM products`);
  await d1.exec(`DELETE FROM creators`);
}
