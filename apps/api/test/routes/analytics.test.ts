/**
 * Integration tests for analytics HTTP endpoints.
 *
 * Tests engagement scores, compute, recommendations, and webhook routes.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { clerkAuth } from "../../src/middleware/auth.js";
import type { AppEnv } from "../../src/middleware/auth.js";
import { analyticsRoutes, webhookRoutes } from "../../src/routes/analytics.js";
import type { Env } from "../../src/env.js";
import type { CreatorId } from "../../src/types/auth.js";
import { env } from "cloudflare:test";
import { createTestTables, cleanTestTables } from "../helpers/db-setup.js";

const TEST_CREATOR_ID = "creator-analytics-rt-1" as CreatorId;
const NOW_ISO = new Date().toISOString();

async function fakeVerify(token: string, _env: Env): Promise<string | null> {
  if (token === "valid-token") return TEST_CREATOR_ID;
  return null;
}

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.use("/analytics/*", clerkAuth({ verifyFn: fakeVerify }));
  app.route("/analytics", analyticsRoutes);
  app.route("/webhooks", webhookRoutes);
  return app;
}

function testEnv(): Env {
  return {
    DB: env.DB,
    STORAGE: {} as R2Bucket,
    CACHE: {
      get: async () => null,
      put: async () => {},
    } as unknown as KVNamespace,
    IMPORT_QUEUE: {} as Queue,
    RENDER_QUEUE: {} as Queue,
    CLERK_PUBLISHABLE_KEY: "pk_test_xxx",
    CLERK_SECRET_KEY: "sk_test_xxx",
    KIT_CLIENT_ID: "kit_id",
    KIT_CLIENT_SECRET: "test_secret",
    LOG_LEVEL: "info",
  };
}

describe("Analytics Routes", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(async () => {
    await createTestTables(env.DB);
    await cleanTestTables(env.DB);
    app = createTestApp();
    await env.DB.exec(
      `INSERT INTO creators (id, email, name, password_hash, subscription_tier, subscription_started_at, created_at, updated_at) VALUES ('${TEST_CREATOR_ID}', 'test@test.com', 'Test', 'hash', 'Creator', '${NOW_ISO}', '${NOW_ISO}', '${NOW_ISO}')`,
    );
  });

  describe("GET /analytics/engagement-scores", () => {
    it("returns scores for creator (empty when no events)", async () => {
      const res = await app.fetch(
        new Request("http://localhost/analytics/engagement-scores", {
          headers: { Authorization: "Bearer valid-token" },
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
      const body = await res.json<{ scores: unknown[] }>();
      expect(body.scores).toEqual([]);
    });
  });

  describe("GET /analytics/engagement-scores/:recipeId", () => {
    it("returns 404 for recipe with no score", async () => {
      const res = await app.fetch(
        new Request("http://localhost/analytics/engagement-scores/recipe-no-score", {
          headers: { Authorization: "Bearer valid-token" },
        }),
        testEnv(),
      );

      expect(res.status).toBe(404);
    });

    it("returns score when one exists", async () => {
      // Insert a recipe and score
      await env.DB.exec(
        `INSERT INTO recipes (id, creator_id, title, slug, status, created_at, updated_at) VALUES ('r-score-1', '${TEST_CREATOR_ID}', 'Scored Recipe', 'scored-recipe', 'Draft', '${NOW_ISO}', '${NOW_ISO}')`,
      );
      await env.DB.exec(
        `INSERT INTO recipe_engagement_scores (recipe_id, creator_id, score, computed_at, save_clicks_30d, sequence_triggers_30d, card_views_30d, purchase_attributions_all) VALUES ('r-score-1', '${TEST_CREATOR_ID}', 7.5, '${NOW_ISO}', 3, 1, 5, 0)`,
      );

      const res = await app.fetch(
        new Request("http://localhost/analytics/engagement-scores/r-score-1", {
          headers: { Authorization: "Bearer valid-token" },
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
      const body = await res.json<{ score: { score: number } }>();
      expect(body.score.score).toBe(7.5);
    });
  });

  describe("POST /analytics/compute-scores", () => {
    it("computes scores (returns empty when no events)", async () => {
      await env.DB.exec(
        `INSERT INTO recipes (id, creator_id, title, slug, status, created_at, updated_at) VALUES ('r-compute-1', '${TEST_CREATOR_ID}', 'Compute Recipe', 'compute-recipe', 'Draft', '${NOW_ISO}', '${NOW_ISO}')`,
      );

      const res = await app.fetch(
        new Request("http://localhost/analytics/compute-scores", {
          method: "POST",
          headers: { Authorization: "Bearer valid-token" },
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
      const body = await res.json<{ scores: unknown[]; count: number }>();
      expect(body.count).toBe(0);
    });

    it("computes scores when events exist", async () => {
      await env.DB.exec(
        `INSERT INTO recipes (id, creator_id, title, slug, status, created_at, updated_at) VALUES ('r-compute-2', '${TEST_CREATOR_ID}', 'Popular Recipe', 'popular-recipe', 'Draft', '${NOW_ISO}', '${NOW_ISO}')`,
      );
      await env.DB.exec(
        `INSERT INTO recipe_engagement_events (id, creator_id, recipe_id, event_type, source, occurred_at) VALUES ('evt-1', '${TEST_CREATOR_ID}', 'r-compute-2', 'SaveClick', 'test', '${NOW_ISO}')`,
      );
      await env.DB.exec(
        `INSERT INTO recipe_engagement_events (id, creator_id, recipe_id, event_type, source, occurred_at) VALUES ('evt-2', '${TEST_CREATOR_ID}', 'r-compute-2', 'CardView', 'test', '${NOW_ISO}')`,
      );

      const res = await app.fetch(
        new Request("http://localhost/analytics/compute-scores", {
          method: "POST",
          headers: { Authorization: "Bearer valid-token" },
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
      const body = await res.json<{ scores: Array<{ score: number }>; count: number }>();
      expect(body.count).toBe(1);
      expect(body.scores[0]?.score).toBeGreaterThan(0);
    });
  });

  describe("GET /analytics/recommendations", () => {
    it("returns empty recommendations when no segment profile exists", async () => {
      const res = await app.fetch(
        new Request("http://localhost/analytics/recommendations", {
          headers: { Authorization: "Bearer valid-token" },
        }),
        testEnv(),
      );

      expect(res.status).toBe(200);
      const body = await res.json<{ recommendations: unknown[] }>();
      expect(body.recommendations).toEqual([]);
    });
  });

  describe("POST /webhooks/kit", () => {
    it("returns 403 when signature verification fails", async () => {
      const res = await app.fetch(
        new Request("http://localhost/webhooks/kit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Kit-Signature": "invalid-signature",
          },
          body: JSON.stringify({ type: "subscriber.subscriber_activate" }),
        }),
        testEnv(),
      );

      expect(res.status).toBe(403);
    });

    it("accepts a webhook with valid HMAC signature", async () => {
      const secret = "test_secret";
      const payload = JSON.stringify({
        event: "subscriber.subscriber_activate",
        subscriber: {
          id: 12345,
          email_address: "test@example.com",
          first_name: "Test",
          state: "active",
          fields: {},
        },
      });

      // Generate HMAC-SHA256 signature
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
      const sigBytes = new Uint8Array(sigBuffer);
      let signature = "";
      for (let i = 0; i < sigBytes.length; i++) {
        signature += (sigBytes[i] as number).toString(16).padStart(2, "0");
      }

      const res = await app.fetch(
        new Request("http://localhost/webhooks/kit?creator_id=" + TEST_CREATOR_ID, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Kit-Signature": signature,
          },
          body: payload,
        }),
        testEnv(),
      );

      // Should accept the webhook (200 even if handler has an issue)
      expect(res.status).toBe(200);
      const body = await res.json<{ received: boolean }>();
      expect(body.received).toBe(true);
    });

    it("returns 400 when creator_id is missing from verified webhook", async () => {
      const secret = "test_secret";
      const payload = JSON.stringify({
        event: "subscriber.subscriber_activate",
      });

      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
      const sigBytes = new Uint8Array(sigBuffer);
      let signature = "";
      for (let i = 0; i < sigBytes.length; i++) {
        signature += (sigBytes[i] as number).toString(16).padStart(2, "0");
      }

      const res = await app.fetch(
        new Request("http://localhost/webhooks/kit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Kit-Signature": signature,
          },
          body: payload,
        }),
        testEnv(),
      );

      expect(res.status).toBe(400);
      const body = await res.json<{ error: string }>();
      expect(body.error).toBe("Missing creator context");
    });
  });
});
