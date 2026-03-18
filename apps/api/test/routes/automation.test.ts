/**
 * Integration tests for automation HTTP endpoints.
 *
 * Tests save-recipe, broadcast-draft, seasonal drops, and save redirect.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { clerkAuth } from "../../src/middleware/auth.js";
import type { AppEnv } from "../../src/middleware/auth.js";
import { automationRoutes, createSaveRedirectRoutes } from "../../src/routes/automation.js";
import type { Env } from "../../src/env.js";
import type { CreatorId } from "../../src/types/auth.js";
import { env } from "cloudflare:test";
import { createTestTables, cleanTestTables } from "../helpers/db-setup.js";

const TEST_CREATOR_ID = "creator-auto-rt-1" as CreatorId;
const NOW_ISO = new Date().toISOString();

async function fakeVerify(token: string, _env: Env): Promise<string | null> {
  if (token === "valid-token") return TEST_CREATOR_ID;
  return null;
}

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.use("/automation/*", clerkAuth({ verifyFn: fakeVerify }));
  app.route("/automation", automationRoutes);
  app.route("/save", createSaveRedirectRoutes());
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

function authHeaders(): Record<string, string> {
  return {
    Authorization: "Bearer valid-token",
    "Content-Type": "application/json",
  };
}

describe("Automation Routes", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(async () => {
    await createTestTables(env.DB);
    await cleanTestTables(env.DB);
    app = createTestApp();
    await env.DB.exec(
      `INSERT INTO creators (id, email, name, password_hash, subscription_tier, subscription_started_at, created_at, updated_at) VALUES ('${TEST_CREATOR_ID}', 'test@test.com', 'Test', 'hash', 'Creator', '${NOW_ISO}', '${NOW_ISO}', '${NOW_ISO}')`,
    );
  });

  describe("GET /automation/seasonal-drops", () => {
    it("returns empty list when no drops configured", async () => {
      const res = await app.fetch(
        new Request("http://localhost/automation/seasonal-drops", {
          headers: { Authorization: "Bearer valid-token" },
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
      const body = await res.json<{ drops: unknown[] }>();
      expect(body.drops).toEqual([]);
    });
  });

  describe("POST /automation/seasonal-drops", () => {
    it("creates a seasonal drop", async () => {
      // Insert a collection first
      await env.DB.exec(
        `INSERT INTO collections (id, creator_id, name, created_at, updated_at) VALUES ('coll-sd-1', '${TEST_CREATOR_ID}', 'Summer', '${NOW_ISO}', '${NOW_ISO}')`,
      );

      const res = await app.fetch(
        new Request("http://localhost/automation/seasonal-drops", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            id: "sd-1",
            label: "Summer Salads",
            startDate: "2026-06-01",
            endDate: "2026-08-31",
            collectionId: "coll-sd-1",
            recurrence: "None",
          }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(201);
    });
  });

  describe("POST /automation/save-recipe", () => {
    it("returns 404 when recipe not found", async () => {
      const res = await app.fetch(
        new Request("http://localhost/automation/save-recipe", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            recipeSlug: "nonexistent-recipe",
            subscriberId: "sub-1",
            accessToken: "kit-token",
          }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(404);
    });
  });

  describe("POST /automation/broadcast-draft/:recipeId", () => {
    it("returns 404 when recipe not found", async () => {
      const res = await app.fetch(
        new Request("http://localhost/automation/broadcast-draft/nonexistent", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ accessToken: "kit-token" }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(404);
    });
  });

  describe("POST /automation/lead-magnet-sequence/:productId", () => {
    it("returns 404 when product not found", async () => {
      const res = await app.fetch(
        new Request("http://localhost/automation/lead-magnet-sequence/nonexistent", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ accessToken: "kit-token" }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(404);
    });
  });

  describe("POST /automation/seasonal-drops — invalid input", () => {
    it("returns error for invalid seasonal drop", async () => {
      const res = await app.fetch(
        new Request("http://localhost/automation/seasonal-drops", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            id: "sd-invalid",
            label: "",
            startDate: "2026-06-01",
            endDate: "2026-08-31",
            collectionId: "nonexistent-coll",
            recurrence: "None",
          }),
        }),
        testEnv(),
      );

      // Expect an error status (400 or 404 depending on validation path)
      expect([400, 404].includes(res.status)).toBe(true);
    });
  });

  describe("POST /automation/seasonal-drops/process", () => {
    it("returns 200 with empty results when no drops are due", async () => {
      const res = await app.fetch(
        new Request("http://localhost/automation/seasonal-drops/process", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ accessToken: "kit-token" }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
    });
  });

  describe("Save Redirect Routes (Public)", () => {
    describe("GET /save/:creatorId/:recipeSlug", () => {
      it("redirects to default URL when recipe has no source", async () => {
        await env.DB.exec(
          `INSERT INTO recipes (id, creator_id, title, slug, status, created_at, updated_at) VALUES ('r-save-1', '${TEST_CREATOR_ID}', 'Save Recipe', 'save-recipe', 'Draft', '${NOW_ISO}', '${NOW_ISO}')`,
        );

        const res = await app.fetch(
          new Request(`http://localhost/save/${TEST_CREATOR_ID}/save-recipe`),
          testEnv(),
        );

        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toBe("https://kit.com");
      });

      it("redirects to recipe source URL when available", async () => {
        await env.DB.exec(
          `INSERT INTO recipes (id, creator_id, title, slug, status, source_data, created_at, updated_at) VALUES ('r-save-2', '${TEST_CREATOR_ID}', 'With Source', 'with-source', 'Draft', '${JSON.stringify({ url: "https://myblog.com/recipe" })}', '${NOW_ISO}', '${NOW_ISO}')`,
        );

        const res = await app.fetch(
          new Request(`http://localhost/save/${TEST_CREATOR_ID}/with-source`),
          testEnv(),
        );

        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toBe("https://myblog.com/recipe");
      });

      it("redirects to kit.com when recipe does not exist", async () => {
        const res = await app.fetch(
          new Request(`http://localhost/save/${TEST_CREATOR_ID}/nonexistent-recipe`),
          testEnv(),
        );

        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toBe("https://kit.com");
      });
    });
  });
});
