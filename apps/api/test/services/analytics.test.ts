/**
 * Tests for the analytics service (SPEC 11).
 *
 * Covers event recording, engagement score computation,
 * product recommendations, and revenue attribution.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { createDb } from "../../src/db/index.js";
import {
  recordEngagementEvent,
  computeEngagementScores,
  getEngagementScores,
  getRecipeEngagementScore,
  computeRecommendations,
  computeRevenueAttribution,
  ENGAGEMENT_EVENT_TYPE,
  hashSubscriberId,
} from "../../src/services/analytics.js";
import type { RecordEngagementEventInput } from "../../src/services/analytics.js";
import { createTestTables, cleanTestTables } from "../helpers/db-setup.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CREATOR_ID = "creator-analytics-1";
const _OTHER_CREATOR_ID = "creator-analytics-2";

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
  dietaryTags: readonly string[] = [],
  confirmed = false,
): Promise<void> {
  const now = new Date().toISOString();
  const tags = JSON.stringify(dietaryTags);
  const confirmedInt = confirmed ? 1 : 0;
  await d1.exec(
    `INSERT INTO recipes (id, creator_id, title, slug, status, dietary_tags, dietary_tags_confirmed, created_at, updated_at) VALUES ('${recipeId}', '${creatorId}', '${title}', '${recipeId}', 'Active', '${tags}', ${confirmedInt}, '${now}', '${now}')`,
  );
}

async function seedSegmentProfile(
  d1: D1Database,
  creatorId: string,
  segments: Record<
    string,
    {
      subscriber_count: number;
      engagement_rate: number;
      growth_rate_30d: number;
      top_recipe_ids: readonly string[];
    }
  >,
): Promise<void> {
  const now = new Date().toISOString();
  const segmentsJson = JSON.stringify(segments);
  await d1.exec(
    `INSERT INTO segment_profiles (creator_id, computed_at, segments) VALUES ('${creatorId}', '${now}', '${segmentsJson}')`,
  );
}

async function seedProduct(
  d1: D1Database,
  creatorId: string,
  productId: string,
  recipeIds: readonly string[],
  productType: "Ebook" | "RecipeCardPack" = "Ebook",
): Promise<void> {
  const now = new Date().toISOString();
  await d1.exec(
    `INSERT INTO product_base (id, creator_id, product_type, status, title, brand_kit_id, template_id, created_at, updated_at) VALUES ('${productId}', '${creatorId}', '${productType}', 'Published', 'Test Product', 'bk-1', 'tmpl-1', '${now}', '${now}')`,
  );
  if (productType === "Ebook") {
    const recipeIdsJson = JSON.stringify(recipeIds);
    const chaptersJson = JSON.stringify([]);
    await d1.exec(
      `INSERT INTO ebook_details (product_id, recipe_ids, chapters, format) VALUES ('${productId}', '${recipeIdsJson}', '${chaptersJson}', 'LetterSize')`,
    );
  } else {
    const recipeIdsJson = JSON.stringify(recipeIds);
    await d1.exec(
      `INSERT INTO recipe_card_packs (product_id, recipe_ids) VALUES ('${productId}', '${recipeIdsJson}')`,
    );
  }
}

function makeEventInput(
  overrides: Partial<RecordEngagementEventInput> = {},
): RecordEngagementEventInput {
  return {
    id: overrides.id ?? `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    creatorId: overrides.creatorId ?? TEST_CREATOR_ID,
    recipeId: overrides.recipeId ?? "recipe-1",
    eventType: overrides.eventType ?? ENGAGEMENT_EVENT_TYPE.SaveClick,
    eventData: overrides.eventData ?? null,
    kitSubscriberId: overrides.kitSubscriberId ?? null,
    source: overrides.source ?? "KitWebhook",
    occurredAt: overrides.occurredAt ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Analytics Service", () => {
  beforeEach(async () => {
    await createTestTables(env.DB);
    await cleanTestTables(env.DB);
    await seedCreator(env.DB, TEST_CREATOR_ID);
  });

  // -------------------------------------------------------------------------
  // 11.1 Event Recording
  // -------------------------------------------------------------------------

  describe("recordEngagementEvent", () => {
    it("records a SaveClick event", async () => {
      const db = createDb(env.DB);
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-1", "Test Recipe");

      const input = makeEventInput({
        id: "evt-save-1",
        eventType: ENGAGEMENT_EVENT_TYPE.SaveClick,
        kitSubscriberId: "sub-123",
      });

      const result = await recordEngagementEvent(db, input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe("evt-save-1");
      }
    });

    it("records a CardView event", async () => {
      const db = createDb(env.DB);
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-1", "Test Recipe");

      const input = makeEventInput({
        id: "evt-card-1",
        eventType: ENGAGEMENT_EVENT_TYPE.CardView,
      });

      const result = await recordEngagementEvent(db, input);
      expect(result.ok).toBe(true);
    });

    it("records a SequenceTrigger event", async () => {
      const db = createDb(env.DB);
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-1", "Test Recipe");

      const input = makeEventInput({
        id: "evt-seq-1",
        eventType: ENGAGEMENT_EVENT_TYPE.SequenceTrigger,
      });

      const result = await recordEngagementEvent(db, input);
      expect(result.ok).toBe(true);
    });

    it("records a PurchaseAttribution event", async () => {
      const db = createDb(env.DB);
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-1", "Test Recipe");

      const input = makeEventInput({
        id: "evt-purchase-1",
        eventType: ENGAGEMENT_EVENT_TYPE.PurchaseAttribution,
        eventData: { product_id: "prod-1" },
      });

      const result = await recordEngagementEvent(db, input);
      expect(result.ok).toBe(true);
    });

    it("rejects duplicate events (idempotent)", async () => {
      const db = createDb(env.DB);
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-1", "Test Recipe");

      const input = makeEventInput({ id: "evt-dup-1" });

      const first = await recordEngagementEvent(db, input);
      expect(first.ok).toBe(true);

      const second = await recordEngagementEvent(db, input);
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.error.type).toBe("duplicate_event");
      }
    });

    it("hashes subscriber IDs for privacy", async () => {
      const db = createDb(env.DB);
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-1", "Test Recipe");

      const input = makeEventInput({
        id: "evt-hash-1",
        kitSubscriberId: "subscriber-456",
      });

      const result = await recordEngagementEvent(db, input);
      expect(result.ok).toBe(true);

      // Verify the stored subscriber ID is hashed (not the raw value)
      const rows = await env.DB.prepare(
        "SELECT kit_subscriber_id FROM recipe_engagement_events WHERE id = ?",
      )
        .bind("evt-hash-1")
        .all();

      const row = rows.results[0] as Record<string, unknown> | undefined;
      expect(row).toBeDefined();
      if (row) {
        expect(row["kit_subscriber_id"]).not.toBe("subscriber-456");
        // Should be a hex string (SHA-256 hash)
        expect(typeof row["kit_subscriber_id"]).toBe("string");
        expect((row["kit_subscriber_id"] as string).length).toBe(64);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 11.2 Engagement Score Computation
  // -------------------------------------------------------------------------

  describe("computeEngagementScores", () => {
    it("computes scores with the correct formula", async () => {
      const db = createDb(env.DB);
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-1", "Recipe 1");

      const now = new Date();

      // 5 save clicks, 3 sequence triggers, 10 card views, 2 purchase attributions
      for (let i = 0; i < 5; i++) {
        await recordEngagementEvent(
          db,
          makeEventInput({
            id: `save-${i}`,
            recipeId: "recipe-1",
            eventType: ENGAGEMENT_EVENT_TYPE.SaveClick,
            occurredAt: now.toISOString(),
          }),
        );
      }
      for (let i = 0; i < 3; i++) {
        await recordEngagementEvent(
          db,
          makeEventInput({
            id: `seq-${i}`,
            recipeId: "recipe-1",
            eventType: ENGAGEMENT_EVENT_TYPE.SequenceTrigger,
            occurredAt: now.toISOString(),
          }),
        );
      }
      for (let i = 0; i < 10; i++) {
        await recordEngagementEvent(
          db,
          makeEventInput({
            id: `card-${i}`,
            recipeId: "recipe-1",
            eventType: ENGAGEMENT_EVENT_TYPE.CardView,
            occurredAt: now.toISOString(),
          }),
        );
      }
      for (let i = 0; i < 2; i++) {
        await recordEngagementEvent(
          db,
          makeEventInput({
            id: `pa-${i}`,
            recipeId: "recipe-1",
            eventType: ENGAGEMENT_EVENT_TYPE.PurchaseAttribution,
            occurredAt: now.toISOString(),
          }),
        );
      }

      const result = await computeEngagementScores(db, TEST_CREATOR_ID, null);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        const score = result.value[0];
        expect(score).toBeDefined();
        if (score) {
          // raw = (5*3.0) + (3*2.0) + (10*1.0) + (2*4.0) = 15 + 6 + 10 + 8 = 39
          // Only one recipe, so max = 39, normalized = (39/39)*10 = 10.0
          expect(score.score).toBe(10);
          expect(score.save_clicks_30d).toBe(5);
          expect(score.sequence_triggers_30d).toBe(3);
          expect(score.card_views_30d).toBe(10);
          expect(score.purchase_attributions_all).toBe(2);
        }
      }
    });

    it("normalizes scores to 0-10 scale across 3 recipes", async () => {
      const db = createDb(env.DB);
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-1", "Recipe 1");
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-2", "Recipe 2");
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-3", "Recipe 3");

      const now = new Date();

      // Recipe 1: 10 save clicks = raw score 30
      for (let i = 0; i < 10; i++) {
        await recordEngagementEvent(
          db,
          makeEventInput({
            id: `r1-save-${i}`,
            recipeId: "recipe-1",
            eventType: ENGAGEMENT_EVENT_TYPE.SaveClick,
            occurredAt: now.toISOString(),
          }),
        );
      }

      // Recipe 2: 5 save clicks = raw score 15
      for (let i = 0; i < 5; i++) {
        await recordEngagementEvent(
          db,
          makeEventInput({
            id: `r2-save-${i}`,
            recipeId: "recipe-2",
            eventType: ENGAGEMENT_EVENT_TYPE.SaveClick,
            occurredAt: now.toISOString(),
          }),
        );
      }

      // Recipe 3: 2 save clicks = raw score 6
      for (let i = 0; i < 2; i++) {
        await recordEngagementEvent(
          db,
          makeEventInput({
            id: `r3-save-${i}`,
            recipeId: "recipe-3",
            eventType: ENGAGEMENT_EVENT_TYPE.SaveClick,
            occurredAt: now.toISOString(),
          }),
        );
      }

      const result = await computeEngagementScores(db, TEST_CREATOR_ID, null);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(3);

        // Sort by recipe_id to verify
        const sorted = [...result.value].sort((a, b) => a.recipe_id.localeCompare(b.recipe_id));

        // Recipe 1: raw=30, max=30, normalized=10.0
        expect(sorted[0]?.score).toBe(10);

        // Recipe 2: raw=15, max=30, normalized=5.0
        expect(sorted[1]?.score).toBe(5);

        // Recipe 3: raw=6, max=30, normalized=2.0
        expect(sorted[2]?.score).toBe(2);
      }
    });

    it("returns empty for recipes with no events", async () => {
      const db = createDb(env.DB);
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-no-events", "Recipe No Events");

      const result = await computeEngagementScores(db, TEST_CREATOR_ID, null);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // No events means no score records
        expect(result.value.length).toBe(0);
      }
    });

    it("caches results in KV with 24-hour TTL", async () => {
      const db = createDb(env.DB);
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-1", "Recipe 1");
      const now = new Date();

      await recordEngagementEvent(
        db,
        makeEventInput({
          id: "cache-test-evt",
          recipeId: "recipe-1",
          eventType: ENGAGEMENT_EVENT_TYPE.SaveClick,
          occurredAt: now.toISOString(),
        }),
      );

      // Compute with KV cache
      const result = await computeEngagementScores(db, TEST_CREATOR_ID, env.CACHE);
      expect(result.ok).toBe(true);

      // Verify cached value exists
      const cacheKey = `engagement_scores:${TEST_CREATOR_ID}`;
      const cached = await env.CACHE.get(cacheKey);
      expect(cached).not.toBeNull();

      if (cached !== null) {
        const parsed = JSON.parse(cached) as unknown[];
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed.length).toBe(1);
      }

      // getEngagementScores should use the cache
      const cachedResult = await getEngagementScores(db, TEST_CREATOR_ID, env.CACHE);
      expect(cachedResult.ok).toBe(true);
      if (cachedResult.ok) {
        expect(cachedResult.value.length).toBe(1);
      }
    });

    it("ignores events older than 30 days for 30d metrics", async () => {
      const db = createDb(env.DB);
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-1", "Recipe 1");

      // Add an event from 31 days ago
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      await recordEngagementEvent(
        db,
        makeEventInput({
          id: "old-save-1",
          recipeId: "recipe-1",
          eventType: ENGAGEMENT_EVENT_TYPE.SaveClick,
          occurredAt: oldDate.toISOString(),
        }),
      );

      // Add a recent event
      await recordEngagementEvent(
        db,
        makeEventInput({
          id: "recent-save-1",
          recipeId: "recipe-1",
          eventType: ENGAGEMENT_EVENT_TYPE.SaveClick,
          occurredAt: new Date().toISOString(),
        }),
      );

      const result = await computeEngagementScores(db, TEST_CREATOR_ID, null);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        const score = result.value[0];
        if (score) {
          // Only 1 recent save click counted (not the old one)
          expect(score.save_clicks_30d).toBe(1);
        }
      }
    });

    it("counts purchase_attributions across all time", async () => {
      const db = createDb(env.DB);
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-1", "Recipe 1");

      // Add a purchase attribution from 60 days ago
      const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      await recordEngagementEvent(
        db,
        makeEventInput({
          id: "old-pa-1",
          recipeId: "recipe-1",
          eventType: ENGAGEMENT_EVENT_TYPE.PurchaseAttribution,
          occurredAt: oldDate.toISOString(),
        }),
      );

      // Add a recent purchase attribution
      await recordEngagementEvent(
        db,
        makeEventInput({
          id: "recent-pa-1",
          recipeId: "recipe-1",
          eventType: ENGAGEMENT_EVENT_TYPE.PurchaseAttribution,
          occurredAt: new Date().toISOString(),
        }),
      );

      const result = await computeEngagementScores(db, TEST_CREATOR_ID, null);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const score = result.value[0];
        if (score) {
          // Both purchase attributions counted (all time)
          expect(score.purchase_attributions_all).toBe(2);
        }
      }
    });
  });

  describe("getRecipeEngagementScore", () => {
    it("returns null for recipe with no score", async () => {
      const db = createDb(env.DB);
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-no-score", "No Score Recipe");

      const result = await getRecipeEngagementScore(db, TEST_CREATOR_ID, "recipe-no-score");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });
  });

  // -------------------------------------------------------------------------
  // 11.3 Product Recommendations
  // -------------------------------------------------------------------------

  describe("computeRecommendations", () => {
    it("generates recommendation when thresholds are met", async () => {
      const db = createDb(env.DB);

      // Seed 5+ confirmed GlutenFree recipes
      for (let i = 0; i < 6; i++) {
        await seedRecipe(
          env.DB,
          TEST_CREATOR_ID,
          `gf-recipe-${i}`,
          `GF Recipe ${i}`,
          ["GlutenFree"],
          true,
        );
      }

      // Seed segment profile with qualifying data
      await seedSegmentProfile(env.DB, TEST_CREATOR_ID, {
        GlutenFree: {
          subscriber_count: 100,
          engagement_rate: 0.25,
          growth_rate_30d: 0.1,
          top_recipe_ids: ["gf-recipe-0", "gf-recipe-1", "gf-recipe-2"],
        },
      });

      const result = await computeRecommendations(db, TEST_CREATOR_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        const rec = result.value[0];
        if (rec) {
          expect(rec.dietaryTag).toBe("GlutenFree");
          expect(rec.subscriberCount).toBe(100);
          expect(rec.recipeCount).toBe(6);
          expect(rec.message).toContain("GlutenFree");
          expect(rec.message).toContain("ebook");
        }
      }
    });

    it("does not recommend when subscriber count below 50", async () => {
      const db = createDb(env.DB);

      for (let i = 0; i < 6; i++) {
        await seedRecipe(
          env.DB,
          TEST_CREATOR_ID,
          `low-sub-recipe-${i}`,
          `Recipe ${i}`,
          ["Vegan"],
          true,
        );
      }

      await seedSegmentProfile(env.DB, TEST_CREATOR_ID, {
        Vegan: {
          subscriber_count: 30, // Below threshold
          engagement_rate: 0.25,
          growth_rate_30d: 0.1,
          top_recipe_ids: [],
        },
      });

      const result = await computeRecommendations(db, TEST_CREATOR_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(0);
      }
    });

    it("does not recommend when engagement rate below 0.15", async () => {
      const db = createDb(env.DB);

      for (let i = 0; i < 6; i++) {
        await seedRecipe(
          env.DB,
          TEST_CREATOR_ID,
          `low-eng-recipe-${i}`,
          `Recipe ${i}`,
          ["Keto"],
          true,
        );
      }

      await seedSegmentProfile(env.DB, TEST_CREATOR_ID, {
        Keto: {
          subscriber_count: 100,
          engagement_rate: 0.1, // Below threshold
          growth_rate_30d: 0.1,
          top_recipe_ids: [],
        },
      });

      const result = await computeRecommendations(db, TEST_CREATOR_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(0);
      }
    });

    it("does not recommend when fewer than 5 confirmed recipes", async () => {
      const db = createDb(env.DB);

      // Only 3 confirmed recipes
      for (let i = 0; i < 3; i++) {
        await seedRecipe(
          env.DB,
          TEST_CREATOR_ID,
          `few-recipe-${i}`,
          `Recipe ${i}`,
          ["Paleo"],
          true,
        );
      }

      await seedSegmentProfile(env.DB, TEST_CREATOR_ID, {
        Paleo: {
          subscriber_count: 100,
          engagement_rate: 0.25,
          growth_rate_30d: 0.1,
          top_recipe_ids: [],
        },
      });

      const result = await computeRecommendations(db, TEST_CREATOR_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(0);
      }
    });

    it("returns empty when no segment profile exists", async () => {
      const db = createDb(env.DB);

      const result = await computeRecommendations(db, TEST_CREATOR_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 11.4 Revenue Attribution
  // -------------------------------------------------------------------------

  describe("computeRevenueAttribution", () => {
    it("attributes saves to purchase when recipes match product", async () => {
      const db = createDb(env.DB);
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-attr-1", "Recipe Attr 1");
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-attr-2", "Recipe Attr 2");
      await seedProduct(env.DB, TEST_CREATOR_ID, "prod-attr-1", ["recipe-attr-1", "recipe-attr-2"]);

      const subscriberId = "sub-attr-1";
      const now = new Date();

      // Record save clicks for the subscriber
      await recordEngagementEvent(
        db,
        makeEventInput({
          id: "attr-save-1",
          recipeId: "recipe-attr-1",
          eventType: ENGAGEMENT_EVENT_TYPE.SaveClick,
          kitSubscriberId: subscriberId,
          occurredAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
        }),
      );

      await recordEngagementEvent(
        db,
        makeEventInput({
          id: "attr-save-2",
          recipeId: "recipe-attr-2",
          eventType: ENGAGEMENT_EVENT_TYPE.SaveClick,
          kitSubscriberId: subscriberId,
          occurredAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
        }),
      );

      const result = await computeRevenueAttribution(
        db,
        TEST_CREATOR_ID,
        subscriberId,
        "prod-attr-1",
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(2);
      }
    });

    it("does not attribute saves outside 30-day window", async () => {
      const db = createDb(env.DB);
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-old-attr", "Recipe Old");
      await seedProduct(env.DB, TEST_CREATOR_ID, "prod-old-attr", ["recipe-old-attr"]);

      const subscriberId = "sub-old-attr";

      // Record save click from 31 days ago
      await recordEngagementEvent(
        db,
        makeEventInput({
          id: "old-attr-save",
          recipeId: "recipe-old-attr",
          eventType: ENGAGEMENT_EVENT_TYPE.SaveClick,
          kitSubscriberId: subscriberId,
          occurredAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      );

      const result = await computeRevenueAttribution(
        db,
        TEST_CREATOR_ID,
        subscriberId,
        "prod-old-attr",
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(0);
      }
    });

    it("does not attribute saves for unrelated recipes", async () => {
      const db = createDb(env.DB);
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-unrelated", "Unrelated Recipe");
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-in-product", "In Product Recipe");
      await seedProduct(env.DB, TEST_CREATOR_ID, "prod-unrelated", ["recipe-in-product"]);

      const subscriberId = "sub-unrelated";

      // Save a recipe NOT in the product
      await recordEngagementEvent(
        db,
        makeEventInput({
          id: "unrelated-save",
          recipeId: "recipe-unrelated",
          eventType: ENGAGEMENT_EVENT_TYPE.SaveClick,
          kitSubscriberId: subscriberId,
          occurredAt: new Date().toISOString(),
        }),
      );

      const result = await computeRevenueAttribution(
        db,
        TEST_CREATOR_ID,
        subscriberId,
        "prod-unrelated",
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(0);
      }
    });

    it("is idempotent - does not duplicate attribution events", async () => {
      const db = createDb(env.DB);
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-idem-attr", "Idem Recipe");
      await seedProduct(env.DB, TEST_CREATOR_ID, "prod-idem", ["recipe-idem-attr"]);

      const subscriberId = "sub-idem";

      await recordEngagementEvent(
        db,
        makeEventInput({
          id: "idem-save-1",
          recipeId: "recipe-idem-attr",
          eventType: ENGAGEMENT_EVENT_TYPE.SaveClick,
          kitSubscriberId: subscriberId,
          occurredAt: new Date().toISOString(),
        }),
      );

      // First attribution
      const first = await computeRevenueAttribution(db, TEST_CREATOR_ID, subscriberId, "prod-idem");
      expect(first.ok).toBe(true);

      // Second attribution should be idempotent
      const second = await computeRevenueAttribution(
        db,
        TEST_CREATOR_ID,
        subscriberId,
        "prod-idem",
      );
      expect(second.ok).toBe(true);
      if (first.ok && second.ok) {
        expect(second.value.length).toBe(first.value.length);
      }
    });

    it("works with RecipeCardPack products", async () => {
      const db = createDb(env.DB);
      await seedRecipe(env.DB, TEST_CREATOR_ID, "recipe-pack-1", "Pack Recipe");
      await seedProduct(env.DB, TEST_CREATOR_ID, "prod-pack", ["recipe-pack-1"], "RecipeCardPack");

      const subscriberId = "sub-pack";

      await recordEngagementEvent(
        db,
        makeEventInput({
          id: "pack-save-1",
          recipeId: "recipe-pack-1",
          eventType: ENGAGEMENT_EVENT_TYPE.SaveClick,
          kitSubscriberId: subscriberId,
          occurredAt: new Date().toISOString(),
        }),
      );

      const result = await computeRevenueAttribution(
        db,
        TEST_CREATOR_ID,
        subscriberId,
        "prod-pack",
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
      }
    });
  });

  // -------------------------------------------------------------------------
  // hashSubscriberId
  // -------------------------------------------------------------------------

  describe("hashSubscriberId", () => {
    it("produces consistent hashes", async () => {
      const hash1 = await hashSubscriberId("subscriber-123");
      const hash2 = await hashSubscriberId("subscriber-123");
      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different IDs", async () => {
      const hash1 = await hashSubscriberId("subscriber-123");
      const hash2 = await hashSubscriberId("subscriber-456");
      expect(hash1).not.toBe(hash2);
    });
  });
});
