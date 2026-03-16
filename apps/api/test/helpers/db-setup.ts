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
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS recipe_engagement_events (id TEXT PRIMARY KEY, creator_id TEXT NOT NULL, recipe_id TEXT NOT NULL, event_type TEXT NOT NULL, event_data TEXT, kit_subscriber_id TEXT, source TEXT NOT NULL, occurred_at TEXT NOT NULL)`,
  );
  await d1.exec(
    `CREATE INDEX IF NOT EXISTS engagement_events_creator_recipe_occurred_idx ON recipe_engagement_events(creator_id, recipe_id, occurred_at)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS recipe_engagement_scores (recipe_id TEXT PRIMARY KEY, creator_id TEXT NOT NULL, score REAL NOT NULL, computed_at TEXT NOT NULL, save_clicks_30d INTEGER NOT NULL, sequence_triggers_30d INTEGER NOT NULL, card_views_30d INTEGER NOT NULL, purchase_attributions_all INTEGER NOT NULL)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS segment_profiles (creator_id TEXT PRIMARY KEY, computed_at TEXT NOT NULL, segments TEXT NOT NULL)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS product_base (id TEXT PRIMARY KEY, creator_id TEXT NOT NULL, product_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Draft', title TEXT NOT NULL, description TEXT, brand_kit_id TEXT NOT NULL, template_id TEXT NOT NULL, pdf_url TEXT, epub_url TEXT, kit_form_id TEXT, kit_sequence_id TEXT, suggested_price_cents INTEGER, currency TEXT NOT NULL DEFAULT 'USD', ai_copy_reviewed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS ebook_details (product_id TEXT PRIMARY KEY, recipe_ids TEXT NOT NULL, chapters TEXT NOT NULL, intro_copy TEXT, author_bio TEXT, format TEXT NOT NULL)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS recipe_card_packs (product_id TEXT PRIMARY KEY, recipe_ids TEXT NOT NULL)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS seasonal_drops (id TEXT PRIMARY KEY, creator_id TEXT NOT NULL, label TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, collection_id TEXT NOT NULL, target_segment TEXT, recurrence TEXT NOT NULL DEFAULT 'None', last_processed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  );
  await d1.exec(
    `CREATE TABLE IF NOT EXISTS automation_configs (creator_id TEXT PRIMARY KEY, save_recipe_sequence_id TEXT, sends_this_month INTEGER NOT NULL DEFAULT 0, sends_month_reset_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  );
}

export async function cleanTestTables(d1: D1Database): Promise<void> {
  await d1.exec(`DELETE FROM recipe_engagement_events`);
  await d1.exec(`DELETE FROM recipe_engagement_scores`);
  await d1.exec(`DELETE FROM segment_profiles`);
  await d1.exec(`DELETE FROM automation_configs`);
  await d1.exec(`DELETE FROM seasonal_drops`);
  await d1.exec(`DELETE FROM recipe_card_packs`);
  await d1.exec(`DELETE FROM ebook_details`);
  await d1.exec(`DELETE FROM product_base`);
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
