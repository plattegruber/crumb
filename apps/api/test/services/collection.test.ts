/**
 * Tests for the collection service (SPEC §6.2).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { createDb } from "../../src/db/index.js";
import { withCreatorScope } from "../../src/middleware/creator-scope.js";
import {
  createCollection,
  getCollection,
  listCollections,
  updateCollection,
  deleteCollection,
  addRecipeToCollection,
  removeRecipeFromCollection,
} from "../../src/services/collection.js";
import { createRecipe } from "../../src/services/recipe.js";
import type { CreateRecipeInput } from "../../src/services/recipe.js";
import type { CreatorId } from "../../src/types/auth.js";
import type { RecipeId, IngredientId, InstructionId } from "@dough/shared";
import { wholeNumber } from "@dough/shared";
import { createTestTables, cleanTestTables } from "../helpers/db-setup.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CREATOR_ID = "creator-1" as CreatorId;
const NOW_ISO = new Date().toISOString();

function makeRecipeInput(id: string, title: string): CreateRecipeInput {
  return {
    id: id as RecipeId,
    title,
    ingredientGroups: [
      {
        label: null,
        ingredients: [
          {
            id: `${id}-ing-1` as IngredientId,
            quantity: wholeNumber(1),
            unit: "cup",
            item: "flour",
            notes: null,
          },
        ],
      },
    ],
    instructionGroups: [
      {
        label: null,
        instructions: [{ id: `${id}-inst-1` as InstructionId, body: "Mix everything" }],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Collection Service", () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(async () => {
    await createTestTables(env.DB);
    await cleanTestTables(env.DB);
    db = createDb(env.DB);
    await env.DB.exec(
      `INSERT INTO creators (id, email, name, password_hash, subscription_tier, subscription_started_at, created_at, updated_at) VALUES ('${TEST_CREATOR_ID}', 'test@test.com', 'Test Creator', 'hash', 'Creator', '${NOW_ISO}', '${NOW_ISO}', '${NOW_ISO}')`,
    );
  });

  describe("createCollection", () => {
    it("creates a collection and returns it", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await createCollection(scopedDb, {
        id: "col-1",
        name: "Summer Favorites",
        description: "Best recipes for summer",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.collection.name).toBe("Summer Favorites");
      expect(result.value.collection.description).toBe("Best recipes for summer");
      expect(result.value.recipeIds).toHaveLength(0);
    });

    it("rejects empty name", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await createCollection(scopedDb, {
        id: "col-1",
        name: "",
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("invalid_input");
    });
  });

  describe("addRecipeToCollection / removeRecipeFromCollection", () => {
    it("adds recipes with correct ordering", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      // Create recipes
      await createRecipe(scopedDb, makeRecipeInput("r1", "Recipe 1"));
      await createRecipe(scopedDb, makeRecipeInput("r2", "Recipe 2"));
      await createRecipe(scopedDb, makeRecipeInput("r3", "Recipe 3"));

      // Create collection
      await createCollection(scopedDb, { id: "col-1", name: "My Collection" });

      // Add recipes
      await addRecipeToCollection(scopedDb, "col-1", "r1");
      await addRecipeToCollection(scopedDb, "col-1", "r2");
      const result = await addRecipeToCollection(scopedDb, "col-1", "r3");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.recipeIds).toEqual(["r1", "r2", "r3"]);
    });

    it("does not add duplicate recipe to same collection", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      await createRecipe(scopedDb, makeRecipeInput("r1", "Recipe 1"));
      await createCollection(scopedDb, { id: "col-1", name: "My Collection" });

      await addRecipeToCollection(scopedDb, "col-1", "r1");
      const result = await addRecipeToCollection(scopedDb, "col-1", "r1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.recipeIds).toEqual(["r1"]);
    });

    it("removes a recipe from collection", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      await createRecipe(scopedDb, makeRecipeInput("r1", "Recipe 1"));
      await createRecipe(scopedDb, makeRecipeInput("r2", "Recipe 2"));
      await createCollection(scopedDb, { id: "col-1", name: "My Collection" });
      await addRecipeToCollection(scopedDb, "col-1", "r1");
      await addRecipeToCollection(scopedDb, "col-1", "r2");

      const result = await removeRecipeFromCollection(scopedDb, "col-1", "r1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.recipeIds).toEqual(["r2"]);
    });
  });

  describe("deleteCollection", () => {
    it("deletes a collection and its recipe associations", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      await createCollection(scopedDb, { id: "col-1", name: "My Collection" });

      const result = await deleteCollection(scopedDb, "col-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.id).toBe("col-1");

      // Verify it's gone
      const fetched = await getCollection(scopedDb, "col-1");
      expect(fetched.ok).toBe(false);
    });

    it("returns not_found for non-existent collection", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await deleteCollection(scopedDb, "nonexistent");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not_found");
    });
  });

  describe("updateCollection", () => {
    it("updates collection name and description", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      await createCollection(scopedDb, {
        id: "col-1",
        name: "Original Name",
        description: "Original description",
      });

      const result = await updateCollection(scopedDb, "col-1", {
        name: "Updated Name",
        description: "Updated description",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.collection.name).toBe("Updated Name");
      expect(result.value.collection.description).toBe("Updated description");
    });
  });

  describe("listCollections", () => {
    it("lists all collections for the creator", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      await createCollection(scopedDb, { id: "col-1", name: "Collection A" });
      await createCollection(scopedDb, { id: "col-2", name: "Collection B" });

      const result = await listCollections(scopedDb);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(2);
    });
  });
});
