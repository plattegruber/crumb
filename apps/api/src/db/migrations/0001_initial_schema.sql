-- ---------------------------------------------------------------------------
-- Initial schema migration for all entities (SPEC §2)
-- Cloudflare D1 (SQLite)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- creators (§2.2)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS creators (
  id               TEXT PRIMARY KEY,
  email            TEXT NOT NULL,
  name             TEXT NOT NULL,
  password_hash    TEXT NOT NULL,
  email_verified_at TEXT,

  -- Kit connection
  kit_account_id     TEXT,
  kit_access_token   TEXT,
  kit_refresh_token  TEXT,
  kit_token_expires_at TEXT,
  kit_scopes         TEXT, -- JSON array of KitScope strings
  kit_connected_at   TEXT,

  -- Subscription
  subscription_tier       TEXT NOT NULL DEFAULT 'Free',
  subscription_started_at TEXT NOT NULL,
  subscription_renews_at  TEXT,

  -- WordPress connection
  wordpress_site_url    TEXT,
  wordpress_api_key     TEXT,
  wordpress_plugin      TEXT,
  wordpress_connected_at TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- brand_kits (§2.3)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS brand_kits (
  id                   TEXT PRIMARY KEY,
  creator_id           TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  logo_url             TEXT,
  primary_color        TEXT NOT NULL,
  secondary_color      TEXT,
  accent_color         TEXT,
  heading_font_family  TEXT NOT NULL,
  heading_font_fallback TEXT NOT NULL, -- JSON array
  body_font_family     TEXT NOT NULL,
  body_font_fallback   TEXT NOT NULL, -- JSON array
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS brand_kits_creator_id_idx ON brand_kits(creator_id);

-- ---------------------------------------------------------------------------
-- recipes (§2.4)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS recipes (
  id            TEXT PRIMARY KEY,
  creator_id    TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  slug          TEXT NOT NULL,
  description   TEXT,

  -- RecipeSource (sum type)
  source_type   TEXT NOT NULL,
  source_data   TEXT, -- JSON

  status        TEXT NOT NULL DEFAULT 'Draft',
  email_ready   INTEGER NOT NULL DEFAULT 0,

  -- Timing
  prep_minutes  INTEGER,
  cook_minutes  INTEGER,
  total_minutes INTEGER,

  -- Yield
  yield_quantity INTEGER,
  yield_unit     TEXT,

  notes TEXT,

  -- Classification
  dietary_tags           TEXT NOT NULL DEFAULT '[]', -- JSON array
  dietary_tags_confirmed INTEGER NOT NULL DEFAULT 0,
  cuisine                TEXT,
  meal_types             TEXT NOT NULL DEFAULT '[]', -- JSON array
  seasons                TEXT NOT NULL DEFAULT '[]', -- JSON array

  -- Nutrition
  nutrition_source TEXT,
  nutrition_values TEXT, -- JSON

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  UNIQUE(creator_id, slug)
);

CREATE INDEX IF NOT EXISTS recipes_creator_id_idx ON recipes(creator_id);

-- ---------------------------------------------------------------------------
-- ingredient_groups (§2.5)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ingredient_groups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id  TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  label      TEXT,
  sort_order INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ingredient_groups_recipe_id_idx ON ingredient_groups(recipe_id);

-- ---------------------------------------------------------------------------
-- ingredients (§2.5)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ingredients (
  id            TEXT PRIMARY KEY,
  group_id      INTEGER NOT NULL REFERENCES ingredient_groups(id) ON DELETE CASCADE,
  quantity_type TEXT,
  quantity_data TEXT, -- JSON
  unit          TEXT,
  item          TEXT NOT NULL,
  notes         TEXT,
  sort_order    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ingredients_group_id_idx ON ingredients(group_id);

-- ---------------------------------------------------------------------------
-- instruction_groups (§2.6)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS instruction_groups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id  TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  label      TEXT,
  sort_order INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS instruction_groups_recipe_id_idx ON instruction_groups(recipe_id);

-- ---------------------------------------------------------------------------
-- instructions (§2.6)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS instructions (
  id         TEXT PRIMARY KEY,
  group_id   INTEGER NOT NULL REFERENCES instruction_groups(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS instructions_group_id_idx ON instructions(group_id);

-- ---------------------------------------------------------------------------
-- photos (§2.7)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS photos (
  id         TEXT PRIMARY KEY,
  recipe_id  TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  alt_text   TEXT,
  width      INTEGER NOT NULL,
  height     INTEGER NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS photos_recipe_id_idx ON photos(recipe_id);

-- ---------------------------------------------------------------------------
-- collections (§2.11)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS collections (
  id          TEXT PRIMARY KEY,
  creator_id  TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS collections_creator_id_idx ON collections(creator_id);

-- ---------------------------------------------------------------------------
-- collection_recipes (§2.11)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS collection_recipes (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  recipe_id     TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order    INTEGER NOT NULL,
  PRIMARY KEY (collection_id, recipe_id)
);

-- ---------------------------------------------------------------------------
-- import_jobs (§2.12)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS import_jobs (
  id          TEXT PRIMARY KEY,
  creator_id  TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'Pending',
  source_type TEXT NOT NULL,
  source_data TEXT, -- JSON
  extract_data TEXT, -- JSON, nullable
  recipe_id    TEXT REFERENCES recipes(id) ON DELETE SET NULL,
  error_type   TEXT,
  error_data   TEXT, -- JSON, nullable
  processing_started_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS import_jobs_creator_id_idx ON import_jobs(creator_id);

-- ---------------------------------------------------------------------------
-- product_base (§2.14)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS product_base (
  id                    TEXT PRIMARY KEY,
  creator_id            TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  product_type          TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'Draft',
  title                 TEXT NOT NULL,
  description           TEXT,
  brand_kit_id          TEXT NOT NULL REFERENCES brand_kits(id),
  template_id           TEXT NOT NULL,
  pdf_url               TEXT,
  epub_url              TEXT,
  kit_form_id           TEXT,
  kit_sequence_id       TEXT,
  suggested_price_cents INTEGER,
  currency              TEXT NOT NULL DEFAULT 'USD',
  ai_copy_reviewed      INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS product_base_creator_id_idx ON product_base(creator_id);

-- ---------------------------------------------------------------------------
-- ebook_details (§2.14)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ebook_details (
  product_id TEXT PRIMARY KEY REFERENCES product_base(id) ON DELETE CASCADE,
  recipe_ids TEXT NOT NULL, -- JSON array
  chapters   TEXT NOT NULL, -- JSON array of Chapter objects
  intro_copy TEXT,
  author_bio TEXT,
  format     TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- meal_plan_details (§2.14)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS meal_plan_details (
  product_id    TEXT PRIMARY KEY REFERENCES product_base(id) ON DELETE CASCADE,
  days          TEXT NOT NULL, -- JSON array of MealPlanDay objects
  shopping_list TEXT           -- JSON, nullable
);

-- ---------------------------------------------------------------------------
-- recipe_card_packs (§2.14)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS recipe_card_packs (
  product_id TEXT PRIMARY KEY REFERENCES product_base(id) ON DELETE CASCADE,
  recipe_ids TEXT NOT NULL -- JSON array
);

-- ---------------------------------------------------------------------------
-- lead_magnets (§2.14)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS lead_magnets (
  product_id        TEXT PRIMARY KEY REFERENCES product_base(id) ON DELETE CASCADE,
  parent_product_id TEXT NOT NULL REFERENCES product_base(id),
  recipe_ids        TEXT NOT NULL -- JSON array
);

-- ---------------------------------------------------------------------------
-- published_listings (§2.15)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS published_listings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id   TEXT NOT NULL REFERENCES product_base(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL,
  listing_url  TEXT,
  platform_id  TEXT,
  published_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS published_listings_product_id_idx ON published_listings(product_id);

-- ---------------------------------------------------------------------------
-- recipe_engagement_scores (§2.10)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS recipe_engagement_scores (
  recipe_id                TEXT PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
  creator_id               TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  score                    REAL NOT NULL,
  computed_at              TEXT NOT NULL,
  save_clicks_30d          INTEGER NOT NULL,
  sequence_triggers_30d    INTEGER NOT NULL,
  card_views_30d           INTEGER NOT NULL,
  purchase_attributions_all INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- recipe_engagement_events (§2.16)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS recipe_engagement_events (
  id                 TEXT PRIMARY KEY,
  creator_id         TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  recipe_id          TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  event_type         TEXT NOT NULL,
  event_data         TEXT, -- JSON, nullable
  kit_subscriber_id  TEXT,
  source             TEXT NOT NULL,
  occurred_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS engagement_events_creator_recipe_occurred_idx
  ON recipe_engagement_events(creator_id, recipe_id, occurred_at);

-- ---------------------------------------------------------------------------
-- segment_profiles (§2.17)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS segment_profiles (
  creator_id  TEXT PRIMARY KEY REFERENCES creators(id) ON DELETE CASCADE,
  computed_at TEXT NOT NULL,
  segments    TEXT NOT NULL -- JSON
);

-- ---------------------------------------------------------------------------
-- team_members (§2.19)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS team_members (
  id          TEXT PRIMARY KEY,
  creator_id  TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'Member',
  invited_at  TEXT NOT NULL,
  accepted_at TEXT
);

CREATE INDEX IF NOT EXISTS team_members_creator_id_idx ON team_members(creator_id);
