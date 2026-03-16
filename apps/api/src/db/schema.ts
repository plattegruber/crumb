// ---------------------------------------------------------------------------
// Drizzle D1 Schema — source of truth for all entity persistence (SPEC §2)
// ---------------------------------------------------------------------------
// Uses drizzle-orm/sqlite-core for Cloudflare D1 compatibility.
// Timestamps are stored as TEXT in ISO 8601 format.
// JSON columns use text({ mode: "json" }).
// Sum types are stored as type TEXT + data TEXT(JSON).
// Product uses joined-table inheritance (product_base + detail tables).
// ---------------------------------------------------------------------------

import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// §2.2 Creator
// ---------------------------------------------------------------------------

export const creators = sqliteTable("creators", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  password_hash: text("password_hash").notNull(),
  email_verified_at: text("email_verified_at"),

  // Kit connection (flattened from KitConnection value type)
  kit_account_id: text("kit_account_id"),
  kit_access_token: text("kit_access_token"), // encrypted at rest
  kit_refresh_token: text("kit_refresh_token"), // encrypted at rest
  kit_token_expires_at: text("kit_token_expires_at"),
  kit_scopes: text("kit_scopes", { mode: "json" }).$type<
    ReadonlyArray<string>
  >(),
  kit_connected_at: text("kit_connected_at"),

  // Subscription (flattened from Subscription value type)
  subscription_tier: text("subscription_tier").notNull().default("Free"),
  subscription_started_at: text("subscription_started_at").notNull(),
  subscription_renews_at: text("subscription_renews_at"),

  // WordPress connection (flattened from WordPressConnection value type)
  wordpress_site_url: text("wordpress_site_url"),
  wordpress_api_key: text("wordpress_api_key"), // encrypted at rest
  wordpress_plugin: text("wordpress_plugin"),
  wordpress_connected_at: text("wordpress_connected_at"),

  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

// ---------------------------------------------------------------------------
// §2.3 BrandKit
// ---------------------------------------------------------------------------

export const brandKits = sqliteTable(
  "brand_kits",
  {
    id: text("id").primaryKey(),
    creator_id: text("creator_id")
      .notNull()
      .references(() => creators.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    logo_url: text("logo_url"),
    primary_color: text("primary_color").notNull(),
    secondary_color: text("secondary_color"),
    accent_color: text("accent_color"),
    heading_font_family: text("heading_font_family").notNull(),
    heading_font_fallback: text("heading_font_fallback", {
      mode: "json",
    })
      .notNull()
      .$type<ReadonlyArray<string>>(),
    body_font_family: text("body_font_family").notNull(),
    body_font_fallback: text("body_font_fallback", {
      mode: "json",
    })
      .notNull()
      .$type<ReadonlyArray<string>>(),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [index("brand_kits_creator_id_idx").on(table.creator_id)],
);

// ---------------------------------------------------------------------------
// §2.4 Recipe
// ---------------------------------------------------------------------------

export const recipes = sqliteTable(
  "recipes",
  {
    id: text("id").primaryKey(),
    creator_id: text("creator_id")
      .notNull()
      .references(() => creators.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),

    // RecipeSource — sum type stored as type + data JSON
    source_type: text("source_type").notNull(),
    source_data: text("source_data", { mode: "json" }).$type<
      Record<string, unknown>
    >(),

    status: text("status").notNull().default("Draft"),
    email_ready: integer("email_ready", { mode: "boolean" })
      .notNull()
      .default(false),

    // RecipeTiming (flattened)
    prep_minutes: integer("prep_minutes"),
    cook_minutes: integer("cook_minutes"),
    total_minutes: integer("total_minutes"),

    // RecipeYield (flattened, nullable as a unit)
    yield_quantity: integer("yield_quantity"),
    yield_unit: text("yield_unit"),

    notes: text("notes"),

    // RecipeClassification — DietaryTagState
    dietary_tags: text("dietary_tags", { mode: "json" })
      .notNull()
      .$type<ReadonlyArray<string>>()
      .default([]),
    dietary_tags_confirmed: integer("dietary_tags_confirmed", {
      mode: "boolean",
    })
      .notNull()
      .default(false),

    cuisine: text("cuisine"),
    meal_types: text("meal_types", { mode: "json" })
      .notNull()
      .$type<ReadonlyArray<string>>()
      .default([]),
    seasons: text("seasons", { mode: "json" })
      .notNull()
      .$type<ReadonlyArray<string>>()
      .default([]),

    // NutritionFacts (flattened source + values as JSON)
    nutrition_source: text("nutrition_source"),
    nutrition_values: text("nutrition_values", { mode: "json" }).$type<
      Record<string, unknown>
    >(),

    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [
    unique("recipes_creator_slug_uniq").on(table.creator_id, table.slug),
    index("recipes_creator_id_idx").on(table.creator_id),
  ],
);

// ---------------------------------------------------------------------------
// §2.5 IngredientGroup + Ingredient
// ---------------------------------------------------------------------------

export const ingredientGroups = sqliteTable(
  "ingredient_groups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recipe_id: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    label: text("label"),
    sort_order: integer("sort_order").notNull(),
  },
  (table) => [index("ingredient_groups_recipe_id_idx").on(table.recipe_id)],
);

export const ingredients = sqliteTable(
  "ingredients",
  {
    id: text("id").primaryKey(),
    group_id: integer("group_id")
      .notNull()
      .references(() => ingredientGroups.id, { onDelete: "cascade" }),

    // Quantity — sum type stored as type + data JSON
    quantity_type: text("quantity_type"),
    quantity_data: text("quantity_data", { mode: "json" }).$type<
      Record<string, unknown>
    >(),

    unit: text("unit"),
    item: text("item").notNull(),
    notes: text("notes"),
    sort_order: integer("sort_order").notNull(),
  },
  (table) => [index("ingredients_group_id_idx").on(table.group_id)],
);

// ---------------------------------------------------------------------------
// §2.6 InstructionGroup + Instruction
// ---------------------------------------------------------------------------

export const instructionGroups = sqliteTable(
  "instruction_groups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recipe_id: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    label: text("label"),
    sort_order: integer("sort_order").notNull(),
  },
  (table) => [
    index("instruction_groups_recipe_id_idx").on(table.recipe_id),
  ],
);

export const instructions = sqliteTable(
  "instructions",
  {
    id: text("id").primaryKey(),
    group_id: integer("group_id")
      .notNull()
      .references(() => instructionGroups.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    sort_order: integer("sort_order").notNull(),
  },
  (table) => [index("instructions_group_id_idx").on(table.group_id)],
);

// ---------------------------------------------------------------------------
// §2.7 Photo
// ---------------------------------------------------------------------------

export const photos = sqliteTable(
  "photos",
  {
    id: text("id").primaryKey(),
    recipe_id: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    alt_text: text("alt_text"),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sort_order: integer("sort_order").notNull(),
  },
  (table) => [index("photos_recipe_id_idx").on(table.recipe_id)],
);

// ---------------------------------------------------------------------------
// §2.11 Collection
// ---------------------------------------------------------------------------

export const collections = sqliteTable(
  "collections",
  {
    id: text("id").primaryKey(),
    creator_id: text("creator_id")
      .notNull()
      .references(() => creators.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [index("collections_creator_id_idx").on(table.creator_id)],
);

export const collectionRecipes = sqliteTable(
  "collection_recipes",
  {
    collection_id: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    recipe_id: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    sort_order: integer("sort_order").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.collection_id, table.recipe_id],
    }),
  ],
);

// ---------------------------------------------------------------------------
// §2.12 ImportJob
// ---------------------------------------------------------------------------

export const importJobs = sqliteTable(
  "import_jobs",
  {
    id: text("id").primaryKey(),
    creator_id: text("creator_id")
      .notNull()
      .references(() => creators.id, { onDelete: "cascade" }),

    // ImportStatus — stored as status text + source/extract/error JSON
    status: text("status").notNull().default("Pending"),
    source_type: text("source_type").notNull(),
    source_data: text("source_data", { mode: "json" }).$type<
      Record<string, unknown>
    >(),

    extract_data: text("extract_data", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    recipe_id: text("recipe_id").references(() => recipes.id, {
      onDelete: "set null",
    }),

    error_type: text("error_type"),
    error_data: text("error_data", { mode: "json" }).$type<
      Record<string, unknown>
    >(),

    processing_started_at: text("processing_started_at"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [index("import_jobs_creator_id_idx").on(table.creator_id)],
);

// ---------------------------------------------------------------------------
// §2.14 Product — joined-table inheritance
// ---------------------------------------------------------------------------

export const productBase = sqliteTable(
  "product_base",
  {
    id: text("id").primaryKey(),
    creator_id: text("creator_id")
      .notNull()
      .references(() => creators.id, { onDelete: "cascade" }),
    product_type: text("product_type").notNull(), // Ebook | MealPlan | RecipeCardPack | LeadMagnet
    status: text("status").notNull().default("Draft"),
    title: text("title").notNull(),
    description: text("description"),
    brand_kit_id: text("brand_kit_id")
      .notNull()
      .references(() => brandKits.id),
    template_id: text("template_id").notNull(),
    pdf_url: text("pdf_url"),
    epub_url: text("epub_url"),
    kit_form_id: text("kit_form_id"),
    kit_sequence_id: text("kit_sequence_id"),
    suggested_price_cents: integer("suggested_price_cents"),
    currency: text("currency").notNull().default("USD"),
    ai_copy_reviewed: integer("ai_copy_reviewed", { mode: "boolean" })
      .notNull()
      .default(false),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [index("product_base_creator_id_idx").on(table.creator_id)],
);

export const ebookDetails = sqliteTable("ebook_details", {
  product_id: text("product_id")
    .primaryKey()
    .references(() => productBase.id, { onDelete: "cascade" }),
  recipe_ids: text("recipe_ids", { mode: "json" })
    .notNull()
    .$type<ReadonlyArray<string>>(),
  chapters: text("chapters", { mode: "json" })
    .notNull()
    .$type<
      ReadonlyArray<{
        title: string;
        intro_copy: string | null;
        recipe_ids: ReadonlyArray<string>;
      }>
    >(),
  intro_copy: text("intro_copy"),
  author_bio: text("author_bio"),
  format: text("format").notNull(), // LetterSize | TradeSize
});

export const mealPlanDetails = sqliteTable("meal_plan_details", {
  product_id: text("product_id")
    .primaryKey()
    .references(() => productBase.id, { onDelete: "cascade" }),
  days: text("days", { mode: "json" })
    .notNull()
    .$type<
      ReadonlyArray<{
        day_number: number;
        breakfast: string | null;
        lunch: string | null;
        dinner: string | null;
        snacks: ReadonlyArray<string>;
      }>
    >(),
  shopping_list: text("shopping_list", { mode: "json" }).$type<{
    sections: ReadonlyArray<{
      label: string;
      items: ReadonlyArray<{
        quantity: Record<string, unknown> | null;
        unit: string | null;
        item: string;
        recipe_refs: ReadonlyArray<string>;
      }>;
    }>;
    generated_at: string;
  }>(),
});

export const recipeCardPacks = sqliteTable("recipe_card_packs", {
  product_id: text("product_id")
    .primaryKey()
    .references(() => productBase.id, { onDelete: "cascade" }),
  recipe_ids: text("recipe_ids", { mode: "json" })
    .notNull()
    .$type<ReadonlyArray<string>>(),
});

export const leadMagnets = sqliteTable("lead_magnets", {
  product_id: text("product_id")
    .primaryKey()
    .references(() => productBase.id, { onDelete: "cascade" }),
  parent_product_id: text("parent_product_id")
    .notNull()
    .references(() => productBase.id),
  recipe_ids: text("recipe_ids", { mode: "json" })
    .notNull()
    .$type<ReadonlyArray<string>>(),
});

// ---------------------------------------------------------------------------
// §2.15 PublishedListing
// ---------------------------------------------------------------------------

export const publishedListings = sqliteTable(
  "published_listings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    product_id: text("product_id")
      .notNull()
      .references(() => productBase.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // StanStore | Gumroad | LTK
    listing_url: text("listing_url"),
    platform_id: text("platform_id"),
    published_at: text("published_at").notNull(),
  },
  (table) => [
    index("published_listings_product_id_idx").on(table.product_id),
  ],
);

// ---------------------------------------------------------------------------
// §2.10 RecipeEngagementScore
// ---------------------------------------------------------------------------

export const recipeEngagementScores = sqliteTable("recipe_engagement_scores", {
  recipe_id: text("recipe_id")
    .primaryKey()
    .references(() => recipes.id, { onDelete: "cascade" }),
  creator_id: text("creator_id")
    .notNull()
    .references(() => creators.id, { onDelete: "cascade" }),
  score: real("score").notNull(),
  computed_at: text("computed_at").notNull(),

  // EngagementScoreInputs (flattened)
  save_clicks_30d: integer("save_clicks_30d").notNull(),
  sequence_triggers_30d: integer("sequence_triggers_30d").notNull(),
  card_views_30d: integer("card_views_30d").notNull(),
  purchase_attributions_all: integer("purchase_attributions_all").notNull(),
});

// ---------------------------------------------------------------------------
// §2.16 RecipeEngagementEvent
// ---------------------------------------------------------------------------

export const recipeEngagementEvents = sqliteTable(
  "recipe_engagement_events",
  {
    id: text("id").primaryKey(),
    creator_id: text("creator_id")
      .notNull()
      .references(() => creators.id, { onDelete: "cascade" }),
    recipe_id: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),

    // EngagementEventType — sum type stored as type + data JSON
    event_type: text("event_type").notNull(), // SaveClick | CardView | SequenceTrigger | PurchaseAttribution
    event_data: text("event_data", { mode: "json" }).$type<
      Record<string, unknown>
    >(), // e.g. { product_id: "..." } for PurchaseAttribution

    kit_subscriber_id: text("kit_subscriber_id"),
    source: text("source").notNull(), // KitWebhook | KitApiPoll | Internal
    occurred_at: text("occurred_at").notNull(),
  },
  (table) => [
    index("engagement_events_creator_recipe_occurred_idx").on(
      table.creator_id,
      table.recipe_id,
      table.occurred_at,
    ),
  ],
);

// ---------------------------------------------------------------------------
// §2.17 SegmentProfile
// ---------------------------------------------------------------------------

export const segmentProfiles = sqliteTable("segment_profiles", {
  creator_id: text("creator_id")
    .primaryKey()
    .references(() => creators.id, { onDelete: "cascade" }),
  computed_at: text("computed_at").notNull(),
  segments: text("segments", { mode: "json" })
    .notNull()
    .$type<
      Record<
        string,
        {
          subscriber_count: number;
          engagement_rate: number;
          growth_rate_30d: number;
          top_recipe_ids: ReadonlyArray<string>;
        }
      >
    >(),
});

// ---------------------------------------------------------------------------
// §2.19 TeamMember
// ---------------------------------------------------------------------------

export const teamMembers = sqliteTable(
  "team_members",
  {
    id: text("id").primaryKey(),
    creator_id: text("creator_id")
      .notNull()
      .references(() => creators.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("Member"),
    invited_at: text("invited_at").notNull(),
    accepted_at: text("accepted_at"),
  },
  (table) => [index("team_members_creator_id_idx").on(table.creator_id)],
);
