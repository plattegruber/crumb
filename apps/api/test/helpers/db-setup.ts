/**
 * Shared test helpers for D1 database setup.
 *
 * Creates tables matching the canonical Drizzle schema in
 * apps/api/src/db/schema.ts. D1's exec() requires each statement
 * to be a single line (no multi-line).
 */

export async function createTestTables(d1: D1Database): Promise<void> {
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS creators (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL DEFAULT '', email_verified_at TEXT, kit_account_id TEXT, kit_access_token TEXT, kit_refresh_token TEXT, kit_token_expires_at TEXT, kit_scopes TEXT, kit_connected_at TEXT, subscription_tier TEXT NOT NULL DEFAULT 'Free', subscription_started_at TEXT NOT NULL DEFAULT '', subscription_renews_at TEXT, wordpress_site_url TEXT, wordpress_api_key TEXT, wordpress_plugin TEXT, wordpress_connected_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS recipes (id TEXT PRIMARY KEY, creator_id TEXT NOT NULL, title TEXT NOT NULL, slug TEXT NOT NULL, description TEXT, source_type TEXT NOT NULL DEFAULT 'Manual', source_data TEXT, status TEXT NOT NULL DEFAULT 'Draft', email_ready INTEGER NOT NULL DEFAULT 0, prep_minutes INTEGER, cook_minutes INTEGER, total_minutes INTEGER, yield_quantity INTEGER, yield_unit TEXT, notes TEXT, dietary_tags TEXT NOT NULL DEFAULT '[]', dietary_tags_confirmed INTEGER NOT NULL DEFAULT 0, cuisine TEXT, meal_types TEXT NOT NULL DEFAULT '[]', seasons TEXT NOT NULL DEFAULT '[]', nutrition_source TEXT, nutrition_values TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  );
  await d1.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS recipes_creator_slug_uniq ON recipes(creator_id, slug)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS ingredient_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, recipe_id TEXT NOT NULL, label TEXT, sort_order INTEGER NOT NULL DEFAULT 0)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS ingredients (id TEXT PRIMARY KEY, group_id INTEGER NOT NULL, quantity_type TEXT, quantity_data TEXT, unit TEXT, item TEXT NOT NULL, notes TEXT, sort_order INTEGER NOT NULL DEFAULT 0)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS instruction_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, recipe_id TEXT NOT NULL, label TEXT, sort_order INTEGER NOT NULL DEFAULT 0)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS instructions (id TEXT PRIMARY KEY, group_id INTEGER NOT NULL, body TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, recipe_id TEXT NOT NULL, url TEXT NOT NULL, alt_text TEXT, width INTEGER NOT NULL, height INTEGER NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY, creator_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS collection_recipes (collection_id TEXT NOT NULL, recipe_id TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (collection_id, recipe_id))`,
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
  await d1.exec(`DELETE FROM creators`);
}
