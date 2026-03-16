/**
 * Tests for the recipe service (SPEC §6).
 *
 * Uses a standalone Hono app with in-process D1 to test the
 * service layer directly without HTTP routing.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { createDb } from "../../src/db/index.js";
import { withCreatorScope } from "../../src/middleware/creator-scope.js";
import {
  createRecipe,
  updateRecipe,
  deleteRecipe,
  getRecipe,
  listRecipes,
  checkDuplicates,
} from "../../src/services/recipe.js";
import type { CreateRecipeInput } from "../../src/services/recipe.js";
import type { CreatorId } from "../../src/types/auth.js";
import type { IngredientId, InstructionId, PhotoId, RecipeId } from "@dough/shared";
import { wholeNumber, fraction, mixed } from "@dough/shared";
import { createTestTables, cleanTestTables } from "../helpers/db-setup.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CREATOR_ID = "creator-1" as CreatorId;
const OTHER_CREATOR_ID = "creator-2" as CreatorId;

function makeRecipeInput(overrides: Partial<CreateRecipeInput> = {}): CreateRecipeInput {
  const recipeId = (overrides.id ?? "recipe-1") as string;
  const base: CreateRecipeInput = {
    id: recipeId as RecipeId,
    title: "Lemon Pasta",
    description: "A delicious lemon pasta recipe",
    prepMinutes: 10,
    cookMinutes: 20,
    totalMinutes: 30,
    yieldQuantity: 4,
    yieldUnit: "servings",
    notes: "Best served fresh",
    dietaryTags: ["Vegetarian"],
    cuisine: "Italian",
    mealTypes: ["Dinner"],
    seasons: ["Summer"],
    ingredientGroups: [
      {
        label: "Pasta",
        ingredients: [
          {
            id: `${recipeId}-ing-1` as IngredientId,
            quantity: wholeNumber(1),
            unit: "lb",
            item: "spaghetti",
            notes: null,
          },
          {
            id: `${recipeId}-ing-2` as IngredientId,
            quantity: wholeNumber(2),
            unit: "whole",
            item: "lemons",
            notes: "juiced",
          },
        ],
      },
      {
        label: "Sauce",
        ingredients: [
          {
            id: `${recipeId}-ing-3` as IngredientId,
            quantity: fraction(1, 2),
            unit: "cup",
            item: "olive oil",
            notes: null,
          },
        ],
      },
    ],
    instructionGroups: [
      {
        label: null,
        instructions: [
          { id: `${recipeId}-inst-1` as InstructionId, body: "Boil water and cook pasta" },
          { id: `${recipeId}-inst-2` as InstructionId, body: "Mix lemon juice with olive oil" },
        ],
      },
    ],
    photos: [
      {
        id: `${recipeId}-photo-1` as PhotoId,
        url: "https://example.com/photo.jpg",
        altText: "Lemon pasta on a plate",
        width: 800,
        height: 600,
      },
    ],
  };
  return { ...base, ...overrides };
}

const NOW_ISO = new Date().toISOString();

function insertCreator(creatorId: string, tier: string = "Free"): string {
  return `INSERT INTO creators (id, email, name, password_hash, subscription_tier, subscription_started_at, created_at, updated_at) VALUES ('${creatorId}', 'test@test.com', 'Test Creator', 'hash', '${tier}', '${NOW_ISO}', '${NOW_ISO}', '${NOW_ISO}')`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Recipe Service", () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(async () => {
    await createTestTables(env.DB);
    await cleanTestTables(env.DB);
    db = createDb(env.DB);
    // Insert a test creator (Free tier by default)
    await env.DB.exec(insertCreator(TEST_CREATOR_ID));
  });

  describe("createRecipe", () => {
    it("creates a recipe with all fields and returns the full record", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      const input = makeRecipeInput();

      const result = await createRecipe(scopedDb, input);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.recipe.title).toBe("Lemon Pasta");
      expect(result.value.recipe.slug).toBe("lemon-pasta");
      expect(result.value.recipe.status).toBe("Draft");
      expect(result.value.recipe.description).toBe("A delicious lemon pasta recipe");
      expect(result.value.recipe.dietary_tags_confirmed).toBe(false);
      expect(result.value.recipe.prep_minutes).toBe(10);
      expect(result.value.recipe.cook_minutes).toBe(20);
      expect(result.value.recipe.yield_quantity).toBe(4);
      expect(result.value.recipe.yield_unit).toBe("servings");
      expect(result.value.recipe.cuisine).toBe("Italian");

      // Ingredient groups
      expect(result.value.ingredientGroups).toHaveLength(2);
      expect(result.value.ingredientGroups[0]?.label).toBe("Pasta");
      expect(result.value.ingredientGroups[0]?.ingredients).toHaveLength(2);
      expect(result.value.ingredientGroups[0]?.ingredients[0]?.item).toBe("spaghetti");
      expect(result.value.ingredientGroups[1]?.label).toBe("Sauce");
      expect(result.value.ingredientGroups[1]?.ingredients).toHaveLength(1);

      // Instruction groups
      expect(result.value.instructionGroups).toHaveLength(1);
      expect(result.value.instructionGroups[0]?.instructions).toHaveLength(2);
      expect(result.value.instructionGroups[0]?.instructions[0]?.body).toBe(
        "Boil water and cook pasta",
      );

      // Photos
      expect(result.value.photos).toHaveLength(1);
      expect(result.value.photos[0]?.url).toBe("https://example.com/photo.jpg");
    });

    it("generates a slug from the title", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      const result = await createRecipe(
        scopedDb,
        makeRecipeInput({ id: "r1" as RecipeId, title: "Grandma's Best Cookies!" }),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.recipe.slug).toBe("grandma-s-best-cookies");
    });

    it("resolves slug conflicts by appending numeric suffix", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      // Create first recipe
      await createRecipe(scopedDb, makeRecipeInput({ id: "r1" as RecipeId, title: "Lemon Pasta" }));

      // Create second with same title
      const result = await createRecipe(
        scopedDb,
        makeRecipeInput({ id: "r2" as RecipeId, title: "Lemon Pasta" }),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.recipe.slug).toBe("lemon-pasta-2");

      // Create third with same title
      const result3 = await createRecipe(
        scopedDb,
        makeRecipeInput({ id: "r3" as RecipeId, title: "Lemon Pasta" }),
      );

      expect(result3.ok).toBe(true);
      if (!result3.ok) return;
      expect(result3.value.recipe.slug).toBe("lemon-pasta-3");
    });

    it("defaults status to Draft", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      const result = await createRecipe(scopedDb, makeRecipeInput());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.recipe.status).toBe("Draft");
    });

    it("defaults dietary_tags_confirmed to false", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      const result = await createRecipe(scopedDb, makeRecipeInput());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.recipe.dietary_tags_confirmed).toBe(false);
    });
  });

  describe("updateRecipe", () => {
    it("updates partial fields without affecting others", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      await createRecipe(scopedDb, makeRecipeInput());

      const result = await updateRecipe(scopedDb, "recipe-1", {
        description: "Updated description",
        cookMinutes: 25,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.recipe.description).toBe("Updated description");
      expect(result.value.recipe.cook_minutes).toBe(25);
      // Unchanged fields
      expect(result.value.recipe.title).toBe("Lemon Pasta");
      expect(result.value.recipe.prep_minutes).toBe(10);
    });

    it("resets dietary_tags_confirmed when ingredients are updated", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      await createRecipe(scopedDb, makeRecipeInput());

      // First manually confirm dietary tags
      await env.DB.exec(`UPDATE recipes SET dietary_tags_confirmed = 1 WHERE id = 'recipe-1'`);

      // Then update ingredients
      const result = await updateRecipe(scopedDb, "recipe-1", {
        ingredientGroups: [
          {
            label: "New Group",
            ingredients: [
              {
                id: "new-ing-1" as IngredientId,
                quantity: wholeNumber(3),
                unit: "cups",
                item: "flour",
                notes: null,
              },
            ],
          },
        ],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.recipe.dietary_tags_confirmed).toBe(false);
      expect(result.value.ingredientGroups).toHaveLength(1);
      expect(result.value.ingredientGroups[0]?.ingredients[0]?.item).toBe("flour");
    });

    it("regenerates slug when title is updated", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      await createRecipe(scopedDb, makeRecipeInput());

      const result = await updateRecipe(scopedDb, "recipe-1", {
        title: "Garlic Bread",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.recipe.slug).toBe("garlic-bread");
    });

    it("returns not_found for non-existent recipe", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await updateRecipe(scopedDb, "nonexistent", { title: "New" });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not_found");
    });
  });

  describe("deleteRecipe (soft)", () => {
    it("sets status to Archived", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      await createRecipe(scopedDb, makeRecipeInput());

      const result = await deleteRecipe(scopedDb, "recipe-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.id).toBe("recipe-1");

      // Verify recipe is archived, not deleted
      const fetched = await getRecipe(scopedDb, "recipe-1");
      expect(fetched.ok).toBe(true);
      if (!fetched.ok) return;
      expect(fetched.value.recipe.status).toBe("Archived");
    });

    it("returns not_found for non-existent recipe", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await deleteRecipe(scopedDb, "nonexistent");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not_found");
    });
  });

  describe("getRecipe", () => {
    it("returns recipe with all related data", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      await createRecipe(scopedDb, makeRecipeInput());

      const result = await getRecipe(scopedDb, "recipe-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.recipe.id).toBe("recipe-1");
      expect(result.value.ingredientGroups).toHaveLength(2);
      expect(result.value.instructionGroups).toHaveLength(1);
      expect(result.value.photos).toHaveLength(1);
    });

    it("returns not_found for non-existent recipe", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await getRecipe(scopedDb, "nonexistent");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not_found");
    });

    it("does not return recipes from another creator", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      await createRecipe(scopedDb, makeRecipeInput());

      const otherScopedDb = withCreatorScope(db, OTHER_CREATOR_ID);
      const result = await getRecipe(otherScopedDb, "recipe-1");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not_found");
    });
  });

  describe("ingredient scaling", () => {
    it("scales whole number quantities", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      await createRecipe(scopedDb, makeRecipeInput());

      // Original yield: 4 servings, request 8 => scale factor 2x
      const result = await getRecipe(scopedDb, "recipe-1", 8);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // spaghetti was 1 lb, should now be 2
      const firstIng = result.value.ingredientGroups[0]?.ingredients[0];
      expect(firstIng).toBeDefined();
      if (!firstIng) return;
      const qtyData = firstIng.quantity_data as Record<string, unknown>;
      expect(qtyData["type"]).toBe("WholeNumber");
      expect(qtyData["value"]).toBe(2);
    });

    it("scales fraction quantities", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      await createRecipe(scopedDb, makeRecipeInput());

      // Original yield: 4 servings, request 8 => scale factor 2x
      // olive oil was 1/2 cup, should now be 1
      const result = await getRecipe(scopedDb, "recipe-1", 8);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const oliveOilIng = result.value.ingredientGroups[1]?.ingredients[0];
      expect(oliveOilIng).toBeDefined();
      if (!oliveOilIng) return;
      const qtyData = oliveOilIng.quantity_data as Record<string, unknown>;
      expect(qtyData["type"]).toBe("WholeNumber");
      expect(qtyData["value"]).toBe(1);
    });

    it("scales mixed number quantities", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      const input = makeRecipeInput({
        ingredientGroups: [
          {
            label: null,
            ingredients: [
              {
                id: "ing-m1" as IngredientId,
                quantity: mixed(1, 1, 2),
                unit: "cups",
                item: "sugar",
                notes: null,
              },
            ],
          },
        ],
      });
      await createRecipe(scopedDb, input);

      // Scale from 4 to 8 servings (2x): 1.5 * 2 = 3
      const result = await getRecipe(scopedDb, "recipe-1", 8);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const sugarIng = result.value.ingredientGroups[0]?.ingredients[0];
      expect(sugarIng).toBeDefined();
      if (!sugarIng) return;
      const qtyData = sugarIng.quantity_data as Record<string, unknown>;
      expect(qtyData["type"]).toBe("WholeNumber");
      expect(qtyData["value"]).toBe(3);
    });

    it("does not scale when servings param is not provided", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      await createRecipe(scopedDb, makeRecipeInput());

      const result = await getRecipe(scopedDb, "recipe-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const firstIng = result.value.ingredientGroups[0]?.ingredients[0];
      expect(firstIng).toBeDefined();
      if (!firstIng) return;
      const qtyData = firstIng.quantity_data as Record<string, unknown>;
      // Original value, unscaled
      expect(qtyData["type"]).toBe("WholeNumber");
      expect(qtyData["value"]).toBe(1);
    });
  });

  describe("listRecipes / search", () => {
    beforeEach(async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      await createRecipe(
        scopedDb,
        makeRecipeInput({
          id: "r1" as RecipeId,
          title: "Lemon Pasta",
          description: "A classic Italian dish",
          cuisine: "Italian",
          dietaryTags: ["Vegetarian"],
          mealTypes: ["Dinner"],
          seasons: ["Summer"],
        }),
      );
      await createRecipe(
        scopedDb,
        makeRecipeInput({
          id: "r2" as RecipeId,
          title: "Chicken Curry",
          description: "A spicy Indian dish",
          cuisine: "Indian",
          dietaryTags: ["GlutenFree"],
          mealTypes: ["Dinner"],
          seasons: ["Winter"],
          cookMinutes: 45,
        }),
      );
      await createRecipe(
        scopedDb,
        makeRecipeInput({
          id: "r3" as RecipeId,
          title: "Berry Smoothie",
          description: "A refreshing drink",
          cuisine: "American",
          dietaryTags: ["Vegan", "GlutenFree"],
          mealTypes: ["Breakfast"],
          seasons: ["Summer"],
          cookMinutes: 5,
        }),
      );
    });

    it("searches by title text", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await listRecipes(scopedDb, { q: "pasta" });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.data).toHaveLength(1);
      expect(result.value.data[0]?.title).toBe("Lemon Pasta");
    });

    it("filters by dietary tags", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await listRecipes(scopedDb, { dietaryTags: ["GlutenFree"] });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.data).toHaveLength(2);
    });

    it("filters by cuisine", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await listRecipes(scopedDb, { cuisine: "Italian" });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.data).toHaveLength(1);
      expect(result.value.data[0]?.title).toBe("Lemon Pasta");
    });

    it("filters by meal type", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await listRecipes(scopedDb, { mealType: "Breakfast" });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.data).toHaveLength(1);
      expect(result.value.data[0]?.title).toBe("Berry Smoothie");
    });

    it("paginates results", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const page1 = await listRecipes(scopedDb, { perPage: 2, page: 1 });

      expect(page1.ok).toBe(true);
      if (!page1.ok) return;
      expect(page1.value.data).toHaveLength(2);
      expect(page1.value.total).toBe(3);
      expect(page1.value.totalPages).toBe(2);

      const page2 = await listRecipes(scopedDb, { perPage: 2, page: 2 });

      expect(page2.ok).toBe(true);
      if (!page2.ok) return;
      expect(page2.value.data).toHaveLength(1);
    });

    it("sorts by title ascending", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await listRecipes(scopedDb, { sort: "title", order: "asc" });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.data[0]?.title).toBe("Berry Smoothie");
      expect(result.value.data[1]?.title).toBe("Chicken Curry");
      expect(result.value.data[2]?.title).toBe("Lemon Pasta");
    });

    it("filters by max cook time", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await listRecipes(scopedDb, { maxCookTimeMinutes: 10 });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.data).toHaveLength(1);
      expect(result.value.data[0]?.title).toBe("Berry Smoothie");
    });
  });

  describe("checkDuplicates", () => {
    it("detects similar titles above threshold", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      await createRecipe(scopedDb, makeRecipeInput({ id: "r1" as RecipeId, title: "Lemon Pasta" }));

      const result = await checkDuplicates(scopedDb, "Lemon Pasta");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.duplicates).toHaveLength(1);
      expect(result.value.duplicates[0]?.similarity).toBeGreaterThanOrEqual(0.85);
    });

    it("detects near-duplicates with minor differences", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      await createRecipe(scopedDb, makeRecipeInput({ id: "r1" as RecipeId, title: "Lemon Pasta" }));

      const result = await checkDuplicates(scopedDb, "Lemon Pastas");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.duplicates.length).toBeGreaterThan(0);
    });

    it("does not flag clearly different titles", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      await createRecipe(scopedDb, makeRecipeInput({ id: "r1" as RecipeId, title: "Lemon Pasta" }));

      const result = await checkDuplicates(scopedDb, "Chocolate Cake");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.duplicates).toHaveLength(0);
    });

    it("excludes specified recipe from comparison", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      await createRecipe(scopedDb, makeRecipeInput({ id: "r1" as RecipeId, title: "Lemon Pasta" }));

      const result = await checkDuplicates(scopedDb, "Lemon Pasta", "r1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.duplicates).toHaveLength(0);
    });
  });

  describe("free tier limit", () => {
    it("blocks creation after 25 recipes for free tier", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      // Create 25 recipes
      for (let i = 0; i < 25; i++) {
        await createRecipe(
          scopedDb,
          makeRecipeInput({
            id: `r-${i}` as RecipeId,
            title: `Recipe ${i}`,
          }),
        );
      }

      // 26th should fail
      const result = await createRecipe(
        scopedDb,
        makeRecipeInput({
          id: "r-26" as RecipeId,
          title: "Recipe 26",
        }),
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("free_tier_limit");
    });

    it("allows creation for paid tier beyond 25 recipes", async () => {
      // Upgrade creator to Creator tier
      await env.DB.exec(
        `UPDATE creators SET subscription_tier = 'Creator' WHERE id = '${TEST_CREATOR_ID}'`,
      );

      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      // Create 25 recipes
      for (let i = 0; i < 25; i++) {
        await createRecipe(
          scopedDb,
          makeRecipeInput({
            id: `r-${i}` as RecipeId,
            title: `Recipe ${i}`,
          }),
        );
      }

      // 26th should succeed
      const result = await createRecipe(
        scopedDb,
        makeRecipeInput({
          id: "r-26" as RecipeId,
          title: "Recipe 26",
        }),
      );

      expect(result.ok).toBe(true);
    });
  });
});
