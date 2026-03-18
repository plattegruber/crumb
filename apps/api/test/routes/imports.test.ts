/**
 * Integration tests for import HTTP endpoints.
 *
 * Tests the full HTTP cycle for the import pipeline routes.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { clerkAuth } from "../../src/middleware/auth.js";
import type { AppEnv } from "../../src/middleware/auth.js";
import { imports } from "../../src/routes/imports.js";
import type { Env } from "../../src/env.js";
import type { CreatorId } from "../../src/types/auth.js";
import { env } from "cloudflare:test";
import { createTestTables, cleanTestTables } from "../helpers/db-setup.js";

const TEST_CREATOR_ID = "creator-import-rt-1" as CreatorId;
const NOW_ISO = new Date().toISOString();

async function fakeVerify(token: string, _env: Env): Promise<string | null> {
  if (token === "valid-token") return TEST_CREATOR_ID;
  return null;
}

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.use("*", clerkAuth({ verifyFn: fakeVerify }));
  app.route("/imports", imports);
  return app;
}

function testEnv(): Env {
  return {
    DB: env.DB,
    STORAGE: {} as R2Bucket,
    CACHE: {} as KVNamespace,
    IMPORT_QUEUE: {
      send: async () => {
        /* stub */
      },
    } as unknown as Queue,
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

describe("Import Routes", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(async () => {
    await createTestTables(env.DB);
    await cleanTestTables(env.DB);
    app = createTestApp();
    await env.DB.exec(
      `INSERT INTO creators (id, email, name, password_hash, subscription_tier, subscription_started_at, created_at, updated_at) VALUES ('${TEST_CREATOR_ID}', 'test@test.com', 'Test', 'hash', 'Creator', '${NOW_ISO}', '${NOW_ISO}', '${NOW_ISO}')`,
    );
  });

  describe("POST /imports", () => {
    it("creates an import job and returns 201", async () => {
      const res = await app.fetch(
        new Request("http://localhost/imports", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            source_type: "URL",
            source_data: { url: "https://example.com/recipe" },
          }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(201);
      const body = await res.json<Record<string, unknown>>();
      expect(body).toHaveProperty("id");
    });

    it("returns 400 when source_type is missing", async () => {
      const res = await app.fetch(
        new Request("http://localhost/imports", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            source_data: { url: "https://example.com/recipe" },
          }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(400);
    });

    it("returns 400 when source_data is not an object", async () => {
      const res = await app.fetch(
        new Request("http://localhost/imports", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            source_type: "URL",
            source_data: null,
          }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(400);
    });
  });

  describe("GET /imports", () => {
    it("lists import jobs for the creator", async () => {
      // Create an import job first
      await app.fetch(
        new Request("http://localhost/imports", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            source_type: "URL",
            source_data: { url: "https://example.com/recipe1" },
          }),
        }),
        testEnv(),
      );

      const res = await app.fetch(
        new Request("http://localhost/imports", {
          headers: authHeaders(false),
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
      const body = await res.json<{ jobs: unknown[] }>();
      expect(body.jobs).toHaveLength(1);
    });

    it("supports pagination query params", async () => {
      const res = await app.fetch(
        new Request("http://localhost/imports?limit=10&offset=0", {
          headers: authHeaders(false),
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
    });
  });

  describe("GET /imports (with non-numeric params)", () => {
    it("handles non-numeric limit gracefully", async () => {
      const res = await app.fetch(
        new Request("http://localhost/imports?limit=abc&offset=xyz", {
          headers: authHeaders(false),
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
    });
  });

  describe("GET /imports/:id", () => {
    it("returns 404 for non-existent import job", async () => {
      const res = await app.fetch(
        new Request("http://localhost/imports/nonexistent-id", {
          headers: authHeaders(false),
        }),
        testEnv(),
      );

      expect(res.status).toBe(404);
    });

    it("gets an existing import job", async () => {
      // Create an import job first
      const createRes = await app.fetch(
        new Request("http://localhost/imports", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            source_type: "URL",
            source_data: { url: "https://example.com/recipe-get" },
          }),
        }),
        testEnv(),
      );
      expect(createRes.status).toBe(201);
      const created = await createRes.json<{ id: string }>();

      const res = await app.fetch(
        new Request(`http://localhost/imports/${created.id}`, {
          headers: authHeaders(false),
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
    });
  });

  describe("POST /imports/:id/confirm", () => {
    it("returns 404 for non-existent import job", async () => {
      const res = await app.fetch(
        new Request("http://localhost/imports/nonexistent/confirm", {
          method: "POST",
          headers: authHeaders(false),
        }),
        testEnv(),
      );

      expect(res.status).toBe(404);
    });
  });

  describe("POST /imports/:id/reject", () => {
    it("returns 404 for non-existent import job", async () => {
      const res = await app.fetch(
        new Request("http://localhost/imports/nonexistent/reject", {
          method: "POST",
          headers: authHeaders(false),
        }),
        testEnv(),
      );

      expect(res.status).toBe(404);
    });
  });

  describe("POST /imports/wordpress/test-connection", () => {
    it("returns 400 when site_url is missing", async () => {
      const res = await app.fetch(
        new Request("http://localhost/imports/wordpress/test-connection", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ api_key: "key123" }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(400);
      const body = await res.json<{ error: string }>();
      expect(body.error).toBe("ValidationError");
    });

    it("returns 400 when api_key is missing", async () => {
      const res = await app.fetch(
        new Request("http://localhost/imports/wordpress/test-connection", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ site_url: "https://example.com" }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(400);
    });
  });

  describe("POST /imports/wordpress/sync", () => {
    it("returns 400 when plugin is invalid", async () => {
      const res = await app.fetch(
        new Request("http://localhost/imports/wordpress/sync", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            site_url: "https://example.com",
            api_key: "key123",
            plugin: "InvalidPlugin",
          }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(400);
      const body = await res.json<{ message: string }>();
      expect(body.message).toContain("WpRecipeMaker");
    });

    it("returns 400 when site_url is missing", async () => {
      const res = await app.fetch(
        new Request("http://localhost/imports/wordpress/sync", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            api_key: "key123",
            plugin: "WpRecipeMaker",
          }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(400);
    });

    it("returns 400 when api_key is missing", async () => {
      const res = await app.fetch(
        new Request("http://localhost/imports/wordpress/sync", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            site_url: "https://example.com",
            plugin: "WpRecipeMaker",
          }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(400);
    });
  });
});
