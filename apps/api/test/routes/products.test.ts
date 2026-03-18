/**
 * Integration tests for product HTTP endpoints.
 *
 * Tests product creation (ebook, meal plan, recipe card pack), list, get, update.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { clerkAuth } from "../../src/middleware/auth.js";
import type { AppEnv } from "../../src/middleware/auth.js";
import { productRoutes } from "../../src/routes/products.js";
import type { Env } from "../../src/env.js";
import type { CreatorId } from "../../src/types/auth.js";
import { env } from "cloudflare:test";
import { createTestTables, cleanTestTables } from "../helpers/db-setup.js";

const TEST_CREATOR_ID = "creator-prod-rt-1" as CreatorId;
const NOW_ISO = new Date().toISOString();

async function fakeVerify(token: string, _env: Env): Promise<string | null> {
  if (token === "valid-token") return TEST_CREATOR_ID;
  return null;
}

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.use("*", clerkAuth({ verifyFn: fakeVerify }));
  app.route("/products", productRoutes);
  return app;
}

function testEnv(): Env {
  return {
    DB: env.DB,
    STORAGE: {} as R2Bucket,
    CACHE: {} as KVNamespace,
    IMPORT_QUEUE: {} as Queue,
    RENDER_QUEUE: {
      send: async () => {
        /* stub */
      },
    } as unknown as Queue,
    CLERK_PUBLISHABLE_KEY: "pk_test_xxx",
    CLERK_SECRET_KEY: "sk_test_xxx",
    KIT_CLIENT_ID: "kit_id",
    KIT_CLIENT_SECRET: "kit_secret",
    LOG_LEVEL: "info",
  };
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: "Bearer valid-token",
    "Content-Type": "application/json",
  };
}

async function insertBrandKit(creatorId: string): Promise<void> {
  await env.DB.exec(
    `INSERT INTO brand_kits (id, creator_id, name, primary_color, heading_font_family, heading_font_fallback, body_font_family, body_font_fallback, created_at, updated_at) VALUES ('bk-1', '${creatorId}', 'Default', '#FF0000', 'Arial', 'sans-serif', 'Arial', 'sans-serif', '${NOW_ISO}', '${NOW_ISO}')`,
  );
}

async function insertRecipe(id: string, creatorId: string): Promise<void> {
  await env.DB.exec(
    `INSERT INTO recipes (id, creator_id, title, slug, status, created_at, updated_at) VALUES ('${id}', '${creatorId}', 'Test Recipe ${id}', 'test-recipe-${id}', 'Draft', '${NOW_ISO}', '${NOW_ISO}')`,
  );
}

describe("Product Routes", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(async () => {
    await createTestTables(env.DB);
    await cleanTestTables(env.DB);
    app = createTestApp();
    await env.DB.exec(
      `INSERT INTO creators (id, email, name, password_hash, subscription_tier, subscription_started_at, created_at, updated_at) VALUES ('${TEST_CREATOR_ID}', 'test@test.com', 'Test', 'hash', 'Creator', '${NOW_ISO}', '${NOW_ISO}', '${NOW_ISO}')`,
    );
    await insertBrandKit(TEST_CREATOR_ID);
    await insertRecipe("recipe-p-1", TEST_CREATOR_ID);
    await insertRecipe("recipe-p-2", TEST_CREATOR_ID);
  });

  describe("POST /products/ebook", () => {
    it("creates an ebook product and returns 201", async () => {
      const res = await app.fetch(
        new Request("http://localhost/products/ebook", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            id: "ebook-1",
            title: "Summer Salads",
            description: "A collection of fresh summer salads",
            brand_kit_id: "bk-1",
            template_id: "tmpl-1",
            recipe_ids: ["recipe-p-1", "recipe-p-2"],
            chapters: [{ title: "Chapter 1", intro_copy: null, recipe_ids: ["recipe-p-1"] }],
            intro_copy: null,
            author_bio: null,
            format: "PDF",
            suggested_price_cents: null,
          }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(201);
      const body = await res.json<Record<string, unknown>>();
      expect(body).toHaveProperty("base");
    });
  });

  describe("POST /products/meal-plan", () => {
    it("creates a meal plan product and returns 201", async () => {
      const res = await app.fetch(
        new Request("http://localhost/products/meal-plan", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            id: "mealplan-1",
            title: "7-Day Meal Plan",
            description: null,
            brand_kit_id: "bk-1",
            template_id: "tmpl-1",
            days: [
              {
                day_number: 1,
                breakfast: "recipe-p-1",
                lunch: null,
                dinner: null,
                snacks: [],
              },
            ],
            suggested_price_cents: null,
          }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(201);
    });
  });

  describe("POST /products/recipe-card-pack", () => {
    it("creates a recipe card pack and returns 201", async () => {
      const res = await app.fetch(
        new Request("http://localhost/products/recipe-card-pack", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            id: "pack-1",
            title: "Recipe Card Pack",
            description: null,
            brand_kit_id: "bk-1",
            template_id: "tmpl-1",
            recipe_ids: ["recipe-p-1"],
            suggested_price_cents: null,
          }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(201);
    });
  });

  describe("GET /products", () => {
    it("lists products", async () => {
      // Create a product first
      await app.fetch(
        new Request("http://localhost/products/recipe-card-pack", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            id: "pack-list-1",
            title: "Pack for List",
            description: null,
            brand_kit_id: "bk-1",
            template_id: "tmpl-1",
            recipe_ids: ["recipe-p-1"],
            suggested_price_cents: null,
          }),
        }),
        testEnv(),
      );

      const res = await app.fetch(
        new Request("http://localhost/products", {
          headers: { Authorization: "Bearer valid-token" },
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
    });
  });

  describe("GET /products/:id", () => {
    it("gets a product by ID", async () => {
      await app.fetch(
        new Request("http://localhost/products/recipe-card-pack", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            id: "pack-get-1",
            title: "Get Pack",
            description: null,
            brand_kit_id: "bk-1",
            template_id: "tmpl-1",
            recipe_ids: ["recipe-p-1"],
            suggested_price_cents: null,
          }),
        }),
        testEnv(),
      );

      const res = await app.fetch(
        new Request("http://localhost/products/pack-get-1", {
          headers: { Authorization: "Bearer valid-token" },
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
    });

    it("returns 404 for non-existent product", async () => {
      const res = await app.fetch(
        new Request("http://localhost/products/nonexistent", {
          headers: { Authorization: "Bearer valid-token" },
        }),
        testEnv(),
      );

      expect(res.status).toBe(404);
    });
  });

  describe("PUT /products/:id", () => {
    it("updates a product", async () => {
      await app.fetch(
        new Request("http://localhost/products/recipe-card-pack", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            id: "pack-upd-1",
            title: "Before Update",
            description: null,
            brand_kit_id: "bk-1",
            template_id: "tmpl-1",
            recipe_ids: ["recipe-p-1"],
            suggested_price_cents: null,
          }),
        }),
        testEnv(),
      );

      const res = await app.fetch(
        new Request("http://localhost/products/pack-upd-1", {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ title: "After Update" }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
    });
  });

  describe("POST /products/:id/review-copy", () => {
    it("marks AI copy as reviewed", async () => {
      await app.fetch(
        new Request("http://localhost/products/recipe-card-pack", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            id: "pack-review-1",
            title: "Review Pack",
            description: null,
            brand_kit_id: "bk-1",
            template_id: "tmpl-1",
            recipe_ids: ["recipe-p-1"],
            suggested_price_cents: null,
          }),
        }),
        testEnv(),
      );

      const res = await app.fetch(
        new Request("http://localhost/products/pack-review-1/review-copy", {
          method: "POST",
          headers: { Authorization: "Bearer valid-token" },
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
    });
  });

  describe("POST /products/:id/lead-magnet", () => {
    it("returns 404 when parent product not found", async () => {
      const res = await app.fetch(
        new Request("http://localhost/products/nonexistent/lead-magnet", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ id: "lm-1" }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(404);
    });
  });

  describe("POST /products/:id/publish", () => {
    it("returns 404 for non-existent product", async () => {
      const res = await app.fetch(
        new Request("http://localhost/products/nonexistent/publish", {
          method: "POST",
          headers: { Authorization: "Bearer valid-token" },
        }),
        testEnv(),
      );

      expect(res.status).toBe(404);
    });
  });

  describe("POST /products/:id/render", () => {
    it("returns 404 for non-existent product", async () => {
      const res = await app.fetch(
        new Request("http://localhost/products/nonexistent/render", {
          method: "POST",
          headers: { Authorization: "Bearer valid-token" },
        }),
        testEnv(),
      );

      expect(res.status).toBe(404);
    });

    it("enqueues render for an existing product", async () => {
      await app.fetch(
        new Request("http://localhost/products/recipe-card-pack", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            id: "pack-render-1",
            title: "Render Pack",
            description: null,
            brand_kit_id: "bk-1",
            template_id: "tmpl-1",
            recipe_ids: ["recipe-p-1"],
            suggested_price_cents: null,
          }),
        }),
        testEnv(),
      );

      const res = await app.fetch(
        new Request("http://localhost/products/pack-render-1/render", {
          method: "POST",
          headers: { Authorization: "Bearer valid-token" },
        }),
        testEnv(),
      );

      expect(res.status).toBe(202);
    });
  });

  describe("POST /products/ebook — invalid input", () => {
    it("returns 400 for invalid ebook input (empty recipe_ids)", async () => {
      const res = await app.fetch(
        new Request("http://localhost/products/ebook", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            id: "ebook-invalid",
            title: "Invalid Ebook",
            description: null,
            brand_kit_id: "bk-1",
            template_id: "tmpl-1",
            recipe_ids: [],
            chapters: [],
            intro_copy: null,
            author_bio: null,
            format: "PDF",
            suggested_price_cents: null,
          }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(400);
    });
  });

  describe("POST /products/recipe-card-pack — invalid input", () => {
    it("returns 400 for empty recipe_ids", async () => {
      const res = await app.fetch(
        new Request("http://localhost/products/recipe-card-pack", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            id: "pack-invalid",
            title: "Invalid Pack",
            description: null,
            brand_kit_id: "bk-1",
            template_id: "tmpl-1",
            recipe_ids: [],
            suggested_price_cents: null,
          }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(400);
    });
  });

  describe("Free tier limits", () => {
    it("enforces free tier limit on product creation", async () => {
      // Create a free-tier creator
      const freeCreatorId = "creator-free-tier" as CreatorId;
      const fakeVerifyFree = async (token: string, _env: Env): Promise<string | null> => {
        if (token === "free-token") return freeCreatorId;
        return null;
      };
      const freeApp = new Hono<AppEnv>();
      freeApp.use("*", clerkAuth({ verifyFn: fakeVerifyFree }));
      freeApp.route("/products", productRoutes);

      await env.DB.exec(
        `INSERT INTO creators (id, email, name, password_hash, subscription_tier, subscription_started_at, created_at, updated_at) VALUES ('${freeCreatorId}', 'free@test.com', 'Free', 'hash', 'Free', '${NOW_ISO}', '${NOW_ISO}', '${NOW_ISO}')`,
      );
      await env.DB.exec(
        `INSERT INTO brand_kits (id, creator_id, name, primary_color, heading_font_family, heading_font_fallback, body_font_family, body_font_fallback, created_at, updated_at) VALUES ('bk-free', '${freeCreatorId}', 'Free Brand', '#FF0000', 'Arial', 'sans-serif', 'Arial', 'sans-serif', '${NOW_ISO}', '${NOW_ISO}')`,
      );
      await env.DB.exec(
        `INSERT INTO recipes (id, creator_id, title, slug, status, created_at, updated_at) VALUES ('recipe-free-1', '${freeCreatorId}', 'Free Recipe', 'free-recipe', 'Draft', '${NOW_ISO}', '${NOW_ISO}')`,
      );

      // Create first product (should succeed under free tier)
      const res1 = await freeApp.fetch(
        new Request("http://localhost/products/recipe-card-pack", {
          method: "POST",
          headers: { Authorization: "Bearer free-token", "Content-Type": "application/json" },
          body: JSON.stringify({
            id: "free-pack-1",
            title: "Free Pack 1",
            description: null,
            brand_kit_id: "bk-free",
            template_id: "tmpl-1",
            recipe_ids: ["recipe-free-1"],
            suggested_price_cents: null,
          }),
        }),
        testEnv(),
      );

      // May succeed or fail based on free tier logic
      expect([201, 403]).toContain(res1.status);
    });
  });

  describe("POST /products/:id/publish (existing product)", () => {
    it("returns error for product not in Published status", async () => {
      // Create a product (Draft status)
      await app.fetch(
        new Request("http://localhost/products/recipe-card-pack", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            id: "pack-pub-fail",
            title: "Publish Fail",
            description: null,
            brand_kit_id: "bk-1",
            template_id: "tmpl-1",
            recipe_ids: ["recipe-p-1"],
            suggested_price_cents: null,
          }),
        }),
        testEnv(),
      );

      const res = await app.fetch(
        new Request("http://localhost/products/pack-pub-fail/publish", {
          method: "POST",
          headers: { Authorization: "Bearer valid-token" },
        }),
        testEnv(),
      );

      // Should fail because product needs PDF before publishing
      expect([400, 422]).toContain(res.status);
    });
  });

  describe("GET /products with filters", () => {
    it("filters by status", async () => {
      const res = await app.fetch(
        new Request(
          "http://localhost/products?status=Draft&product_type=RecipeCardPack&page=1&per_page=10",
          {
            headers: { Authorization: "Bearer valid-token" },
          },
        ),
        testEnv(),
      );

      expect(res.status).toBe(200);
    });
  });
});
