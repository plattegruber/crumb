import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../../src/db/schema.js";

// Read migration SQL using Vite's ?raw suffix to import as a plain string.
// @ts-expect-error -- Vite handles ?raw imports at build time
import migrationSql from "../../src/db/migrations/0001_initial_schema.sql?raw";

function getDb() {
  return drizzle(env.DB, { schema });
}

/**
 * Parse migration SQL into individual statements.
 * D1's exec() splits by newline (not semicolon), so multi-line
 * statements like CREATE TABLE are broken. Instead, we split by
 * semicolon ourselves and use batch() with prepared statements.
 */
function parseStatements(sql: string): string[] {
  // Remove comment lines
  const cleaned = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  // Split by semicolons, trim, and filter empty
  return cleaned
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s + ";");
}

/**
 * Apply migration SQL to the test D1 database.
 * Uses batch() to run multi-line statements correctly.
 * Foreign keys are enabled by default in D1.
 */
async function applyMigration() {
  const statements = parseStatements(migrationSql);
  const prepared = statements.map((s) => env.DB.prepare(s));
  await env.DB.batch(prepared);
}

/**
 * Drop all tables so each test starts clean.
 */
async function dropAllTables() {
  const tables = [
    "team_members",
    "segment_profiles",
    "recipe_engagement_events",
    "recipe_engagement_scores",
    "published_listings",
    "lead_magnets",
    "recipe_card_packs",
    "meal_plan_details",
    "ebook_details",
    "product_base",
    "import_jobs",
    "collection_recipes",
    "collections",
    "photos",
    "instructions",
    "instruction_groups",
    "ingredients",
    "ingredient_groups",
    "recipes",
    "brand_kits",
    "creators",
  ];
  for (const table of tables) {
    await env.DB.exec(`DROP TABLE IF EXISTS ${table};`);
  }
}

const now = new Date().toISOString();

function makeCreator(overrides: Partial<typeof schema.creators.$inferInsert> = {}) {
  return {
    id: "creator-1",
    email: "test@example.com",
    name: "Test Creator",
    password_hash: "$2b$12$fakehash",
    subscription_tier: "Free",
    subscription_started_at: now,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function makeRecipe(overrides: Partial<typeof schema.recipes.$inferInsert> = {}) {
  return {
    id: "recipe-1",
    creator_id: "creator-1",
    title: "Lemon Pasta",
    slug: "lemon-pasta",
    source_type: "Manual",
    status: "Draft",
    email_ready: false,
    dietary_tags: [],
    meal_types: [],
    seasons: [],
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function makeBrandKit(overrides: Partial<typeof schema.brandKits.$inferInsert> = {}) {
  return {
    id: "brand-kit-1",
    creator_id: "creator-1",
    name: "Default Kit",
    primary_color: "#FF5733",
    heading_font_family: "Roboto",
    heading_font_fallback: ["Arial", "sans-serif"],
    body_font_family: "Open Sans",
    body_font_fallback: ["Helvetica", "sans-serif"],
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Database schema", () => {
  beforeEach(async () => {
    await dropAllTables();
    await applyMigration();
  });

  // -----------------------------------------------------------------------
  // Migration validity
  // -----------------------------------------------------------------------

  describe("migration", () => {
    it("creates all tables successfully", async () => {
      // Query sqlite_master for table names
      const result = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' ORDER BY name",
      ).all();

      const tableNames = result.results.map(
        (r: Record<string, unknown>) => r["name"] as string,
      );

      expect(tableNames).toContain("creators");
      expect(tableNames).toContain("brand_kits");
      expect(tableNames).toContain("recipes");
      expect(tableNames).toContain("ingredient_groups");
      expect(tableNames).toContain("ingredients");
      expect(tableNames).toContain("instruction_groups");
      expect(tableNames).toContain("instructions");
      expect(tableNames).toContain("photos");
      expect(tableNames).toContain("collections");
      expect(tableNames).toContain("collection_recipes");
      expect(tableNames).toContain("import_jobs");
      expect(tableNames).toContain("product_base");
      expect(tableNames).toContain("ebook_details");
      expect(tableNames).toContain("meal_plan_details");
      expect(tableNames).toContain("recipe_card_packs");
      expect(tableNames).toContain("lead_magnets");
      expect(tableNames).toContain("published_listings");
      expect(tableNames).toContain("recipe_engagement_scores");
      expect(tableNames).toContain("recipe_engagement_events");
      expect(tableNames).toContain("segment_profiles");
      expect(tableNames).toContain("team_members");
    });
  });

  // -----------------------------------------------------------------------
  // Creator round-trip
  // -----------------------------------------------------------------------

  describe("creators", () => {
    it("inserts and retrieves a creator", async () => {
      const db = getDb();
      const creator = makeCreator();

      await db.insert(schema.creators).values(creator);
      const rows = await db
        .select()
        .from(schema.creators)
        .where(eq(schema.creators.id, "creator-1"));

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row).toBeDefined();
      if (row) {
        expect(row.email).toBe("test@example.com");
        expect(row.name).toBe("Test Creator");
        expect(row.subscription_tier).toBe("Free");
        expect(row.kit_account_id).toBeNull();
      }
    });

    it("stores Kit connection fields", async () => {
      const db = getDb();
      const creator = makeCreator({
        kit_account_id: "kit-acct-123",
        kit_access_token: "encrypted-token",
        kit_refresh_token: "encrypted-refresh",
        kit_token_expires_at: now,
        kit_scopes: ["SubscribersRead", "TagsWrite"],
        kit_connected_at: now,
      });

      await db.insert(schema.creators).values(creator);
      const rows = await db
        .select()
        .from(schema.creators)
        .where(eq(schema.creators.id, "creator-1"));

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row).toBeDefined();
      if (row) {
        expect(row.kit_account_id).toBe("kit-acct-123");
        expect(row.kit_scopes).toEqual(["SubscribersRead", "TagsWrite"]);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Recipe round-trip
  // -----------------------------------------------------------------------

  describe("recipes", () => {
    it("inserts and retrieves a recipe with all fields", async () => {
      const db = getDb();
      await db.insert(schema.creators).values(makeCreator());

      const recipe = makeRecipe({
        description: "A zesty pasta dish",
        source_type: "ImportedFromUrl",
        source_data: { url: "https://example.com/recipe" },
        prep_minutes: 10,
        cook_minutes: 20,
        total_minutes: 30,
        yield_quantity: 4,
        yield_unit: "servings",
        dietary_tags: ["GlutenFree", "DairyFree"],
        dietary_tags_confirmed: true,
        cuisine: "Italian",
        meal_types: ["Dinner"],
        seasons: ["Summer"],
        nutrition_source: "Calculated",
        nutrition_values: { calories: 350, protein_g: 12.5 },
      });

      await db.insert(schema.recipes).values(recipe);
      const rows = await db
        .select()
        .from(schema.recipes)
        .where(eq(schema.recipes.id, "recipe-1"));

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row).toBeDefined();
      if (row) {
        expect(row.title).toBe("Lemon Pasta");
        expect(row.slug).toBe("lemon-pasta");
        expect(row.source_type).toBe("ImportedFromUrl");
        expect(row.source_data).toEqual({ url: "https://example.com/recipe" });
        expect(row.prep_minutes).toBe(10);
        expect(row.yield_quantity).toBe(4);
        expect(row.dietary_tags).toEqual(["GlutenFree", "DairyFree"]);
        expect(row.dietary_tags_confirmed).toBe(true);
        expect(row.meal_types).toEqual(["Dinner"]);
        expect(row.nutrition_source).toBe("Calculated");
        expect(row.nutrition_values).toEqual({
          calories: 350,
          protein_g: 12.5,
        });
      }
    });

    it("enforces unique constraint on creator_id + slug", async () => {
      const db = getDb();
      await db.insert(schema.creators).values(makeCreator());
      await db.insert(schema.recipes).values(makeRecipe());

      // Second recipe with same creator_id + slug should fail
      await expect(
        db.insert(schema.recipes).values(
          makeRecipe({ id: "recipe-2" }),
        ),
      ).rejects.toThrow();
    });

    it("allows same slug for different creators", async () => {
      const db = getDb();
      await db.insert(schema.creators).values(makeCreator());
      await db.insert(schema.creators).values(makeCreator({ id: "creator-2", email: "other@example.com" }));
      await db.insert(schema.recipes).values(makeRecipe());
      await db
        .insert(schema.recipes)
        .values(makeRecipe({ id: "recipe-2", creator_id: "creator-2" }));

      const rows = await db.select().from(schema.recipes);
      expect(rows).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // Ingredients & Instructions (normalized tables)
  // -----------------------------------------------------------------------

  describe("ingredients and instructions", () => {
    it("round-trips ingredient groups with ingredients", async () => {
      const db = getDb();
      await db.insert(schema.creators).values(makeCreator());
      await db.insert(schema.recipes).values(makeRecipe());

      // Insert ingredient group
      const groupResult = await env.DB.prepare(
        "INSERT INTO ingredient_groups (recipe_id, label, sort_order) VALUES (?, ?, ?) RETURNING id",
      )
        .bind("recipe-1", "For the sauce", 0)
        .first<{ id: number }>();

      expect(groupResult).not.toBeNull();
      const groupId = groupResult!.id;

      // Insert ingredient with Fraction quantity
      await db.insert(schema.ingredients).values({
        id: "ing-1",
        group_id: groupId,
        quantity_type: "Fraction",
        quantity_data: { numerator: 1, denominator: 2 },
        unit: "cup",
        item: "olive oil",
        notes: "extra virgin",
        sort_order: 0,
      });

      const ingredients = await db
        .select()
        .from(schema.ingredients)
        .where(eq(schema.ingredients.group_id, groupId));

      expect(ingredients).toHaveLength(1);
      const ing = ingredients[0];
      expect(ing).toBeDefined();
      if (ing) {
        expect(ing.quantity_type).toBe("Fraction");
        expect(ing.quantity_data).toEqual({ numerator: 1, denominator: 2 });
        expect(ing.unit).toBe("cup");
        expect(ing.item).toBe("olive oil");
        expect(ing.notes).toBe("extra virgin");
      }
    });

    it("round-trips instruction groups with instructions", async () => {
      const db = getDb();
      await db.insert(schema.creators).values(makeCreator());
      await db.insert(schema.recipes).values(makeRecipe());

      const groupResult = await env.DB.prepare(
        "INSERT INTO instruction_groups (recipe_id, label, sort_order) VALUES (?, ?, ?) RETURNING id",
      )
        .bind("recipe-1", null, 0)
        .first<{ id: number }>();

      expect(groupResult).not.toBeNull();
      const groupId = groupResult!.id;

      await db.insert(schema.instructions).values({
        id: "inst-1",
        group_id: groupId,
        body: "Bring a large pot of salted water to a boil.",
        sort_order: 0,
      });

      const instructions = await db
        .select()
        .from(schema.instructions)
        .where(eq(schema.instructions.group_id, groupId));

      expect(instructions).toHaveLength(1);
      const inst = instructions[0];
      expect(inst).toBeDefined();
      if (inst) {
        expect(inst.body).toBe(
          "Bring a large pot of salted water to a boil.",
        );
      }
    });
  });

  // -----------------------------------------------------------------------
  // Collections
  // -----------------------------------------------------------------------

  describe("collections", () => {
    it("creates a collection and associates recipes", async () => {
      const db = getDb();
      await db.insert(schema.creators).values(makeCreator());
      await db.insert(schema.recipes).values(makeRecipe());
      await db
        .insert(schema.recipes)
        .values(makeRecipe({ id: "recipe-2", slug: "garlic-bread" }));

      await db.insert(schema.collections).values({
        id: "col-1",
        creator_id: "creator-1",
        name: "Italian Favorites",
        created_at: now,
        updated_at: now,
      });

      await db.insert(schema.collectionRecipes).values([
        { collection_id: "col-1", recipe_id: "recipe-1", sort_order: 0 },
        { collection_id: "col-1", recipe_id: "recipe-2", sort_order: 1 },
      ]);

      const recipes = await db
        .select()
        .from(schema.collectionRecipes)
        .where(eq(schema.collectionRecipes.collection_id, "col-1"));

      expect(recipes).toHaveLength(2);
    });

    it("prevents duplicate collection-recipe pairs (composite PK)", async () => {
      const db = getDb();
      await db.insert(schema.creators).values(makeCreator());
      await db.insert(schema.recipes).values(makeRecipe());
      await db.insert(schema.collections).values({
        id: "col-1",
        creator_id: "creator-1",
        name: "Test",
        created_at: now,
        updated_at: now,
      });
      await db.insert(schema.collectionRecipes).values({
        collection_id: "col-1",
        recipe_id: "recipe-1",
        sort_order: 0,
      });

      await expect(
        db.insert(schema.collectionRecipes).values({
          collection_id: "col-1",
          recipe_id: "recipe-1",
          sort_order: 1,
        }),
      ).rejects.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Product joined-table inheritance
  // -----------------------------------------------------------------------

  describe("product (joined-table inheritance)", () => {
    it("creates an Ebook product with base + detail", async () => {
      const db = getDb();
      await db.insert(schema.creators).values(makeCreator());
      await db.insert(schema.brandKits).values(makeBrandKit());
      await db.insert(schema.recipes).values(makeRecipe());

      await db.insert(schema.productBase).values({
        id: "product-1",
        creator_id: "creator-1",
        product_type: "Ebook",
        status: "Draft",
        title: "My Cookbook",
        brand_kit_id: "brand-kit-1",
        template_id: "template-classic",
        currency: "USD",
        ai_copy_reviewed: false,
        created_at: now,
        updated_at: now,
      });

      await db.insert(schema.ebookDetails).values({
        product_id: "product-1",
        recipe_ids: ["recipe-1"],
        chapters: [
          {
            title: "Chapter 1: Pasta",
            intro_copy: null,
            recipe_ids: ["recipe-1"],
          },
        ],
        intro_copy: "Welcome to my cookbook!",
        author_bio: "A passionate cook.",
        format: "LetterSize",
      });

      const bases = await db
        .select()
        .from(schema.productBase)
        .where(eq(schema.productBase.id, "product-1"));
      const details = await db
        .select()
        .from(schema.ebookDetails)
        .where(eq(schema.ebookDetails.product_id, "product-1"));

      expect(bases).toHaveLength(1);
      expect(details).toHaveLength(1);

      const base = bases[0];
      const detail = details[0];
      expect(base).toBeDefined();
      expect(detail).toBeDefined();
      if (base && detail) {
        expect(base.product_type).toBe("Ebook");
        expect(base.title).toBe("My Cookbook");
        expect(detail.recipe_ids).toEqual(["recipe-1"]);
        expect(detail.chapters).toEqual([
          {
            title: "Chapter 1: Pasta",
            intro_copy: null,
            recipe_ids: ["recipe-1"],
          },
        ]);
        expect(detail.format).toBe("LetterSize");
      }
    });

    it("creates a MealPlan product", async () => {
      const db = getDb();
      await db.insert(schema.creators).values(makeCreator());
      await db.insert(schema.brandKits).values(makeBrandKit());

      await db.insert(schema.productBase).values({
        id: "product-mp",
        creator_id: "creator-1",
        product_type: "MealPlan",
        status: "Draft",
        title: "Weekly Meal Plan",
        brand_kit_id: "brand-kit-1",
        template_id: "template-basic",
        currency: "USD",
        ai_copy_reviewed: false,
        created_at: now,
        updated_at: now,
      });

      await db.insert(schema.mealPlanDetails).values({
        product_id: "product-mp",
        days: [
          {
            day_number: 1,
            breakfast: null,
            lunch: null,
            dinner: null,
            snacks: [],
          },
        ],
        shopping_list: null,
      });

      const details = await db
        .select()
        .from(schema.mealPlanDetails)
        .where(eq(schema.mealPlanDetails.product_id, "product-mp"));

      expect(details).toHaveLength(1);
      const detail = details[0];
      expect(detail).toBeDefined();
      if (detail) {
        expect(detail.days).toEqual([
          {
            day_number: 1,
            breakfast: null,
            lunch: null,
            dinner: null,
            snacks: [],
          },
        ]);
        expect(detail.shopping_list).toBeNull();
      }
    });

    it("creates a LeadMagnet referencing a parent product", async () => {
      const db = getDb();
      await db.insert(schema.creators).values(makeCreator());
      await db.insert(schema.brandKits).values(makeBrandKit());
      await db.insert(schema.recipes).values(makeRecipe());

      // Parent product
      await db.insert(schema.productBase).values({
        id: "product-parent",
        creator_id: "creator-1",
        product_type: "Ebook",
        status: "Draft",
        title: "Full Cookbook",
        brand_kit_id: "brand-kit-1",
        template_id: "template-classic",
        currency: "USD",
        ai_copy_reviewed: false,
        created_at: now,
        updated_at: now,
      });

      // Lead magnet
      await db.insert(schema.productBase).values({
        id: "product-lm",
        creator_id: "creator-1",
        product_type: "LeadMagnet",
        status: "Draft",
        title: "Free Sample Recipes",
        brand_kit_id: "brand-kit-1",
        template_id: "template-basic",
        currency: "USD",
        ai_copy_reviewed: false,
        created_at: now,
        updated_at: now,
      });

      await db.insert(schema.leadMagnets).values({
        product_id: "product-lm",
        parent_product_id: "product-parent",
        recipe_ids: ["recipe-1"],
      });

      const lms = await db
        .select()
        .from(schema.leadMagnets)
        .where(eq(schema.leadMagnets.product_id, "product-lm"));

      expect(lms).toHaveLength(1);
      const lm = lms[0];
      expect(lm).toBeDefined();
      if (lm) {
        expect(lm.parent_product_id).toBe("product-parent");
        expect(lm.recipe_ids).toEqual(["recipe-1"]);
      }
    });

    it("cascades delete from product_base to detail tables", async () => {
      const db = getDb();
      await db.insert(schema.creators).values(makeCreator());
      await db.insert(schema.brandKits).values(makeBrandKit());

      await db.insert(schema.productBase).values({
        id: "product-del",
        creator_id: "creator-1",
        product_type: "RecipeCardPack",
        status: "Draft",
        title: "Card Pack",
        brand_kit_id: "brand-kit-1",
        template_id: "template-basic",
        currency: "USD",
        ai_copy_reviewed: false,
        created_at: now,
        updated_at: now,
      });

      await db.insert(schema.recipeCardPacks).values({
        product_id: "product-del",
        recipe_ids: [],
      });

      // Verify detail exists
      let packs = await db
        .select()
        .from(schema.recipeCardPacks)
        .where(eq(schema.recipeCardPacks.product_id, "product-del"));
      expect(packs).toHaveLength(1);

      // Enable FK enforcement for cascade and delete
      // Foreign keys are enabled by default in D1
      await db
        .delete(schema.productBase)
        .where(eq(schema.productBase.id, "product-del"));

      packs = await db
        .select()
        .from(schema.recipeCardPacks)
        .where(eq(schema.recipeCardPacks.product_id, "product-del"));
      expect(packs).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Foreign key constraints
  // -----------------------------------------------------------------------

  describe("foreign key constraints", () => {
    it("cascades delete from creator to recipes", async () => {
      const db = getDb();
      await db.insert(schema.creators).values(makeCreator());
      await db.insert(schema.recipes).values(makeRecipe());

      // Enable FK enforcement for cascade
      // Foreign keys are enabled by default in D1
      await db
        .delete(schema.creators)
        .where(eq(schema.creators.id, "creator-1"));

      const recipes = await db.select().from(schema.recipes);
      expect(recipes).toHaveLength(0);
    });

    it("cascades delete from recipe to photos", async () => {
      const db = getDb();
      await db.insert(schema.creators).values(makeCreator());
      await db.insert(schema.recipes).values(makeRecipe());
      await db.insert(schema.photos).values({
        id: "photo-1",
        recipe_id: "recipe-1",
        url: "https://cdn.example.com/photo.jpg",
        alt_text: "A beautiful pasta dish",
        width: 1200,
        height: 800,
        sort_order: 0,
      });

      // Foreign keys are enabled by default in D1
      await db
        .delete(schema.recipes)
        .where(eq(schema.recipes.id, "recipe-1"));

      const photos = await db.select().from(schema.photos);
      expect(photos).toHaveLength(0);
    });

    it("cascades delete from recipe to ingredient groups and ingredients", async () => {
      const db = getDb();
      await db.insert(schema.creators).values(makeCreator());
      await db.insert(schema.recipes).values(makeRecipe());

      const groupResult = await env.DB.prepare(
        "INSERT INTO ingredient_groups (recipe_id, label, sort_order) VALUES (?, ?, ?) RETURNING id",
      )
        .bind("recipe-1", null, 0)
        .first<{ id: number }>();

      expect(groupResult).not.toBeNull();

      await db.insert(schema.ingredients).values({
        id: "ing-cascade-1",
        group_id: groupResult!.id,
        item: "flour",
        sort_order: 0,
      });

      // Foreign keys are enabled by default in D1
      await db
        .delete(schema.recipes)
        .where(eq(schema.recipes.id, "recipe-1"));

      const groups = await db.select().from(schema.ingredientGroups);
      const ings = await db.select().from(schema.ingredients);
      expect(groups).toHaveLength(0);
      expect(ings).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Engagement events & scores
  // -----------------------------------------------------------------------

  describe("engagement", () => {
    it("inserts engagement events", async () => {
      const db = getDb();
      await db.insert(schema.creators).values(makeCreator());
      await db.insert(schema.recipes).values(makeRecipe());

      await db.insert(schema.recipeEngagementEvents).values({
        id: "evt-1",
        creator_id: "creator-1",
        recipe_id: "recipe-1",
        event_type: "SaveClick",
        source: "KitWebhook",
        occurred_at: now,
      });

      await db.insert(schema.recipeEngagementEvents).values({
        id: "evt-2",
        creator_id: "creator-1",
        recipe_id: "recipe-1",
        event_type: "PurchaseAttribution",
        event_data: { product_id: "product-1" },
        source: "Internal",
        occurred_at: now,
      });

      const events = await db
        .select()
        .from(schema.recipeEngagementEvents)
        .where(eq(schema.recipeEngagementEvents.recipe_id, "recipe-1"));

      expect(events).toHaveLength(2);

      const purchaseEvent = events.find(
        (e) => e.event_type === "PurchaseAttribution",
      );
      expect(purchaseEvent).toBeDefined();
      if (purchaseEvent) {
        expect(purchaseEvent.event_data).toEqual({
          product_id: "product-1",
        });
      }
    });

    it("inserts and retrieves engagement scores", async () => {
      const db = getDb();
      await db.insert(schema.creators).values(makeCreator());
      await db.insert(schema.recipes).values(makeRecipe());

      await db.insert(schema.recipeEngagementScores).values({
        recipe_id: "recipe-1",
        creator_id: "creator-1",
        score: 7.5,
        computed_at: now,
        save_clicks_30d: 42,
        sequence_triggers_30d: 5,
        card_views_30d: 200,
        purchase_attributions_all: 3,
      });

      const scores = await db
        .select()
        .from(schema.recipeEngagementScores)
        .where(eq(schema.recipeEngagementScores.recipe_id, "recipe-1"));

      expect(scores).toHaveLength(1);
      const score = scores[0];
      expect(score).toBeDefined();
      if (score) {
        expect(score.score).toBe(7.5);
        expect(score.save_clicks_30d).toBe(42);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Segment profiles
  // -----------------------------------------------------------------------

  describe("segment profiles", () => {
    it("round-trips segment profile with JSON segments", async () => {
      const db = getDb();
      await db.insert(schema.creators).values(makeCreator());

      const segments = {
        GlutenFree: {
          subscriber_count: 150,
          engagement_rate: 0.45,
          growth_rate_30d: 0.12,
          top_recipe_ids: ["recipe-1", "recipe-2"],
        },
        Vegan: {
          subscriber_count: 80,
          engagement_rate: 0.38,
          growth_rate_30d: -0.05,
          top_recipe_ids: ["recipe-3"],
        },
      };

      await db.insert(schema.segmentProfiles).values({
        creator_id: "creator-1",
        computed_at: now,
        segments,
      });

      const rows = await db
        .select()
        .from(schema.segmentProfiles)
        .where(eq(schema.segmentProfiles.creator_id, "creator-1"));

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row).toBeDefined();
      if (row) {
        expect(row.segments).toEqual(segments);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Import jobs
  // -----------------------------------------------------------------------

  describe("import jobs", () => {
    it("round-trips an import job with source and extract data", async () => {
      const db = getDb();
      await db.insert(schema.creators).values(makeCreator());

      await db.insert(schema.importJobs).values({
        id: "job-1",
        creator_id: "creator-1",
        status: "NeedsReview",
        source_type: "FromUrl",
        source_data: { url: "https://example.com/recipe" },
        extract_data: {
          title: "Extracted Recipe",
          confidence: { overall: 0.92, field_scores: {} },
        },
        created_at: now,
        updated_at: now,
      });

      const rows = await db
        .select()
        .from(schema.importJobs)
        .where(eq(schema.importJobs.id, "job-1"));

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row).toBeDefined();
      if (row) {
        expect(row.status).toBe("NeedsReview");
        expect(row.source_data).toEqual({
          url: "https://example.com/recipe",
        });
        expect(row.extract_data).toEqual({
          title: "Extracted Recipe",
          confidence: { overall: 0.92, field_scores: {} },
        });
      }
    });
  });

  // -----------------------------------------------------------------------
  // Team members
  // -----------------------------------------------------------------------

  describe("team members", () => {
    it("inserts and retrieves a team member", async () => {
      const db = getDb();
      await db.insert(schema.creators).values(makeCreator());

      await db.insert(schema.teamMembers).values({
        id: "tm-1",
        creator_id: "creator-1",
        email: "team@example.com",
        role: "Member",
        invited_at: now,
      });

      const rows = await db
        .select()
        .from(schema.teamMembers)
        .where(eq(schema.teamMembers.creator_id, "creator-1"));

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row).toBeDefined();
      if (row) {
        expect(row.email).toBe("team@example.com");
        expect(row.accepted_at).toBeNull();
      }
    });
  });

  // -----------------------------------------------------------------------
  // Published listings
  // -----------------------------------------------------------------------

  describe("published listings", () => {
    it("creates a published listing for a product", async () => {
      const db = getDb();
      await db.insert(schema.creators).values(makeCreator());
      await db.insert(schema.brandKits).values(makeBrandKit());

      await db.insert(schema.productBase).values({
        id: "product-pub",
        creator_id: "creator-1",
        product_type: "RecipeCardPack",
        status: "Published",
        title: "Published Pack",
        brand_kit_id: "brand-kit-1",
        template_id: "template-basic",
        currency: "USD",
        ai_copy_reviewed: true,
        pdf_url: "https://cdn.example.com/pack.pdf",
        created_at: now,
        updated_at: now,
      });

      await db.insert(schema.publishedListings).values({
        product_id: "product-pub",
        platform: "Gumroad",
        listing_url: "https://gumroad.com/l/pack",
        platform_id: "gum-123",
        published_at: now,
      });

      const listings = await db
        .select()
        .from(schema.publishedListings)
        .where(eq(schema.publishedListings.product_id, "product-pub"));

      expect(listings).toHaveLength(1);
      const listing = listings[0];
      expect(listing).toBeDefined();
      if (listing) {
        expect(listing.platform).toBe("Gumroad");
        expect(listing.listing_url).toBe("https://gumroad.com/l/pack");
      }
    });
  });

  // -----------------------------------------------------------------------
  // Brand kits
  // -----------------------------------------------------------------------

  describe("brand kits", () => {
    it("round-trips font fallback JSON arrays", async () => {
      const db = getDb();
      await db.insert(schema.creators).values(makeCreator());
      await db.insert(schema.brandKits).values(makeBrandKit());

      const rows = await db
        .select()
        .from(schema.brandKits)
        .where(eq(schema.brandKits.id, "brand-kit-1"));

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row).toBeDefined();
      if (row) {
        expect(row.heading_font_fallback).toEqual(["Arial", "sans-serif"]);
        expect(row.body_font_fallback).toEqual(["Helvetica", "sans-serif"]);
        expect(row.primary_color).toBe("#FF5733");
        expect(row.secondary_color).toBeNull();
      }
    });
  });

  // -----------------------------------------------------------------------
  // Photos
  // -----------------------------------------------------------------------

  describe("photos", () => {
    it("inserts and retrieves photos with sort order", async () => {
      const db = getDb();
      await db.insert(schema.creators).values(makeCreator());
      await db.insert(schema.recipes).values(makeRecipe());

      await db.insert(schema.photos).values([
        {
          id: "photo-1",
          recipe_id: "recipe-1",
          url: "https://cdn.example.com/photo1.jpg",
          alt_text: "Finished dish",
          width: 1200,
          height: 800,
          sort_order: 0,
        },
        {
          id: "photo-2",
          recipe_id: "recipe-1",
          url: "https://cdn.example.com/photo2.jpg",
          alt_text: null,
          width: 800,
          height: 600,
          sort_order: 1,
        },
      ]);

      const photos = await db
        .select()
        .from(schema.photos)
        .where(eq(schema.photos.recipe_id, "recipe-1"));

      expect(photos).toHaveLength(2);
      const primary = photos.find((p) => p.sort_order === 0);
      expect(primary).toBeDefined();
      if (primary) {
        expect(primary.alt_text).toBe("Finished dish");
        expect(primary.width).toBe(1200);
      }
    });
  });
});
