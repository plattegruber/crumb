/**
 * Tests for the product builder service (SPEC §8).
 *
 * Uses in-process D1 to test the service layer directly.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { createDb } from "../../src/db/index.js";
import { withCreatorScope } from "../../src/middleware/creator-scope.js";
import {
  createEbook,
  createMealPlan,
  createRecipeCardPack,
  createLeadMagnet,
  getProduct,
  listProducts,
  updateProduct,
  reviewAiCopy,
  publishProduct,
  generateShoppingList,
  renderTemplate,
} from "../../src/services/product.js";
import type {
  CreateEbookInput,
  CreateMealPlanInput,
  CreateRecipeCardPackInput,
  RecipeIngredientData,
  BrandKitValues,
} from "../../src/services/product.js";
import type { CreatorId } from "../../src/types/auth.js";
import { createTestTables, cleanTestTables } from "../helpers/db-setup.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CREATOR_ID = "creator-product-1" as CreatorId;
const NOW_ISO = new Date().toISOString();

function insertCreator(creatorId: string, tier: string = "Free"): string {
  return `INSERT INTO creators (id, email, name, password_hash, subscription_tier, subscription_started_at, created_at, updated_at) VALUES ('${creatorId}', 'test@test.com', 'Test Creator', 'hash', '${tier}', '${NOW_ISO}', '${NOW_ISO}', '${NOW_ISO}')`;
}

function insertBrandKit(creatorId: string, brandKitId: string = "bk-1"): string {
  return `INSERT INTO brand_kits (id, creator_id, name, primary_color, heading_font_family, heading_font_fallback, body_font_family, body_font_fallback, created_at, updated_at) VALUES ('${brandKitId}', '${creatorId}', 'Default', '#FF5733', 'Georgia', '["serif"]', 'Arial', '["sans-serif"]', '${NOW_ISO}', '${NOW_ISO}')`;
}

function insertRecipe(creatorId: string, recipeId: string, title: string): string {
  return `INSERT INTO recipes (id, creator_id, title, slug, source_type, status, created_at, updated_at) VALUES ('${recipeId}', '${creatorId}', '${title}', '${title.toLowerCase().replace(/\s+/g, "-")}', 'Manual', 'Active', '${NOW_ISO}', '${NOW_ISO}')`;
}

function _insertIngredientGroup(
  recipeId: string,
  groupId: number,
  label: string | null = null,
): string {
  return `INSERT INTO ingredient_groups (id, recipe_id, label, sort_order) VALUES (${groupId}, '${recipeId}', ${label !== null ? `'${label}'` : "NULL"}, 0)`;
}

function _insertIngredient(ingredientId: string, groupId: number, item: string): string {
  return `INSERT INTO ingredients (id, group_id, item, sort_order) VALUES ('${ingredientId}', ${groupId}, '${item}', 0)`;
}

function insertEngagementScore(creatorId: string, recipeId: string, score: number): string {
  return `INSERT INTO recipe_engagement_scores (recipe_id, creator_id, score, computed_at, save_clicks_30d, sequence_triggers_30d, card_views_30d, purchase_attributions_all) VALUES ('${recipeId}', '${creatorId}', ${score}, '${NOW_ISO}', 10, 5, 20, 2)`;
}

function makeEbookInput(overrides: Partial<CreateEbookInput> = {}): CreateEbookInput {
  return {
    id: "ebook-1",
    title: "Summer Recipes Ebook",
    description: "A collection of summer recipes",
    brand_kit_id: "bk-1",
    template_id: "ebook-basic",
    recipe_ids: ["r-1", "r-2", "r-3"],
    chapters: [
      { title: "Appetizers", intro_copy: "Start your meal right", recipe_ids: ["r-1"] },
      { title: "Main Courses", intro_copy: "The heart of the meal", recipe_ids: ["r-2", "r-3"] },
    ],
    intro_copy: "Welcome to my summer cookbook",
    author_bio: "A passionate home cook",
    format: "LetterSize",
    suggested_price_cents: 999,
    ...overrides,
  };
}

function makeMealPlanInput(overrides: Partial<CreateMealPlanInput> = {}): CreateMealPlanInput {
  return {
    id: "mp-1",
    title: "7 Day Meal Plan",
    description: "A week of healthy meals",
    brand_kit_id: "bk-1",
    template_id: "ebook-basic",
    days: [
      { day_number: 1, breakfast: "r-1", lunch: "r-2", dinner: "r-3", snacks: [] },
      { day_number: 2, breakfast: "r-2", lunch: "r-1", dinner: "r-3", snacks: ["r-1"] },
    ],
    suggested_price_cents: 499,
    ...overrides,
  };
}

function makeRecipeCardPackInput(
  overrides: Partial<CreateRecipeCardPackInput> = {},
): CreateRecipeCardPackInput {
  return {
    id: "rcp-1",
    title: "Best of 2025 Cards",
    description: "Top recipes of the year",
    brand_kit_id: "bk-1",
    template_id: "recipe-card-basic",
    recipe_ids: ["r-1", "r-2", "r-3"],
    suggested_price_cents: 499,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Product Service", () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(async () => {
    await createTestTables(env.DB);
    await cleanTestTables(env.DB);
    db = createDb(env.DB);

    // Insert test data
    await env.DB.exec(insertCreator(TEST_CREATOR_ID));
    await env.DB.exec(insertBrandKit(TEST_CREATOR_ID));
    await env.DB.exec(insertRecipe(TEST_CREATOR_ID, "r-1", "Lemon Pasta"));
    await env.DB.exec(insertRecipe(TEST_CREATOR_ID, "r-2", "Chicken Curry"));
    await env.DB.exec(insertRecipe(TEST_CREATOR_ID, "r-3", "Berry Smoothie"));
  });

  // -----------------------------------------------------------------------
  // Ebook creation
  // -----------------------------------------------------------------------

  describe("createEbook", () => {
    it("creates an ebook product with recipes and chapters", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      const input = makeEbookInput();

      const result = await createEbook(scopedDb, input);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.base.title).toBe("Summer Recipes Ebook");
      expect(result.value.base.product_type).toBe("Ebook");
      expect(result.value.base.status).toBe("Draft");
      expect(result.value.base.ai_copy_reviewed).toBe(false);
      expect(result.value.base.pdf_url).toBeNull();
      expect(result.value.base.suggested_price_cents).toBe(999);

      // Detail should have ebook-specific fields
      expect(result.value.detail).not.toBeNull();
      if (result.value.detail === null) return;
      const detail = result.value.detail;
      expect(detail["format"]).toBe("LetterSize");
      expect(detail["intro_copy"]).toBe("Welcome to my summer cookbook");
      expect(detail["author_bio"]).toBe("A passionate home cook");

      const chapters = detail["chapters"] as ReadonlyArray<Record<string, unknown>>;
      expect(chapters).toHaveLength(2);
      expect(chapters[0]?.["title"]).toBe("Appetizers");
    });

    it("rejects ebook with no recipes", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      const input = makeEbookInput({ recipe_ids: [] });

      const result = await createEbook(scopedDb, input);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("invalid_input");
    });

    it("rejects ebook with no chapters", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      const input = makeEbookInput({ chapters: [] });

      const result = await createEbook(scopedDb, input);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("invalid_input");
    });
  });

  // -----------------------------------------------------------------------
  // Meal plan creation
  // -----------------------------------------------------------------------

  describe("createMealPlan", () => {
    it("creates a meal plan product with day grid", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      const input = makeMealPlanInput();

      const result = await createMealPlan(scopedDb, input);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.base.title).toBe("7 Day Meal Plan");
      expect(result.value.base.product_type).toBe("MealPlan");
      expect(result.value.base.status).toBe("Draft");

      expect(result.value.detail).not.toBeNull();
      if (result.value.detail === null) return;
      const detail = result.value.detail;
      const days = detail["days"] as ReadonlyArray<Record<string, unknown>>;
      expect(days).toHaveLength(2);
      expect(days[0]?.["day_number"]).toBe(1);
      expect(days[0]?.["breakfast"]).toBe("r-1");
    });

    it("rejects meal plan with no days", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      const input = makeMealPlanInput({ days: [] });

      const result = await createMealPlan(scopedDb, input);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("invalid_input");
    });
  });

  // -----------------------------------------------------------------------
  // Recipe card pack creation
  // -----------------------------------------------------------------------

  describe("createRecipeCardPack", () => {
    it("creates a recipe card pack product", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      const input = makeRecipeCardPackInput();

      const result = await createRecipeCardPack(scopedDb, input);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.base.title).toBe("Best of 2025 Cards");
      expect(result.value.base.product_type).toBe("RecipeCardPack");

      expect(result.value.detail).not.toBeNull();
      if (result.value.detail === null) return;
      const recipeIds = result.value.detail["recipe_ids"] as readonly string[];
      expect(recipeIds).toHaveLength(3);
    });

    it("rejects recipe card pack with no recipes", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      const input = makeRecipeCardPackInput({ recipe_ids: [] });

      const result = await createRecipeCardPack(scopedDb, input);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("invalid_input");
    });
  });

  // -----------------------------------------------------------------------
  // Shopping list generation
  // -----------------------------------------------------------------------

  describe("generateShoppingList", () => {
    it("merges duplicate ingredients case-insensitively", () => {
      const recipes: RecipeIngredientData[] = [
        {
          recipe_id: "r-1",
          recipe_title: "Recipe 1",
          ingredients: [
            { item: "Olive Oil", quantity_type: null, quantity_data: null, unit: null },
            { item: "Salt", quantity_type: null, quantity_data: null, unit: null },
          ],
        },
        {
          recipe_id: "r-2",
          recipe_title: "Recipe 2",
          ingredients: [
            { item: "olive oil", quantity_type: null, quantity_data: null, unit: null },
            { item: "Pepper", quantity_type: null, quantity_data: null, unit: null },
          ],
        },
      ];

      const result = generateShoppingList(recipes);

      // Olive oil should be merged (single entry with refs to both recipes)
      let oliveOilFound = false;
      for (const section of result.sections) {
        for (const item of section.items) {
          if (item.item.toLowerCase() === "olive oil") {
            oliveOilFound = true;
            expect(item.recipe_refs).toHaveLength(2);
            expect(item.recipe_refs).toContain("r-1");
            expect(item.recipe_refs).toContain("r-2");
          }
        }
      }
      expect(oliveOilFound).toBe(true);
    });

    it("organizes items by grocery section", () => {
      const recipes: RecipeIngredientData[] = [
        {
          recipe_id: "r-1",
          recipe_title: "Recipe 1",
          ingredients: [
            { item: "chicken", quantity_type: null, quantity_data: null, unit: null },
            { item: "butter", quantity_type: null, quantity_data: null, unit: null },
            { item: "lettuce", quantity_type: null, quantity_data: null, unit: null },
            { item: "flour", quantity_type: null, quantity_data: null, unit: null },
            { item: "cinnamon", quantity_type: null, quantity_data: null, unit: null },
            { item: "bread", quantity_type: null, quantity_data: null, unit: null },
          ],
        },
      ];

      const result = generateShoppingList(recipes);

      const sectionNames = result.sections.map((s) => s.label);
      expect(sectionNames).toContain("Produce");
      expect(sectionNames).toContain("Dairy");
      expect(sectionNames).toContain("Meat");
      expect(sectionNames).toContain("Pantry");
      expect(sectionNames).toContain("Spices");
      expect(sectionNames).toContain("Bakery");

      // Verify specific categorization
      const meatSection = result.sections.find((s) => s.label === "Meat");
      expect(meatSection).toBeDefined();
      if (!meatSection) return;
      expect(meatSection.items.some((i) => i.item === "chicken")).toBe(true);

      const dairySection = result.sections.find((s) => s.label === "Dairy");
      expect(dairySection).toBeDefined();
      if (!dairySection) return;
      expect(dairySection.items.some((i) => i.item === "butter")).toBe(true);
    });

    it("tracks which recipes need each item", () => {
      const recipes: RecipeIngredientData[] = [
        {
          recipe_id: "r-1",
          recipe_title: "Recipe 1",
          ingredients: [{ item: "garlic", quantity_type: null, quantity_data: null, unit: null }],
        },
        {
          recipe_id: "r-2",
          recipe_title: "Recipe 2",
          ingredients: [{ item: "garlic", quantity_type: null, quantity_data: null, unit: null }],
        },
        {
          recipe_id: "r-3",
          recipe_title: "Recipe 3",
          ingredients: [{ item: "garlic", quantity_type: null, quantity_data: null, unit: null }],
        },
      ];

      const result = generateShoppingList(recipes);

      let garlicItem: { item: string; recipe_refs: readonly string[] } | null = null;
      for (const section of result.sections) {
        for (const item of section.items) {
          if (item.item === "garlic") {
            garlicItem = item;
          }
        }
      }

      expect(garlicItem).not.toBeNull();
      if (garlicItem === null) return;
      expect(garlicItem.recipe_refs).toHaveLength(3);
      expect(garlicItem.recipe_refs).toContain("r-1");
      expect(garlicItem.recipe_refs).toContain("r-2");
      expect(garlicItem.recipe_refs).toContain("r-3");
    });

    it("returns empty sections for empty recipes", () => {
      const result = generateShoppingList([]);
      expect(result.sections).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Lead magnet auto-generation
  // -----------------------------------------------------------------------

  describe("createLeadMagnet", () => {
    it("creates a lead magnet from a parent ebook", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      // Create parent ebook first
      await createEbook(scopedDb, makeEbookInput());

      const result = await createLeadMagnet(scopedDb, "ebook-1", "lm-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.base.product_type).toBe("LeadMagnet");
      expect(result.value.base.title).toBe("Summer Recipes Ebook — Free Sample");
      expect(result.value.base.status).toBe("Draft");

      expect(result.value.detail).not.toBeNull();
      if (result.value.detail === null) return;
      expect(result.value.detail["parent_product_id"]).toBe("ebook-1");
      const recipeIds = result.value.detail["recipe_ids"] as readonly string[];
      expect(recipeIds.length).toBeGreaterThan(0);
      expect(recipeIds.length).toBeLessThanOrEqual(5);
    });

    it("selects recipes by engagement score when available", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      // Create more recipes for a larger pool
      await env.DB.exec(insertRecipe(TEST_CREATOR_ID, "r-4", "Garlic Bread"));
      await env.DB.exec(insertRecipe(TEST_CREATOR_ID, "r-5", "Tomato Soup"));
      await env.DB.exec(insertRecipe(TEST_CREATOR_ID, "r-6", "Caesar Salad"));
      await env.DB.exec(insertRecipe(TEST_CREATOR_ID, "r-7", "Grilled Salmon"));

      // Set engagement scores — r-3, r-5, r-7 are highest
      await env.DB.exec(insertEngagementScore(TEST_CREATOR_ID, "r-1", 2.0));
      await env.DB.exec(insertEngagementScore(TEST_CREATOR_ID, "r-2", 3.0));
      await env.DB.exec(insertEngagementScore(TEST_CREATOR_ID, "r-3", 9.0));
      await env.DB.exec(insertEngagementScore(TEST_CREATOR_ID, "r-4", 1.0));
      await env.DB.exec(insertEngagementScore(TEST_CREATOR_ID, "r-5", 8.0));
      await env.DB.exec(insertEngagementScore(TEST_CREATOR_ID, "r-6", 4.0));
      await env.DB.exec(insertEngagementScore(TEST_CREATOR_ID, "r-7", 7.5));

      // Create ebook with all 7 recipes
      await createEbook(
        scopedDb,
        makeEbookInput({
          recipe_ids: ["r-1", "r-2", "r-3", "r-4", "r-5", "r-6", "r-7"],
          chapters: [
            {
              title: "All",
              intro_copy: null,
              recipe_ids: ["r-1", "r-2", "r-3", "r-4", "r-5", "r-6", "r-7"],
            },
          ],
        }),
      );

      const result = await createLeadMagnet(scopedDb, "ebook-1", "lm-score-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const detail = result.value.detail;
      expect(detail).not.toBeNull();
      if (detail === null) return;

      const recipeIds = detail["recipe_ids"] as readonly string[];
      expect(recipeIds).toHaveLength(5);
      // The top 5 by score should be r-3(9), r-5(8), r-7(7.5), r-6(4), r-2(3)
      expect(recipeIds).toContain("r-3");
      expect(recipeIds).toContain("r-5");
      expect(recipeIds).toContain("r-7");
    });

    it("falls back to first 5 recipes when no engagement scores", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      // Create more recipes
      await env.DB.exec(insertRecipe(TEST_CREATOR_ID, "r-4", "Garlic Bread"));
      await env.DB.exec(insertRecipe(TEST_CREATOR_ID, "r-5", "Tomato Soup"));
      await env.DB.exec(insertRecipe(TEST_CREATOR_ID, "r-6", "Caesar Salad"));

      // Create ebook with 6 recipes, no engagement scores
      await createEbook(
        scopedDb,
        makeEbookInput({
          recipe_ids: ["r-1", "r-2", "r-3", "r-4", "r-5", "r-6"],
          chapters: [
            {
              title: "All",
              intro_copy: null,
              recipe_ids: ["r-1", "r-2", "r-3", "r-4", "r-5", "r-6"],
            },
          ],
        }),
      );

      const result = await createLeadMagnet(scopedDb, "ebook-1", "lm-fallback-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const detail = result.value.detail;
      expect(detail).not.toBeNull();
      if (detail === null) return;

      const recipeIds = detail["recipe_ids"] as readonly string[];
      expect(recipeIds).toHaveLength(5);
      // Should be first 5 from the list
      expect(recipeIds).toEqual(["r-1", "r-2", "r-3", "r-4", "r-5"]);
    });

    it("rejects creating lead magnet from another lead magnet (§2.20.4)", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      // Create parent ebook
      await createEbook(scopedDb, makeEbookInput());

      // Create lead magnet
      const lm = await createLeadMagnet(scopedDb, "ebook-1", "lm-1");
      expect(lm.ok).toBe(true);

      // Try to create lead magnet from lead magnet
      const result = await createLeadMagnet(scopedDb, "lm-1", "lm-2");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("invariant_violation");
      if (result.error.type === "invariant_violation") {
        expect(result.error.message).toContain("LeadMagnet");
      }
    });

    it("returns not_found for non-existent parent", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await createLeadMagnet(scopedDb, "nonexistent", "lm-1");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not_found");
    });
  });

  // -----------------------------------------------------------------------
  // Product CRUD
  // -----------------------------------------------------------------------

  describe("getProduct / listProducts / updateProduct", () => {
    it("gets a product with detail", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      await createEbook(scopedDb, makeEbookInput());

      const result = await getProduct(scopedDb, "ebook-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.base.id).toBe("ebook-1");
      expect(result.value.detail).not.toBeNull();
    });

    it("returns not_found for non-existent product", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await getProduct(scopedDb, "nonexistent");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not_found");
    });

    it("lists products with pagination", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      await createEbook(scopedDb, makeEbookInput({ id: "eb-1" }));
      await createRecipeCardPack(scopedDb, makeRecipeCardPackInput({ id: "rcp-1" }));
      await createMealPlan(scopedDb, makeMealPlanInput({ id: "mp-1" }));

      const result = await listProducts(scopedDb, { perPage: 2, page: 1 });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.data).toHaveLength(2);
      expect(result.value.total).toBe(3);
      expect(result.value.totalPages).toBe(2);
    });

    it("filters products by type", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      await createEbook(scopedDb, makeEbookInput({ id: "eb-1" }));
      await createRecipeCardPack(scopedDb, makeRecipeCardPackInput({ id: "rcp-1" }));

      const result = await listProducts(scopedDb, { product_type: "Ebook" });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.data).toHaveLength(1);
      expect(result.value.data[0]?.product_type).toBe("Ebook");
    });

    it("updates product base fields", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      await createEbook(scopedDb, makeEbookInput());

      const result = await updateProduct(scopedDb, "ebook-1", {
        title: "Updated Title",
        description: "Updated description",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.base.title).toBe("Updated Title");
      expect(result.value.base.description).toBe("Updated description");
    });
  });

  // -----------------------------------------------------------------------
  // AI copy review gate
  // -----------------------------------------------------------------------

  describe("AI copy review", () => {
    it("marks AI copy as reviewed", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      await createEbook(scopedDb, makeEbookInput());

      // Initially not reviewed
      const before = await getProduct(scopedDb, "ebook-1");
      expect(before.ok).toBe(true);
      if (!before.ok) return;
      expect(before.value.base.ai_copy_reviewed).toBe(false);

      // Review
      const result = await reviewAiCopy(scopedDb, "ebook-1");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.base.ai_copy_reviewed).toBe(true);
    });

    it("cannot publish without AI copy review (§2.20.5)", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      await createEbook(scopedDb, makeEbookInput());

      // Set pdf_url to simulate rendering complete but don't review copy
      await env.DB.exec(
        `UPDATE product_base SET pdf_url = 'https://cdn.example.com/ebook.pdf' WHERE id = 'ebook-1'`,
      );

      const result = await publishProduct(scopedDb, "ebook-1");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("invariant_violation");
      if (result.error.type === "invariant_violation") {
        expect(result.error.message).toContain("AI copy must be reviewed");
      }
    });
  });

  // -----------------------------------------------------------------------
  // Publish invariants
  // -----------------------------------------------------------------------

  describe("publishProduct", () => {
    it("requires pdf_url before publishing (§2.20.3)", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      await createEbook(scopedDb, makeEbookInput());

      // Review copy but don't set pdf_url
      await reviewAiCopy(scopedDb, "ebook-1");

      const result = await publishProduct(scopedDb, "ebook-1");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("invariant_violation");
      if (result.error.type === "invariant_violation") {
        expect(result.error.message).toContain("PDF");
      }
    });

    it("publishes successfully when all guards pass", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      await createEbook(scopedDb, makeEbookInput());

      // Set pdf_url and review copy
      await env.DB.exec(
        `UPDATE product_base SET pdf_url = 'https://cdn.example.com/ebook.pdf' WHERE id = 'ebook-1'`,
      );
      await reviewAiCopy(scopedDb, "ebook-1");

      const result = await publishProduct(scopedDb, "ebook-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.base.status).toBe("Published");
    });

    it("enforces free tier 1 published product limit (§2.20.10)", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      // Create and publish first product
      await createEbook(scopedDb, makeEbookInput({ id: "eb-1" }));
      await env.DB.exec(
        `UPDATE product_base SET pdf_url = 'https://cdn.example.com/1.pdf' WHERE id = 'eb-1'`,
      );
      await reviewAiCopy(scopedDb, "eb-1");
      const pub1 = await publishProduct(scopedDb, "eb-1");
      expect(pub1.ok).toBe(true);

      // Create and try to publish second product
      await createRecipeCardPack(scopedDb, makeRecipeCardPackInput({ id: "rcp-1" }));
      await env.DB.exec(
        `UPDATE product_base SET pdf_url = 'https://cdn.example.com/2.pdf' WHERE id = 'rcp-1'`,
      );
      await reviewAiCopy(scopedDb, "rcp-1");

      const result = await publishProduct(scopedDb, "rcp-1");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("free_tier_limit");
    });

    it("allows paid tier to publish multiple products", async () => {
      // Upgrade creator
      await env.DB.exec(
        `UPDATE creators SET subscription_tier = 'Creator' WHERE id = '${TEST_CREATOR_ID}'`,
      );

      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      // Create and publish first product
      await createEbook(scopedDb, makeEbookInput({ id: "eb-1" }));
      await env.DB.exec(
        `UPDATE product_base SET pdf_url = 'https://cdn.example.com/1.pdf' WHERE id = 'eb-1'`,
      );
      await reviewAiCopy(scopedDb, "eb-1");
      await publishProduct(scopedDb, "eb-1");

      // Create and publish second product
      await createRecipeCardPack(scopedDb, makeRecipeCardPackInput({ id: "rcp-1" }));
      await env.DB.exec(
        `UPDATE product_base SET pdf_url = 'https://cdn.example.com/2.pdf' WHERE id = 'rcp-1'`,
      );
      await reviewAiCopy(scopedDb, "rcp-1");

      const result = await publishProduct(scopedDb, "rcp-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.base.status).toBe("Published");
    });
  });

  // -----------------------------------------------------------------------
  // Template rendering
  // -----------------------------------------------------------------------

  describe("renderTemplate", () => {
    it("renders a template with BrandKit values", () => {
      const brandKit: BrandKitValues = {
        primary_color: "#FF5733",
        secondary_color: "#C70039",
        accent_color: "#FFC300",
        heading_font_family: "Georgia",
        body_font_family: "Arial",
        logo_url: null,
      };

      const data: Record<string, string> = {
        "product.title": "My Cookbook",
        "product.description": "A great cookbook",
        content: "<p>Hello World</p>",
      };

      const result = renderTemplate("ebook-basic", data, brandKit);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toContain("#FF5733");
      expect(result.value).toContain("Georgia");
      expect(result.value).toContain("Arial");
      expect(result.value).toContain("My Cookbook");
      expect(result.value).toContain("A great cookbook");
      expect(result.value).toContain("<p>Hello World</p>");
    });

    it("returns not_found for unknown template", () => {
      const brandKit: BrandKitValues = {
        primary_color: "#000",
        secondary_color: null,
        accent_color: null,
        heading_font_family: "sans-serif",
        body_font_family: "sans-serif",
        logo_url: null,
      };

      const result = renderTemplate("nonexistent", {}, brandKit);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not_found");
    });

    it("handles null BrandKit values gracefully", () => {
      const brandKit: BrandKitValues = {
        primary_color: "#123456",
        secondary_color: null,
        accent_color: null,
        heading_font_family: "Helvetica",
        body_font_family: "Verdana",
        logo_url: null,
      };

      const result = renderTemplate("ebook-basic", { "product.title": "Test" }, brandKit);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Null values should be replaced with empty strings
      expect(result.value).toContain("--secondary-color: ;");
    });
  });
});
