/**
 * Tests for the webhook handlers service (SPEC 11.1).
 *
 * Covers Kit webhook event dispatching and event recording.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { createDb } from "../../src/db/index.js";
import { handleWebhookEvent } from "../../src/services/webhook-handlers.js";
import type { KitWebhookPayload } from "../../src/lib/kit/webhooks.js";
import { KIT_WEBHOOK_EVENT } from "../../src/lib/kit/types.js";
import { createTestTables, cleanTestTables } from "../helpers/db-setup.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CREATOR_ID = "creator-webhook-1";

async function seedCreator(d1: D1Database, creatorId: string): Promise<void> {
  const now = new Date().toISOString();
  await d1.exec(
    `INSERT INTO creators (id, email, name, password_hash, subscription_tier, subscription_started_at, created_at, updated_at) VALUES ('${creatorId}', '${creatorId}@test.com', 'Test Creator', 'hash', 'Creator', '${now}', '${now}', '${now}')`,
  );
}

async function seedRecipe(
  d1: D1Database,
  creatorId: string,
  recipeId: string,
  title: string,
): Promise<void> {
  const now = new Date().toISOString();
  await d1.exec(
    `INSERT INTO recipes (id, creator_id, title, slug, status, created_at, updated_at) VALUES ('${recipeId}', '${creatorId}', '${title}', '${recipeId}', 'Active', '${now}', '${now}')`,
  );
}

function makePayload(
  overrides: Partial<KitWebhookPayload> & { event: KitWebhookPayload["event"] },
): KitWebhookPayload {
  return {
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Webhook Handlers", () => {
  beforeEach(async () => {
    await createTestTables(env.DB);
    await cleanTestTables(env.DB);
    await seedCreator(env.DB, TEST_CREATOR_ID);
  });

  // -------------------------------------------------------------------------
  // link.clicked → save_click
  // -------------------------------------------------------------------------

  describe("link.clicked with Save This Recipe URL", () => {
    it("records a save_click event for matching URL", async () => {
      const db = createDb(env.DB);
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-save-click", "Save Click Recipe");

      const payload = makePayload({
        event: KIT_WEBHOOK_EVENT.LinkClick,
        url: "https://app.example.com/save-recipe/recipe-save-click",
        subscriber: {
          id: 12345,
          email_address: "sub@test.com",
          first_name: "Test",
          state: "active",
          fields: {},
        },
      });

      const result = await handleWebhookEvent(db, TEST_CREATOR_ID, payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.handled).toBe(true);
        expect(result.value.action).toBe("save_click_recorded");
      }

      // Verify event was stored
      const rows = await env.DB.prepare(
        "SELECT * FROM recipe_engagement_events WHERE creator_id = ? AND event_type = 'SaveClick'",
      )
        .bind(TEST_CREATOR_ID)
        .all();

      expect(rows.results.length).toBe(1);
    });

    it("ignores links that are not Save This Recipe URLs", async () => {
      const db = createDb(env.DB);

      const payload = makePayload({
        event: KIT_WEBHOOK_EVENT.LinkClick,
        url: "https://example.com/some-other-link",
        subscriber: {
          id: 12345,
          email_address: "sub@test.com",
          first_name: "Test",
          state: "active",
          fields: {},
        },
      });

      const result = await handleWebhookEvent(db, TEST_CREATOR_ID, payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.handled).toBe(false);
        expect(result.value.action).toBe("not_save_recipe_url");
      }
    });

    it("handles missing URL gracefully", async () => {
      const db = createDb(env.DB);

      const payload = makePayload({
        event: KIT_WEBHOOK_EVENT.LinkClick,
        subscriber: {
          id: 12345,
          email_address: "sub@test.com",
          first_name: "Test",
          state: "active",
          fields: {},
        },
      });

      const result = await handleWebhookEvent(db, TEST_CREATOR_ID, payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.handled).toBe(false);
        expect(result.value.action).toBe("no_url");
      }
    });
  });

  // -------------------------------------------------------------------------
  // purchase.completed → attribution
  // -------------------------------------------------------------------------

  describe("purchase.completed", () => {
    it("triggers revenue attribution", async () => {
      const db = createDb(env.DB);

      const payload = makePayload({
        event: KIT_WEBHOOK_EVENT.PurchaseCreate,
        subscriber: {
          id: 67890,
          email_address: "buyer@test.com",
          first_name: "Buyer",
          state: "active",
          fields: {},
        },
        purchase: {
          id: 1001,
          transaction_id: "txn-123",
          total: 2999,
        },
      });

      const result = await handleWebhookEvent(db, TEST_CREATOR_ID, payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.handled).toBe(true);
        expect(result.value.eventType).toBe("purchase_create");
      }
    });

    it("returns error when purchase data is missing", async () => {
      const db = createDb(env.DB);

      const payload = makePayload({
        event: KIT_WEBHOOK_EVENT.PurchaseCreate,
        subscriber: {
          id: 67890,
          email_address: "buyer@test.com",
          first_name: "Buyer",
          state: "active",
          fields: {},
        },
      });

      const result = await handleWebhookEvent(db, TEST_CREATOR_ID, payload);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("missing_data");
      }
    });
  });

  // -------------------------------------------------------------------------
  // subscriber.tag_added → save_click secondary confirmation
  // -------------------------------------------------------------------------

  describe("subscriber.tag_added", () => {
    it("records save_click for recipe:saved:* tag", async () => {
      const db = createDb(env.DB);

      const payload = makePayload({
        event: KIT_WEBHOOK_EVENT.TagAdd,
        subscriber: {
          id: 11111,
          email_address: "tagged@test.com",
          first_name: "Tagged",
          state: "active",
          fields: {},
        },
        tag: {
          id: 501,
          name: "recipe:saved:lemon-pasta",
        },
      });

      const result = await handleWebhookEvent(db, TEST_CREATOR_ID, payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.handled).toBe(true);
        expect(result.value.action).toBe("save_click_confirmed");
      }
    });

    it("ignores non-recipe-saved tags", async () => {
      const db = createDb(env.DB);

      const payload = makePayload({
        event: KIT_WEBHOOK_EVENT.TagAdd,
        subscriber: {
          id: 11111,
          email_address: "tagged@test.com",
          first_name: "Tagged",
          state: "active",
          fields: {},
        },
        tag: {
          id: 502,
          name: "dietary:vegan",
        },
      });

      const result = await handleWebhookEvent(db, TEST_CREATOR_ID, payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.handled).toBe(false);
        expect(result.value.action).toBe("not_recipe_saved_tag");
      }
    });
  });

  // -------------------------------------------------------------------------
  // Duplicate webhook handling (idempotent)
  // -------------------------------------------------------------------------

  describe("duplicate webhook handling", () => {
    it("handles duplicate link.clicked webhooks gracefully", async () => {
      const db = createDb(env.DB);
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-dup-wh", "Dup Recipe");

      const payload = makePayload({
        event: KIT_WEBHOOK_EVENT.LinkClick,
        url: "https://app.example.com/save-recipe/recipe-dup-wh",
        subscriber: {
          id: 99999,
          email_address: "dup@test.com",
          first_name: "Dup",
          state: "active",
          fields: {},
        },
      });

      // First webhook
      const first = await handleWebhookEvent(db, TEST_CREATOR_ID, payload);
      expect(first.ok).toBe(true);

      // Second identical webhook — should still succeed (event ID includes timestamp)
      const second = await handleWebhookEvent(db, TEST_CREATOR_ID, payload);
      expect(second.ok).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // subscriber.activated / subscriber.unsubscribed
  // -------------------------------------------------------------------------

  describe("subscriber lifecycle events", () => {
    it("handles subscriber.activated", async () => {
      const db = createDb(env.DB);

      const payload = makePayload({
        event: KIT_WEBHOOK_EVENT.SubscriberActivate,
        subscriber: {
          id: 22222,
          email_address: "activated@test.com",
          first_name: "Active",
          state: "active",
          fields: {},
        },
      });

      const result = await handleWebhookEvent(db, TEST_CREATOR_ID, payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.handled).toBe(true);
        expect(result.value.action).toBe("segmentation_queued");
      }
    });

    it("handles subscriber.unsubscribed", async () => {
      const db = createDb(env.DB);

      const payload = makePayload({
        event: KIT_WEBHOOK_EVENT.SubscriberUnsubscribe,
        subscriber: {
          id: 33333,
          email_address: "unsub@test.com",
          first_name: "Unsub",
          state: "cancelled",
          fields: {},
        },
      });

      const result = await handleWebhookEvent(db, TEST_CREATOR_ID, payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.handled).toBe(true);
        expect(result.value.action).toBe("segmentation_removal_queued");
      }
    });
  });

  // -------------------------------------------------------------------------
  // Unknown event types
  // -------------------------------------------------------------------------

  describe("unknown event types", () => {
    it("returns handled=false for unrecognized events", async () => {
      const db = createDb(env.DB);

      const payload = makePayload({
        event: KIT_WEBHOOK_EVENT.FormSubscribe,
      });

      const result = await handleWebhookEvent(db, TEST_CREATOR_ID, payload);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.handled).toBe(false);
        expect(result.value.action).toBe("ignored");
      }
    });
  });
});
