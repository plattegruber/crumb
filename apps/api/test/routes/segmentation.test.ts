/**
 * Integration tests for segmentation HTTP endpoints.
 *
 * Tests dietary tag inference, confirmation, segment profile retrieval.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { clerkAuth } from "../../src/middleware/auth.js";
import type { AppEnv } from "../../src/middleware/auth.js";
import { segmentationRoutes } from "../../src/routes/segmentation.js";
import type { Env } from "../../src/env.js";
import type { CreatorId } from "../../src/types/auth.js";
import { env } from "cloudflare:test";
import { createTestTables, cleanTestTables } from "../helpers/db-setup.js";

const TEST_CREATOR_ID = "creator-seg-rt-1" as CreatorId;
const NOW_ISO = new Date().toISOString();

async function fakeVerify(token: string, _env: Env): Promise<string | null> {
  if (token === "valid-token") return TEST_CREATOR_ID;
  return null;
}

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.use("*", clerkAuth({ verifyFn: fakeVerify }));
  app.route("/", segmentationRoutes);
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
    LOG_LEVEL: "info",
  };
}

function authHeaders(contentType = true): Record<string, string> {
  const headers: Record<string, string> = { Authorization: "Bearer valid-token" };
  if (contentType) headers["Content-Type"] = "application/json";
  return headers;
}

describe("Segmentation Routes", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(async () => {
    await createTestTables(env.DB);
    await cleanTestTables(env.DB);
    app = createTestApp();
    await env.DB.exec(
      `INSERT INTO creators (id, email, name, password_hash, subscription_tier, subscription_started_at, created_at, updated_at) VALUES ('${TEST_CREATOR_ID}', 'test@test.com', 'Test', 'hash', 'Creator', '${NOW_ISO}', '${NOW_ISO}', '${NOW_ISO}')`,
    );
  });

  describe("POST /recipes/:id/dietary-tags/infer", () => {
    it("infers dietary tags for a recipe", async () => {
      // Insert a recipe with ingredients
      await env.DB.exec(
        `INSERT INTO recipes (id, creator_id, title, slug, status, created_at, updated_at) VALUES ('r-infer-1', '${TEST_CREATOR_ID}', 'Rice Bowl', 'rice-bowl', 'Draft', '${NOW_ISO}', '${NOW_ISO}')`,
      );
      await env.DB.exec(
        `INSERT INTO ingredient_groups (id, recipe_id, sort_order) VALUES (1, 'r-infer-1', 0)`,
      );
      await env.DB.exec(
        `INSERT INTO ingredients (id, group_id, item, sort_order) VALUES ('ing-1', 1, 'rice', 0)`,
      );
      await env.DB.exec(
        `INSERT INTO ingredients (id, group_id, item, sort_order) VALUES ('ing-2', 1, 'avocado', 1)`,
      );

      const res = await app.fetch(
        new Request("http://localhost/recipes/r-infer-1/dietary-tags/infer", {
          method: "POST",
          headers: authHeaders(false),
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
      const body = await res.json<{ tags: string[]; confirmed: boolean }>();
      expect(body.confirmed).toBe(false);
      expect(body.tags).toContain("Vegan");
      expect(body.tags).toContain("DairyFree");
    });

    it("returns 404 for non-existent recipe", async () => {
      const res = await app.fetch(
        new Request("http://localhost/recipes/nonexistent/dietary-tags/infer", {
          method: "POST",
          headers: authHeaders(false),
        }),
        testEnv(),
      );

      expect(res.status).toBe(404);
    });

    it("returns 403 for recipe owned by another creator", async () => {
      await env.DB.exec(
        `INSERT INTO creators (id, email, name, password_hash, subscription_tier, subscription_started_at, created_at, updated_at) VALUES ('other-creator', 'other@test.com', 'Other', 'hash', 'Creator', '${NOW_ISO}', '${NOW_ISO}', '${NOW_ISO}')`,
      );
      await env.DB.exec(
        `INSERT INTO recipes (id, creator_id, title, slug, status, created_at, updated_at) VALUES ('r-other', 'other-creator', 'Other Recipe', 'other-recipe', 'Draft', '${NOW_ISO}', '${NOW_ISO}')`,
      );

      const res = await app.fetch(
        new Request("http://localhost/recipes/r-other/dietary-tags/infer", {
          method: "POST",
          headers: authHeaders(false),
        }),
        testEnv(),
      );

      expect(res.status).toBe(403);
    });
  });

  describe("PUT /recipes/:id/dietary-tags/confirm", () => {
    it("confirms dietary tags", async () => {
      await env.DB.exec(
        `INSERT INTO recipes (id, creator_id, title, slug, status, created_at, updated_at) VALUES ('r-confirm-1', '${TEST_CREATOR_ID}', 'Confirm Recipe', 'confirm-recipe', 'Draft', '${NOW_ISO}', '${NOW_ISO}')`,
      );

      const res = await app.fetch(
        new Request("http://localhost/recipes/r-confirm-1/dietary-tags/confirm", {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ tags: ["Vegan", "GlutenFree"] }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
      const body = await res.json<{ tags: string[]; confirmed: boolean }>();
      expect(body.confirmed).toBe(true);
      expect(body.tags).toContain("Vegan");
      expect(body.tags).toContain("GlutenFree");
    });

    it("returns 400 for invalid tag", async () => {
      await env.DB.exec(
        `INSERT INTO recipes (id, creator_id, title, slug, status, created_at, updated_at) VALUES ('r-invalid-tag', '${TEST_CREATOR_ID}', 'Invalid Tag', 'invalid-tag', 'Draft', '${NOW_ISO}', '${NOW_ISO}')`,
      );

      const res = await app.fetch(
        new Request("http://localhost/recipes/r-invalid-tag/dietary-tags/confirm", {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ tags: ["InvalidTag"] }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(400);
    });

    it("returns 400 when tags is not an array", async () => {
      await env.DB.exec(
        `INSERT INTO recipes (id, creator_id, title, slug, status, created_at, updated_at) VALUES ('r-not-array', '${TEST_CREATOR_ID}', 'Not Array', 'not-array', 'Draft', '${NOW_ISO}', '${NOW_ISO}')`,
      );

      const res = await app.fetch(
        new Request("http://localhost/recipes/r-not-array/dietary-tags/confirm", {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ tags: "Vegan" }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid JSON body", async () => {
      await env.DB.exec(
        `INSERT INTO recipes (id, creator_id, title, slug, status, created_at, updated_at) VALUES ('r-bad-json', '${TEST_CREATOR_ID}', 'Bad JSON', 'bad-json', 'Draft', '${NOW_ISO}', '${NOW_ISO}')`,
      );

      const res = await app.fetch(
        new Request("http://localhost/recipes/r-bad-json/dietary-tags/confirm", {
          method: "PUT",
          headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
          body: "not valid json{",
        }),
        testEnv(),
      );

      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent recipe", async () => {
      const res = await app.fetch(
        new Request("http://localhost/recipes/nonexistent/dietary-tags/confirm", {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ tags: ["Vegan"] }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(404);
    });
  });

  describe("GET /segments", () => {
    it("returns null profile when none exists", async () => {
      const res = await app.fetch(
        new Request("http://localhost/segments", {
          headers: authHeaders(false),
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
      const body = await res.json<{ profile: null }>();
      expect(body.profile).toBeNull();
    });

    it("returns profile when one exists", async () => {
      await env.DB.exec(
        `INSERT INTO segment_profiles (creator_id, computed_at, segments) VALUES ('${TEST_CREATOR_ID}', '${NOW_ISO}', '${JSON.stringify({ Vegan: { subscriber_count: 10, engagement_rate: 0.2, growth_rate_30d: 0.05, top_recipe_ids: [] } })}')`,
      );

      const res = await app.fetch(
        new Request("http://localhost/segments", {
          headers: authHeaders(false),
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
      const body = await res.json<{ profile: { segments: Record<string, unknown> } }>();
      expect(body.profile).not.toBeNull();
      expect(body.profile.segments).toHaveProperty("Vegan");
    });
  });

  describe("POST /segments/compute", () => {
    it("returns 400 when Kit access token is missing", async () => {
      const res = await app.fetch(
        new Request("http://localhost/segments/compute", {
          method: "POST",
          headers: authHeaders(false),
        }),
        testEnv(),
      );

      expect(res.status).toBe(400);
    });
  });

  describe("POST /segments/preference-form", () => {
    it("returns 400 when Kit access token is missing", async () => {
      const res = await app.fetch(
        new Request("http://localhost/segments/preference-form", {
          method: "POST",
          headers: authHeaders(false),
        }),
        testEnv(),
      );

      expect(res.status).toBe(400);
    });
  });
});
