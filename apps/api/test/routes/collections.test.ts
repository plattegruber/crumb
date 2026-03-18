/**
 * Integration tests for collection HTTP endpoints.
 *
 * Tests the full HTTP cycle: request -> auth middleware -> route -> service -> D1.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { clerkAuth } from "../../src/middleware/auth.js";
import type { AppEnv } from "../../src/middleware/auth.js";
import { collectionRoutes } from "../../src/routes/collections.js";
import type { Env } from "../../src/env.js";
import type { CreatorId } from "../../src/types/auth.js";
import { env } from "cloudflare:test";
import { createTestTables, cleanTestTables } from "../helpers/db-setup.js";

const TEST_CREATOR_ID = "creator-coll-rt-1" as CreatorId;
const NOW_ISO = new Date().toISOString();

async function fakeVerify(token: string, _env: Env): Promise<string | null> {
  if (token === "valid-token") return TEST_CREATOR_ID;
  return null;
}

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.use("*", clerkAuth({ verifyFn: fakeVerify }));
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
    LOG_LEVEL: "info",
  };
}

function authHeaders(contentType = true): Record<string, string> {
  const headers: Record<string, string> = { Authorization: "Bearer valid-token" };
  if (contentType) headers["Content-Type"] = "application/json";
  return headers;
}

describe("Collection Routes", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(async () => {
    await createTestTables(env.DB);
    await cleanTestTables(env.DB);
    app = createTestApp();
    await env.DB.exec(
      `INSERT INTO creators (id, email, name, password_hash, subscription_tier, subscription_started_at, created_at, updated_at) VALUES ('${TEST_CREATOR_ID}', 'test@test.com', 'Test Creator', 'hash', 'Creator', '${NOW_ISO}', '${NOW_ISO}', '${NOW_ISO}')`,
    );
  });

  describe("POST /collections", () => {
    it("creates a collection and returns 201", async () => {
      const res = await app.fetch(
        new Request("http://localhost/collections", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            id: "coll-1",
            name: "Weeknight Dinners",
            description: "Quick meals for busy weeknights",
          }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(201);
      const body = await res.json<{ name: string }>();
      expect(body.name).toBe("Weeknight Dinners");
    });

    it("returns 400 for empty name", async () => {
      const res = await app.fetch(
        new Request("http://localhost/collections", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ id: "coll-2", name: "" }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(400);
    });
  });

  describe("GET /collections", () => {
    it("lists collections", async () => {
      // Create two collections
      await app.fetch(
        new Request("http://localhost/collections", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ id: "coll-list-1", name: "Collection A" }),
        }),
        testEnv(),
      );
      await app.fetch(
        new Request("http://localhost/collections", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ id: "coll-list-2", name: "Collection B" }),
        }),
        testEnv(),
      );

      const res = await app.fetch(
        new Request("http://localhost/collections", {
          headers: authHeaders(false),
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
      const body = await res.json<unknown[]>();
      expect(body).toHaveLength(2);
    });
  });

  describe("GET /collections/:id", () => {
    it("gets a collection by ID", async () => {
      await app.fetch(
        new Request("http://localhost/collections", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ id: "coll-get-1", name: "Get Test" }),
        }),
        testEnv(),
      );

      const res = await app.fetch(
        new Request("http://localhost/collections/coll-get-1", {
          headers: authHeaders(false),
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
      const body = await res.json<{ name: string }>();
      expect(body.name).toBe("Get Test");
    });

    it("returns 404 for non-existent collection", async () => {
      const res = await app.fetch(
        new Request("http://localhost/collections/nonexistent", {
          headers: authHeaders(false),
        }),
        testEnv(),
      );

      expect(res.status).toBe(404);
    });
  });

  describe("PUT /collections/:id", () => {
    it("updates a collection", async () => {
      await app.fetch(
        new Request("http://localhost/collections", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ id: "coll-upd-1", name: "Before" }),
        }),
        testEnv(),
      );

      const res = await app.fetch(
        new Request("http://localhost/collections/coll-upd-1", {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ name: "After", description: "Updated" }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
      const body = await res.json<{ name: string; description: string }>();
      expect(body.name).toBe("After");
      expect(body.description).toBe("Updated");
    });

    it("returns 404 when updating non-existent collection", async () => {
      const res = await app.fetch(
        new Request("http://localhost/collections/nonexistent", {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ name: "test" }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /collections/:id", () => {
    it("deletes a collection", async () => {
      await app.fetch(
        new Request("http://localhost/collections", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ id: "coll-del-1", name: "Delete Me" }),
        }),
        testEnv(),
      );

      const res = await app.fetch(
        new Request("http://localhost/collections/coll-del-1", {
          method: "DELETE",
          headers: authHeaders(false),
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);

      // Verify it's gone
      const getRes = await app.fetch(
        new Request("http://localhost/collections/coll-del-1", {
          headers: authHeaders(false),
        }),
        testEnv(),
      );
      expect(getRes.status).toBe(404);
    });

    it("returns 404 when deleting non-existent collection", async () => {
      const res = await app.fetch(
        new Request("http://localhost/collections/nonexistent", {
          method: "DELETE",
          headers: authHeaders(false),
        }),
        testEnv(),
      );

      expect(res.status).toBe(404);
    });
  });

  describe("POST /collections/:id/recipes", () => {
    it("adds a recipe to a collection", async () => {
      // Create collection
      await app.fetch(
        new Request("http://localhost/collections", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ id: "coll-add-r-1", name: "Recipe Collection" }),
        }),
        testEnv(),
      );

      // Insert a recipe directly
      await env.DB.exec(
        `INSERT INTO recipes (id, creator_id, title, slug, status, created_at, updated_at) VALUES ('recipe-add-1', '${TEST_CREATOR_ID}', 'Test Recipe', 'test-recipe', 'Draft', '${NOW_ISO}', '${NOW_ISO}')`,
      );

      const res = await app.fetch(
        new Request("http://localhost/collections/coll-add-r-1/recipes", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ recipeId: "recipe-add-1" }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
      const body = await res.json<{ recipe_ids: string[] }>();
      expect(body.recipe_ids).toContain("recipe-add-1");
    });
  });

  describe("DELETE /collections/:id/recipes/:recipeId", () => {
    it("removes a recipe from a collection", async () => {
      // Create collection
      await app.fetch(
        new Request("http://localhost/collections", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ id: "coll-rm-r-1", name: "Remove Recipe" }),
        }),
        testEnv(),
      );

      // Insert a recipe directly
      await env.DB.exec(
        `INSERT INTO recipes (id, creator_id, title, slug, status, created_at, updated_at) VALUES ('recipe-rm-1', '${TEST_CREATOR_ID}', 'To Remove', 'to-remove', 'Draft', '${NOW_ISO}', '${NOW_ISO}')`,
      );

      // Add recipe
      await app.fetch(
        new Request("http://localhost/collections/coll-rm-r-1/recipes", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ recipeId: "recipe-rm-1" }),
        }),
        testEnv(),
      );

      // Remove recipe
      const res = await app.fetch(
        new Request("http://localhost/collections/coll-rm-r-1/recipes/recipe-rm-1", {
          method: "DELETE",
          headers: authHeaders(false),
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
      const body = await res.json<{ recipe_ids: string[] }>();
      expect(body.recipe_ids).not.toContain("recipe-rm-1");
    });
  });
});
