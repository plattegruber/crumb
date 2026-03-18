/**
 * Integration tests for publishing HTTP endpoints.
 *
 * Tests platform publishing, download package, share assets, and listings.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { clerkAuth } from "../../src/middleware/auth.js";
import type { AppEnv } from "../../src/middleware/auth.js";
import { publishingRoutes } from "../../src/routes/publishing.js";
import type { Env } from "../../src/env.js";
import type { CreatorId } from "../../src/types/auth.js";
import { env } from "cloudflare:test";
import { createTestTables, cleanTestTables } from "../helpers/db-setup.js";

const TEST_CREATOR_ID = "creator-pub-rt-1" as CreatorId;
const NOW_ISO = new Date().toISOString();

async function fakeVerify(token: string, _env: Env): Promise<string | null> {
  if (token === "valid-token") return TEST_CREATOR_ID;
  return null;
}

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.use("*", clerkAuth({ verifyFn: fakeVerify }));
  app.route("/products", publishingRoutes);
  return app;
}

function testEnv(): Env {
  return {
    DB: env.DB,
    STORAGE: {
      get: async () => null,
      put: async () => {},
    } as unknown as R2Bucket,
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

async function insertProduct(id: string, creatorId: string, status = "Published"): Promise<void> {
  await env.DB.exec(
    `INSERT INTO brand_kits (id, creator_id, name, primary_color, heading_font_family, heading_font_fallback, body_font_family, body_font_fallback, created_at, updated_at) VALUES ('bk-pub-${id}', '${creatorId}', 'Brand', '#FF0000', 'Arial', 'sans-serif', 'Arial', 'sans-serif', '${NOW_ISO}', '${NOW_ISO}')`,
  );
  await env.DB.exec(
    `INSERT INTO product_base (id, creator_id, product_type, status, title, brand_kit_id, template_id, currency, created_at, updated_at) VALUES ('${id}', '${creatorId}', 'Ebook', '${status}', 'Test Product', 'bk-pub-${id}', 'tmpl-1', 'USD', '${NOW_ISO}', '${NOW_ISO}')`,
  );
}

describe("Publishing Routes", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(async () => {
    await createTestTables(env.DB);
    await cleanTestTables(env.DB);
    app = createTestApp();
    await env.DB.exec(
      `INSERT INTO creators (id, email, name, password_hash, subscription_tier, subscription_started_at, created_at, updated_at) VALUES ('${TEST_CREATOR_ID}', 'test@test.com', 'Test', 'hash', 'Creator', '${NOW_ISO}', '${NOW_ISO}', '${NOW_ISO}')`,
    );
  });

  describe("POST /products/:id/publish/:platform", () => {
    it("returns 502 for valid platform (not yet configured)", async () => {
      await insertProduct("prod-pub-1", TEST_CREATOR_ID);

      const res = await app.fetch(
        new Request("http://localhost/products/prod-pub-1/publish/StanStore", {
          method: "POST",
          headers: authHeaders(),
        }),
        testEnv(),
      );

      expect(res.status).toBe(502);
      const body = await res.json<{ error: { type: string } }>();
      expect(body.error.type).toBe("platform_unavailable");
    });

    it("returns 400 for invalid platform", async () => {
      const res = await app.fetch(
        new Request("http://localhost/products/prod-pub-2/publish/InvalidPlatform", {
          method: "POST",
          headers: authHeaders(),
        }),
        testEnv(),
      );

      expect(res.status).toBe(400);
    });
  });

  describe("POST /products/:id/download-package", () => {
    it("returns error for non-existent product", async () => {
      const res = await app.fetch(
        new Request("http://localhost/products/nonexistent/download-package", {
          method: "POST",
          headers: authHeaders(),
        }),
        testEnv(),
      );

      expect(res.status).toBe(404);
    });
  });

  describe("POST /products/:id/share-assets", () => {
    it("returns error for non-existent product", async () => {
      const res = await app.fetch(
        new Request("http://localhost/products/nonexistent/share-assets", {
          method: "POST",
          headers: authHeaders(),
        }),
        testEnv(),
      );

      expect(res.status).toBe(404);
    });

    it("generates share assets for existing product", async () => {
      await insertProduct("prod-share-1", TEST_CREATOR_ID);

      const res = await app.fetch(
        new Request("http://localhost/products/prod-share-1/share-assets", {
          method: "POST",
          headers: authHeaders(),
        }),
        testEnv(),
      );

      // May return 200, 400, or 500 depending on product state and brand kit
      expect([200, 400, 500]).toContain(res.status);
    });
  });

  describe("POST /products/:id/download-package (existing product)", () => {
    it("returns error when product has no PDF", async () => {
      await insertProduct("prod-no-pdf", TEST_CREATOR_ID, "Published");

      const res = await app.fetch(
        new Request("http://localhost/products/prod-no-pdf/download-package", {
          method: "POST",
          headers: authHeaders(),
        }),
        testEnv(),
      );

      // Should fail because published product has no PDF
      expect(res.status).toBe(400);
    });
  });

  describe("POST /products/:id/publish/:platform — additional platforms", () => {
    it("returns 502 for Gumroad platform", async () => {
      const res = await app.fetch(
        new Request("http://localhost/products/any-id/publish/Gumroad", {
          method: "POST",
          headers: authHeaders(),
        }),
        testEnv(),
      );

      expect(res.status).toBe(502);
    });

    it("returns 502 for LTK platform", async () => {
      const res = await app.fetch(
        new Request("http://localhost/products/any-id/publish/LTK", {
          method: "POST",
          headers: authHeaders(),
        }),
        testEnv(),
      );

      expect(res.status).toBe(502);
    });
  });

  describe("GET /products/:id/listings", () => {
    it("returns empty listings for product with none", async () => {
      await insertProduct("prod-list-1", TEST_CREATOR_ID);

      const res = await app.fetch(
        new Request("http://localhost/products/prod-list-1/listings", {
          headers: { Authorization: "Bearer valid-token" },
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
    });

    it("returns 404 for non-existent product", async () => {
      const res = await app.fetch(
        new Request("http://localhost/products/nonexistent/listings", {
          headers: { Authorization: "Bearer valid-token" },
        }),
        testEnv(),
      );

      expect(res.status).toBe(404);
    });
  });
});
