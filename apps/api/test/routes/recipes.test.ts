/**
 * Integration tests for recipe HTTP endpoints.
 *
 * Tests the full HTTP cycle: request -> auth middleware -> route -> service -> D1.
 * Uses a custom verifyFn so we can control authentication without real Clerk tokens.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { clerkAuth } from "../../src/middleware/auth.js";
import type { AppEnv } from "../../src/middleware/auth.js";
import { recipeRoutes } from "../../src/routes/recipes.js";
import { collectionRoutes } from "../../src/routes/collections.js";
import type { Env } from "../../src/env.js";
import type { CreatorId } from "../../src/types/auth.js";
import { env } from "cloudflare:test";
import { wholeNumber } from "@crumb/shared";
import { createTestTables, cleanTestTables } from "../helpers/db-setup.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CREATOR_ID = "creator-route-1" as CreatorId;

async function fakeVerify(
  token: string,
  _env: Env,
): Promise<string | null> {
  if (token === "valid-token") return TEST_CREATOR_ID;
  return null;
}

function createTestApp() {
  const app = new Hono<AppEnv>();

  // Auth middleware
  app.use("*", clerkAuth({ verifyFn: fakeVerify }));

  // Mount routes
  app.route("/recipes", recipeRoutes);
  app.route("/collections", collectionRoutes);

  return app;
}

function testEnv(): Env {
  return {
    DB: env.DB,
    STORAGE: {} as R2Bucket,
    CACHE: {} as KVNamespace,
    IMPORT_QUEUE: {} as Queue,
    RENDER_QUEUE: {} as Queue,
    CLERK_PUBLISHABLE_KEY: "pk_test_xxx",
    CLERK_SECRET_KEY: "sk_test_xxx",
    KIT_CLIENT_ID: "kit_id",
    KIT_CLIENT_SECRET: "kit_secret",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Recipe Routes", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(async () => {
    await createTestTables(env.DB);
    await cleanTestTables(env.DB);
    app = createTestApp();
    // Insert test creator (Creator tier to avoid free tier limits in route tests)
    await env.DB.exec(
      `INSERT INTO creators (id, email, name, subscription_tier, created_at, updated_at) VALUES ('${TEST_CREATOR_ID}', 'test@test.com', 'Test Creator', 'Creator', ${Date.now()}, ${Date.now()})`,
    );
  });

  describe("Auth", () => {
    it("returns 401 without auth token", async () => {
      const res = await app.fetch(
        new Request("http://localhost/recipes"),
        testEnv(),
      );

      expect(res.status).toBe(401);
    });

    it("returns 401 with invalid token", async () => {
      const res = await app.fetch(
        new Request("http://localhost/recipes", {
          headers: { Authorization: "Bearer invalid-token" },
        }),
        testEnv(),
      );

      expect(res.status).toBe(401);
    });
  });

  describe("POST /recipes", () => {
    it("creates a recipe and returns 201", async () => {
      const res = await app.fetch(
        new Request("http://localhost/recipes", {
          method: "POST",
          headers: {
            Authorization: "Bearer valid-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: "recipe-rt-1",
            title: "Test Recipe",
            description: "A test recipe",
            prepMinutes: 10,
            cookMinutes: 20,
            yieldQuantity: 4,
            yieldUnit: "servings",
            ingredientGroups: [
              {
                label: null,
                ingredients: [
                  {
                    id: "ing-rt-1",
                    quantity: wholeNumber(2),
                    unit: "cups",
                    item: "flour",
                    notes: null,
                  },
                ],
              },
            ],
            instructionGroups: [
              {
                label: null,
                instructions: [
                  { id: "inst-rt-1", body: "Mix and bake" },
                ],
              },
            ],
          }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(201);
      const body = await res.json<Record<string, unknown>>();
      expect(body).toHaveProperty("recipe");
    });
  });

  describe("GET /recipes", () => {
    it("lists recipes for the authenticated creator", async () => {
      // Create a recipe first
      await app.fetch(
        new Request("http://localhost/recipes", {
          method: "POST",
          headers: {
            Authorization: "Bearer valid-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: "recipe-list-1",
            title: "List Test Recipe",
          }),
        }),
        testEnv(),
      );

      const res = await app.fetch(
        new Request("http://localhost/recipes", {
          headers: { Authorization: "Bearer valid-token" },
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
      const body = await res.json<{ data: unknown[]; total: number }>();
      expect(body.data).toHaveLength(1);
      expect(body.total).toBe(1);
    });
  });

  describe("GET /recipes/:id", () => {
    it("gets a recipe by ID", async () => {
      // Create a recipe
      await app.fetch(
        new Request("http://localhost/recipes", {
          method: "POST",
          headers: {
            Authorization: "Bearer valid-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: "recipe-get-1",
            title: "Get Test Recipe",
          }),
        }),
        testEnv(),
      );

      const res = await app.fetch(
        new Request("http://localhost/recipes/recipe-get-1", {
          headers: { Authorization: "Bearer valid-token" },
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
      const body = await res.json<{ recipe: { title: string } }>();
      expect(body.recipe.title).toBe("Get Test Recipe");
    });

    it("returns 404 for non-existent recipe", async () => {
      const res = await app.fetch(
        new Request("http://localhost/recipes/nonexistent", {
          headers: { Authorization: "Bearer valid-token" },
        }),
        testEnv(),
      );

      expect(res.status).toBe(404);
    });
  });

  describe("PUT /recipes/:id", () => {
    it("updates a recipe and returns 200", async () => {
      // Create a recipe first
      await app.fetch(
        new Request("http://localhost/recipes", {
          method: "POST",
          headers: {
            Authorization: "Bearer valid-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: "recipe-update-1",
            title: "Before Update",
          }),
        }),
        testEnv(),
      );

      const res = await app.fetch(
        new Request("http://localhost/recipes/recipe-update-1", {
          method: "PUT",
          headers: {
            Authorization: "Bearer valid-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: "After Update",
            description: "Updated description",
          }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
      const body = await res.json<{ recipe: { title: string; description: string } }>();
      expect(body.recipe.title).toBe("After Update");
      expect(body.recipe.description).toBe("Updated description");
    });
  });

  describe("DELETE /recipes/:id", () => {
    it("soft deletes a recipe (archives it)", async () => {
      // Create a recipe first
      await app.fetch(
        new Request("http://localhost/recipes", {
          method: "POST",
          headers: {
            Authorization: "Bearer valid-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: "recipe-del-1",
            title: "To Delete",
          }),
        }),
        testEnv(),
      );

      const res = await app.fetch(
        new Request("http://localhost/recipes/recipe-del-1", {
          method: "DELETE",
          headers: { Authorization: "Bearer valid-token" },
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);

      // Verify it's archived, not deleted
      const getRes = await app.fetch(
        new Request("http://localhost/recipes/recipe-del-1", {
          headers: { Authorization: "Bearer valid-token" },
        }),
        testEnv(),
      );

      expect(getRes.status).toBe(200);
      const body = await getRes.json<{ recipe: { status: string } }>();
      expect(body.recipe.status).toBe("Archived");
    });
  });
});
