/**
 * Tests for the Automation Engine service (SPEC SS10).
 *
 * All Kit client calls are mocked. Tests run inside the Workers
 * runtime via @cloudflare/vitest-pool-workers.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { createDb } from "../../src/db/index.js";
import {
  handleSaveThisRecipe,
  createNewRecipeBroadcast,
  createLeadMagnetSequence,
  listSeasonalDrops,
  createSeasonalDrop,
  processSeasonalDrops,
} from "../../src/services/automation.js";
import type { KitClientConfig } from "../../src/lib/kit/client.js";
import type { CreatorId } from "../../src/types/auth.js";
import { createTestTables, cleanTestTables } from "../helpers/db-setup.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_CREATOR_ID = "creator-auto-1" as CreatorId;
const TEST_ACCESS_TOKEN = "test-access-token";

// ---------------------------------------------------------------------------
// Mock Kit client
// ---------------------------------------------------------------------------

/**
 * Build a mock fetch function that responds to Kit API endpoints.
 * Tracks calls for assertion.
 */
function createMockFetch() {
  const calls: { url: string; method: string; body: unknown }[] = [];
  let tagIdCounter = 100;
  let broadcastIdCounter = 500;

  const mockFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    const bodyText = typeof init?.body === "string" ? init.body : null;
    const parsedBody = bodyText ? JSON.parse(bodyText) : null;

    calls.push({ url, method, body: parsedBody });

    // Tag creation / get-or-create
    if (url.includes("/tags") && method === "POST" && !url.includes("/subscribers/")) {
      tagIdCounter += 1;
      return new Response(
        JSON.stringify({
          tag: {
            id: tagIdCounter,
            name: parsedBody?.name ?? "test-tag",
            created_at: "2026-01-01T00:00:00Z",
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }

    // Tag subscriber
    if (url.includes("/tags/") && url.includes("/subscribers/") && method === "POST") {
      return new Response(
        JSON.stringify({
          subscriber: {
            id: 1,
            first_name: "Test",
            email_address: "test@example.com",
            state: "active",
            created_at: "2026-01-01T00:00:00Z",
            fields: {},
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Update subscriber
    if (url.includes("/subscribers/") && method === "PUT") {
      return new Response(
        JSON.stringify({
          subscriber: {
            id: 1,
            first_name: "Test",
            email_address: "test@example.com",
            state: "active",
            created_at: "2026-01-01T00:00:00Z",
            fields: parsedBody?.fields ?? {},
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Add subscriber to sequence
    if (url.includes("/sequences/") && url.includes("/subscribers/") && method === "POST") {
      return new Response(
        JSON.stringify({
          subscriber: {
            id: 1,
            first_name: "Test",
            email_address: "test@example.com",
            state: "active",
            created_at: "2026-01-01T00:00:00Z",
            fields: {},
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Create broadcast draft
    if (url.includes("/broadcasts") && method === "POST") {
      broadcastIdCounter += 1;
      return new Response(
        JSON.stringify({
          broadcast: {
            id: broadcastIdCounter,
            created_at: "2026-01-01T00:00:00Z",
            subject: parsedBody?.subject ?? "Test Subject",
            preview_text: null,
            description: parsedBody?.description ?? null,
            content: parsedBody?.content ?? null,
            public: false,
            published_at: null,
            send_at: null,
            thumbnail_alt: null,
            thumbnail_url: null,
            email_address: null,
            email_template: null,
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }

    // Default fallback
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  });

  return { fetchFn: mockFn as unknown as typeof globalThis.fetch, calls };
}

function createKitConfig(fetchFn: typeof globalThis.fetch): KitClientConfig {
  return { fetchFn };
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function insertCreator(
  d1: D1Database,
  id: string,
  tier: string = "Free",
): Promise<void> {
  const now = new Date().toISOString();
  await d1.exec(
    `INSERT INTO creators (id, email, name, password_hash, subscription_tier, subscription_started_at, created_at, updated_at) VALUES ('${id}', '${id}@example.com', 'Test Creator', 'hash', '${tier}', '${now}', '${now}', '${now}')`,
  );
}

async function insertRecipe(
  d1: D1Database,
  id: string,
  creatorId: string,
  slug: string,
  title: string,
  options: {
    emailReady?: boolean;
    dietaryTags?: readonly string[];
    dietaryTagsConfirmed?: boolean;
    sourceData?: string;
  } = {},
): Promise<void> {
  const now = new Date().toISOString();
  const emailReady = options.emailReady ? 1 : 0;
  const tags = JSON.stringify(options.dietaryTags ?? []);
  const confirmed = options.dietaryTagsConfirmed ? 1 : 0;
  const sourceData = options.sourceData ?? '{"type":"Manual"}';
  await d1.exec(
    `INSERT INTO recipes (id, creator_id, title, slug, source_type, source_data, status, email_ready, dietary_tags, dietary_tags_confirmed, meal_types, seasons, created_at, updated_at) VALUES ('${id}', '${creatorId}', '${title}', '${slug}', 'Manual', '${sourceData}', 'Active', ${emailReady}, '${tags}', ${confirmed}, '[]', '[]', '${now}', '${now}')`,
  );
}

async function insertCollection(
  d1: D1Database,
  id: string,
  creatorId: string,
  name: string,
): Promise<void> {
  const now = new Date().toISOString();
  await d1.exec(
    `INSERT INTO collections (id, creator_id, name, created_at, updated_at) VALUES ('${id}', '${creatorId}', '${name}', '${now}', '${now}')`,
  );
}

async function insertCollectionRecipe(
  d1: D1Database,
  collectionId: string,
  recipeId: string,
  sortOrder: number = 0,
): Promise<void> {
  await d1.exec(
    `INSERT INTO collection_recipes (collection_id, recipe_id, sort_order) VALUES ('${collectionId}', '${recipeId}', ${sortOrder})`,
  );
}

async function insertProduct(
  d1: D1Database,
  id: string,
  creatorId: string,
  title: string,
  options: {
    status?: string;
    kitSequenceId?: string | null;
  } = {},
): Promise<void> {
  const now = new Date().toISOString();
  const status = options.status ?? "Draft";
  const seqId = options.kitSequenceId ?? null;
  const seqIdSql = seqId ? `'${seqId}'` : "NULL";
  await d1.exec(
    `INSERT INTO product_base (id, creator_id, product_type, status, title, description, brand_kit_id, template_id, kit_sequence_id, currency, created_at, updated_at) VALUES ('${id}', '${creatorId}', 'Ebook', '${status}', '${title}', NULL, 'brand-1', 'template-1', ${seqIdSql}, 'USD', '${now}', '${now}')`,
  );
}

async function insertAutomationConfig(
  d1: D1Database,
  creatorId: string,
  sequenceId: string | null,
  sendsThisMonth: number = 0,
): Promise<void> {
  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const seqIdSql = sequenceId ? `'${sequenceId}'` : "NULL";
  await d1.exec(
    `INSERT INTO automation_configs (creator_id, save_recipe_sequence_id, sends_this_month, sends_month_reset_at, created_at, updated_at) VALUES ('${creatorId}', ${seqIdSql}, ${sendsThisMonth}, '${currentMonth}', '${now.toISOString()}', '${now.toISOString()}')`,
  );
}

async function insertEngagementScore(
  d1: D1Database,
  recipeId: string,
  creatorId: string,
  score: number,
): Promise<void> {
  const now = new Date().toISOString();
  await d1.exec(
    `INSERT INTO recipe_engagement_scores (recipe_id, creator_id, score, computed_at, save_clicks_30d, sequence_triggers_30d, card_views_30d, purchase_attributions_all) VALUES ('${recipeId}', '${creatorId}', ${score}, '${now}', 10, 5, 20, 2)`,
  );
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await createTestTables(env.DB);
  await cleanTestTables(env.DB);
});

// ---------------------------------------------------------------------------
// SS10.1 Save This Recipe
// ---------------------------------------------------------------------------

describe("handleSaveThisRecipe", () => {
  it("should tag subscriber and update custom fields even without sequence", async () => {
    await insertCreator(env.DB, TEST_CREATOR_ID);
    await insertRecipe(env.DB, "recipe-1", TEST_CREATOR_ID, "lemon-pasta", "Lemon Pasta");

    const { fetchFn, calls } = createMockFetch();
    const kitConfig = createKitConfig(fetchFn);
    const db = createDb(env.DB);

    const result = await handleSaveThisRecipe(
      db,
      TEST_CREATOR_ID,
      "lemon-pasta",
      "sub-123",
      TEST_ACCESS_TOKEN,
      kitConfig,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.sequenceEnrolled).toBe(false);
    expect(result.value.sequenceId).toBe(null);
    expect(result.value.tagsApplied).toContain("recipe:saved:lemon-pasta");
    expect(result.value.customFieldsUpdated).toBe(true);

    // Should have called: create tag, tag subscriber, update subscriber
    const tagCreateCalls = calls.filter(
      (c) => c.url.includes("/tags") && c.method === "POST" && !c.url.includes("/subscribers/"),
    );
    expect(tagCreateCalls.length).toBeGreaterThanOrEqual(1);

    const updateCalls = calls.filter(
      (c) => c.url.includes("/subscribers/") && c.method === "PUT",
    );
    expect(updateCalls.length).toBe(1);
  });

  it("should enroll subscriber in sequence when configured", async () => {
    await insertCreator(env.DB, TEST_CREATOR_ID);
    await insertRecipe(env.DB, "recipe-2", TEST_CREATOR_ID, "chocolate-cake", "Chocolate Cake");
    await insertAutomationConfig(env.DB, TEST_CREATOR_ID, "seq-default-1");

    const { fetchFn, calls } = createMockFetch();
    const kitConfig = createKitConfig(fetchFn);
    const db = createDb(env.DB);

    const result = await handleSaveThisRecipe(
      db,
      TEST_CREATOR_ID,
      "chocolate-cake",
      "sub-456",
      TEST_ACCESS_TOKEN,
      kitConfig,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.sequenceEnrolled).toBe(true);
    expect(result.value.sequenceId).toBe("seq-default-1");

    // Should have called addSubscriberToSequence
    const seqCalls = calls.filter(
      (c) => c.url.includes("/sequences/") && c.url.includes("/subscribers/"),
    );
    expect(seqCalls.length).toBe(1);
  });

  it("should skip enrollment for duplicate (idempotent tags)", async () => {
    // The Kit API handles idempotent tagging, so calling twice should not error
    await insertCreator(env.DB, TEST_CREATOR_ID);
    await insertRecipe(env.DB, "recipe-3", TEST_CREATOR_ID, "avocado-toast", "Avocado Toast");
    await insertAutomationConfig(env.DB, TEST_CREATOR_ID, "seq-default-1");

    const { fetchFn } = createMockFetch();
    const kitConfig = createKitConfig(fetchFn);
    const db = createDb(env.DB);

    // First call
    const result1 = await handleSaveThisRecipe(
      db,
      TEST_CREATOR_ID,
      "avocado-toast",
      "sub-789",
      TEST_ACCESS_TOKEN,
      kitConfig,
    );
    expect(result1.ok).toBe(true);

    // Second call (same subscriber, same recipe) -- should succeed
    const result2 = await handleSaveThisRecipe(
      db,
      TEST_CREATOR_ID,
      "avocado-toast",
      "sub-789",
      TEST_ACCESS_TOKEN,
      kitConfig,
    );
    expect(result2.ok).toBe(true);
  });

  it("should route to product nurture sequence when collection has published product", async () => {
    await insertCreator(env.DB, TEST_CREATOR_ID);
    await insertRecipe(env.DB, "recipe-4", TEST_CREATOR_ID, "veggie-soup", "Veggie Soup");
    await insertCollection(env.DB, "col-1", TEST_CREATOR_ID, "Winter Soups");
    await insertCollectionRecipe(env.DB, "col-1", "recipe-4");
    await insertProduct(env.DB, "prod-1", TEST_CREATOR_ID, "Winter Cookbook", {
      status: "Published",
      kitSequenceId: "seq-nurture-1",
    });
    await insertAutomationConfig(env.DB, TEST_CREATOR_ID, "seq-default-1");

    const { fetchFn } = createMockFetch();
    const kitConfig = createKitConfig(fetchFn);
    const db = createDb(env.DB);

    const result = await handleSaveThisRecipe(
      db,
      TEST_CREATOR_ID,
      "veggie-soup",
      "sub-999",
      TEST_ACCESS_TOKEN,
      kitConfig,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.sequenceEnrolled).toBe(true);
    // Should use the product's nurture sequence
    expect(result.value.sequenceId).toBe("seq-nurture-1");
  });

  it("should apply confirmed dietary tags to subscriber", async () => {
    await insertCreator(env.DB, TEST_CREATOR_ID);
    await insertRecipe(env.DB, "recipe-5", TEST_CREATOR_ID, "gf-bread", "GF Bread", {
      dietaryTags: ["GlutenFree", "DairyFree"],
      dietaryTagsConfirmed: true,
    });

    const { fetchFn, calls } = createMockFetch();
    const kitConfig = createKitConfig(fetchFn);
    const db = createDb(env.DB);

    const result = await handleSaveThisRecipe(
      db,
      TEST_CREATOR_ID,
      "gf-bread",
      "sub-111",
      TEST_ACCESS_TOKEN,
      kitConfig,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Should include dietary tags
    expect(result.value.tagsApplied).toContain("recipe:saved:gf-bread");
    expect(result.value.tagsApplied).toContain("dietary:gluten-free");
    expect(result.value.tagsApplied).toContain("dietary:dairy-free");
  });

  it("should return not_found for nonexistent recipe", async () => {
    await insertCreator(env.DB, TEST_CREATOR_ID);

    const { fetchFn } = createMockFetch();
    const kitConfig = createKitConfig(fetchFn);
    const db = createDb(env.DB);

    const result = await handleSaveThisRecipe(
      db,
      TEST_CREATOR_ID,
      "nonexistent",
      "sub-000",
      TEST_ACCESS_TOKEN,
      kitConfig,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("not_found");
  });
});

// ---------------------------------------------------------------------------
// SS10.2 New Recipe Broadcast Draft
// ---------------------------------------------------------------------------

describe("createNewRecipeBroadcast", () => {
  it("should create broadcast draft with correct subject and content", async () => {
    await insertCreator(env.DB, TEST_CREATOR_ID);
    await insertRecipe(env.DB, "recipe-b1", TEST_CREATOR_ID, "pasta-salad", "Pasta Salad", {
      emailReady: true,
    });

    const { fetchFn, calls } = createMockFetch();
    const kitConfig = createKitConfig(fetchFn);
    const db = createDb(env.DB);

    const result = await createNewRecipeBroadcast(
      db,
      TEST_CREATOR_ID,
      "recipe-b1",
      TEST_ACCESS_TOKEN,
      kitConfig,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.broadcastId).toBeDefined();
    expect(result.value.subject).toContain("Pasta Salad");
    expect(result.value.subject).toContain("a new recipe for you");

    // Check the broadcast creation call
    const broadcastCalls = calls.filter(
      (c) => c.url.includes("/broadcasts") && c.method === "POST",
    );
    expect(broadcastCalls.length).toBe(1);

    const broadcastBody = broadcastCalls[0]?.body as Record<string, unknown>;
    expect(broadcastBody["subject"]).toContain("Pasta Salad");
    expect(broadcastBody["description"]).toContain("[PRODUCT] auto-draft");
    expect(broadcastBody["send_at"]).toBeUndefined(); // Draft only -- send_at:null not sent in body
  });

  it("should return not_found for nonexistent recipe", async () => {
    await insertCreator(env.DB, TEST_CREATOR_ID);

    const { fetchFn } = createMockFetch();
    const kitConfig = createKitConfig(fetchFn);
    const db = createDb(env.DB);

    const result = await createNewRecipeBroadcast(
      db,
      TEST_CREATOR_ID,
      "nonexistent-recipe",
      TEST_ACCESS_TOKEN,
      kitConfig,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("not_found");
  });

  it("should enforce free tier 3 sends/month limit", async () => {
    await insertCreator(env.DB, TEST_CREATOR_ID, "Free");
    await insertRecipe(env.DB, "recipe-b2", TEST_CREATOR_ID, "recipe-limit", "Recipe Limit");
    // Set sends to 3 (the limit)
    await insertAutomationConfig(env.DB, TEST_CREATOR_ID, null, 3);

    const { fetchFn } = createMockFetch();
    const kitConfig = createKitConfig(fetchFn);
    const db = createDb(env.DB);

    const result = await createNewRecipeBroadcast(
      db,
      TEST_CREATOR_ID,
      "recipe-b2",
      TEST_ACCESS_TOKEN,
      kitConfig,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("free_tier_limit");
  });

  it("should allow unlimited sends for paid tier", async () => {
    const paidCreatorId = "creator-paid-1";
    await insertCreator(env.DB, paidCreatorId, "Creator");
    await insertRecipe(env.DB, "recipe-b3", paidCreatorId, "paid-recipe", "Paid Recipe");

    const { fetchFn } = createMockFetch();
    const kitConfig = createKitConfig(fetchFn);
    const db = createDb(env.DB);

    const result = await createNewRecipeBroadcast(
      db,
      paidCreatorId,
      "recipe-b3",
      TEST_ACCESS_TOKEN,
      kitConfig,
    );

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SS10.3 Lead Magnet Delivery Sequence
// ---------------------------------------------------------------------------

describe("createLeadMagnetSequence", () => {
  it("should create 4 email drafts for lead magnet sequence", async () => {
    await insertCreator(env.DB, TEST_CREATOR_ID);
    await insertProduct(env.DB, "prod-lm-1", TEST_CREATOR_ID, "Free Recipe Pack");

    const { fetchFn, calls } = createMockFetch();
    const kitConfig = createKitConfig(fetchFn);
    const db = createDb(env.DB);

    const result = await createLeadMagnetSequence(
      db,
      TEST_CREATOR_ID,
      "prod-lm-1",
      TEST_ACCESS_TOKEN,
      kitConfig,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.emailCount).toBe(4);
    expect(result.value.sequenceId).toContain("lead-magnet-seq-");

    // Should have created 4 broadcast drafts
    const broadcastCalls = calls.filter(
      (c) => c.url.includes("/broadcasts") && c.method === "POST",
    );
    expect(broadcastCalls.length).toBe(4);

    // Check the subjects of each email
    const subjects = broadcastCalls.map(
      (c) => (c.body as Record<string, unknown>)["subject"] as string,
    );
    expect(subjects[0]).toContain("Free Recipe Pack");
    expect(subjects[1]).toContain("tips");
    expect(subjects[2]).toContain("recipe");
    expect(subjects[3]).toContain("full");
  });

  it("should store sequence ID on product record", async () => {
    await insertCreator(env.DB, TEST_CREATOR_ID);
    await insertProduct(env.DB, "prod-lm-2", TEST_CREATOR_ID, "Another Pack");

    const { fetchFn } = createMockFetch();
    const kitConfig = createKitConfig(fetchFn);
    const db = createDb(env.DB);

    const result = await createLeadMagnetSequence(
      db,
      TEST_CREATOR_ID,
      "prod-lm-2",
      TEST_ACCESS_TOKEN,
      kitConfig,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Verify the product was updated with the sequence ID
    const productRows = await env.DB.prepare(
      "SELECT kit_sequence_id FROM product_base WHERE id = ?",
    )
      .bind("prod-lm-2")
      .all();

    const row = productRows.results[0] as Record<string, unknown> | undefined;
    expect(row).toBeDefined();
    expect(row?.["kit_sequence_id"]).toBe(result.value.sequenceId);
  });

  it("should return not_found for nonexistent product", async () => {
    await insertCreator(env.DB, TEST_CREATOR_ID);

    const { fetchFn } = createMockFetch();
    const kitConfig = createKitConfig(fetchFn);
    const db = createDb(env.DB);

    const result = await createLeadMagnetSequence(
      db,
      TEST_CREATOR_ID,
      "nonexistent-product",
      TEST_ACCESS_TOKEN,
      kitConfig,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("not_found");
  });
});

// ---------------------------------------------------------------------------
// SS10.4 Seasonal Recipe Drops
// ---------------------------------------------------------------------------

describe("Seasonal Drops", () => {
  describe("listSeasonalDrops", () => {
    it("should return empty list when no drops configured", async () => {
      await insertCreator(env.DB, TEST_CREATOR_ID);

      const db = createDb(env.DB);
      const result = await listSeasonalDrops(db, TEST_CREATOR_ID);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(0);
    });

    it("should return configured drops", async () => {
      await insertCreator(env.DB, TEST_CREATOR_ID);
      await insertCollection(env.DB, "col-sd-1", TEST_CREATOR_ID, "Holiday Baking");

      const db = createDb(env.DB);
      await createSeasonalDrop(db, TEST_CREATOR_ID, {
        id: "sd-1",
        label: "Holiday Baking",
        startDate: "2026-12-01",
        endDate: "2026-12-31",
        collectionId: "col-sd-1",
        targetSegment: null,
        recurrence: "Annual",
      });

      const result = await listSeasonalDrops(db, TEST_CREATOR_ID);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.label).toBe("Holiday Baking");
    });
  });

  describe("createSeasonalDrop", () => {
    it("should create a seasonal drop configuration", async () => {
      await insertCreator(env.DB, TEST_CREATOR_ID);
      await insertCollection(env.DB, "col-sd-2", TEST_CREATOR_ID, "Summer Grilling");

      const db = createDb(env.DB);
      const result = await createSeasonalDrop(db, TEST_CREATOR_ID, {
        id: "sd-2",
        label: "Summer Grilling",
        startDate: "2026-06-01",
        endDate: "2026-08-31",
        collectionId: "col-sd-2",
        targetSegment: "GlutenFree",
        recurrence: "Annual",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.label).toBe("Summer Grilling");
      expect(result.value.target_segment).toBe("GlutenFree");
      expect(result.value.start_date).toBe("2026-06-01");
    });

    it("should reject empty label", async () => {
      await insertCreator(env.DB, TEST_CREATOR_ID);
      await insertCollection(env.DB, "col-sd-3", TEST_CREATOR_ID, "Test Col");

      const db = createDb(env.DB);
      const result = await createSeasonalDrop(db, TEST_CREATOR_ID, {
        id: "sd-3",
        label: "",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        collectionId: "col-sd-3",
        targetSegment: null,
        recurrence: "None",
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("invalid_input");
    });

    it("should reject nonexistent collection", async () => {
      await insertCreator(env.DB, TEST_CREATOR_ID);

      const db = createDb(env.DB);
      const result = await createSeasonalDrop(db, TEST_CREATOR_ID, {
        id: "sd-4",
        label: "Bad Drop",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        collectionId: "nonexistent-col",
        targetSegment: null,
        recurrence: "None",
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not_found");
    });
  });

  describe("processSeasonalDrops", () => {
    it("should create broadcast for drop whose start date has arrived", async () => {
      await insertCreator(env.DB, TEST_CREATOR_ID);
      await insertCollection(env.DB, "col-sd-p1", TEST_CREATOR_ID, "Active Collection");
      await insertRecipe(env.DB, "recipe-sd-1", TEST_CREATOR_ID, "holiday-cookie", "Holiday Cookie");
      await insertCollectionRecipe(env.DB, "col-sd-p1", "recipe-sd-1");

      // Create a drop that starts today (or in the past)
      const today = new Date().toISOString().split("T")[0] ?? "2026-03-16";
      const futureDate = "2026-12-31";

      const db = createDb(env.DB);
      await createSeasonalDrop(db, TEST_CREATOR_ID, {
        id: "sd-process-1",
        label: "Active Drop",
        startDate: today,
        endDate: futureDate,
        collectionId: "col-sd-p1",
        targetSegment: null,
        recurrence: "None",
      });

      const { fetchFn, calls } = createMockFetch();
      const kitConfig = createKitConfig(fetchFn);

      const result = await processSeasonalDrops(
        db,
        TEST_CREATOR_ID,
        TEST_ACCESS_TOKEN,
        kitConfig,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.dropsProcessed).toBe(1);
      expect(result.value.broadcastsCreated).toHaveLength(1);
      expect(result.value.broadcastsCreated[0]?.subject).toContain("Holiday Cookie");

      // Should have created a broadcast
      const broadcastCalls = calls.filter(
        (c) => c.url.includes("/broadcasts") && c.method === "POST",
      );
      expect(broadcastCalls.length).toBe(1);
    });

    it("should select recipe by highest engagement score", async () => {
      await insertCreator(env.DB, TEST_CREATOR_ID);
      await insertCollection(env.DB, "col-sd-p2", TEST_CREATOR_ID, "Scored Collection");
      await insertRecipe(env.DB, "recipe-low", TEST_CREATOR_ID, "low-score", "Low Score Recipe");
      await insertRecipe(env.DB, "recipe-high", TEST_CREATOR_ID, "high-score", "High Score Recipe");
      await insertCollectionRecipe(env.DB, "col-sd-p2", "recipe-low");
      await insertCollectionRecipe(env.DB, "col-sd-p2", "recipe-high", 1);
      await insertEngagementScore(env.DB, "recipe-low", TEST_CREATOR_ID, 3.0);
      await insertEngagementScore(env.DB, "recipe-high", TEST_CREATOR_ID, 9.5);

      const today = new Date().toISOString().split("T")[0] ?? "2026-03-16";

      const db = createDb(env.DB);
      await createSeasonalDrop(db, TEST_CREATOR_ID, {
        id: "sd-scored-1",
        label: "Scored Drop",
        startDate: today,
        endDate: "2026-12-31",
        collectionId: "col-sd-p2",
        targetSegment: null,
        recurrence: "None",
      });

      const { fetchFn, calls } = createMockFetch();
      const kitConfig = createKitConfig(fetchFn);

      const result = await processSeasonalDrops(
        db,
        TEST_CREATOR_ID,
        TEST_ACCESS_TOKEN,
        kitConfig,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Should have selected the high-score recipe
      expect(result.value.broadcastsCreated[0]?.subject).toContain("High Score Recipe");
    });

    it("should not process future drops", async () => {
      await insertCreator(env.DB, TEST_CREATOR_ID);
      await insertCollection(env.DB, "col-sd-f1", TEST_CREATOR_ID, "Future Collection");
      await insertRecipe(env.DB, "recipe-future", TEST_CREATOR_ID, "future-recipe", "Future Recipe");
      await insertCollectionRecipe(env.DB, "col-sd-f1", "recipe-future");

      const db = createDb(env.DB);
      await createSeasonalDrop(db, TEST_CREATOR_ID, {
        id: "sd-future-1",
        label: "Future Drop",
        startDate: "2027-01-01",
        endDate: "2027-12-31",
        collectionId: "col-sd-f1",
        targetSegment: null,
        recurrence: "None",
      });

      const { fetchFn } = createMockFetch();
      const kitConfig = createKitConfig(fetchFn);

      const result = await processSeasonalDrops(
        db,
        TEST_CREATOR_ID,
        TEST_ACCESS_TOKEN,
        kitConfig,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.dropsProcessed).toBe(0);
      expect(result.value.broadcastsCreated).toHaveLength(0);
    });

    it("should enforce free tier send limit during processing", async () => {
      await insertCreator(env.DB, TEST_CREATOR_ID, "Free");
      await insertCollection(env.DB, "col-sd-limit", TEST_CREATOR_ID, "Limit Collection");
      await insertRecipe(env.DB, "recipe-limit-sd", TEST_CREATOR_ID, "limit-recipe", "Limit Recipe");
      await insertCollectionRecipe(env.DB, "col-sd-limit", "recipe-limit-sd");

      // Set sends to 3 (the limit)
      await insertAutomationConfig(env.DB, TEST_CREATOR_ID, null, 3);

      const today = new Date().toISOString().split("T")[0] ?? "2026-03-16";
      const db = createDb(env.DB);
      await createSeasonalDrop(db, TEST_CREATOR_ID, {
        id: "sd-limit-1",
        label: "Limit Drop",
        startDate: today,
        endDate: "2026-12-31",
        collectionId: "col-sd-limit",
        targetSegment: null,
        recurrence: "None",
      });

      const { fetchFn } = createMockFetch();
      const kitConfig = createKitConfig(fetchFn);

      const result = await processSeasonalDrops(
        db,
        TEST_CREATOR_ID,
        TEST_ACCESS_TOKEN,
        kitConfig,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("free_tier_limit");
    });
  });
});

// ---------------------------------------------------------------------------
// Custom field updates
// ---------------------------------------------------------------------------

describe("Custom field updates", () => {
  it("should update last_recipe_saved and last_recipe_saved_at fields", async () => {
    await insertCreator(env.DB, TEST_CREATOR_ID);
    await insertRecipe(env.DB, "recipe-cf-1", TEST_CREATOR_ID, "field-recipe", "Field Recipe");

    const { fetchFn, calls } = createMockFetch();
    const kitConfig = createKitConfig(fetchFn);
    const db = createDb(env.DB);

    const result = await handleSaveThisRecipe(
      db,
      TEST_CREATOR_ID,
      "field-recipe",
      "sub-cf-1",
      TEST_ACCESS_TOKEN,
      kitConfig,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.customFieldsUpdated).toBe(true);

    // Check the update subscriber call contained the right fields
    const updateCalls = calls.filter(
      (c) => c.url.includes("/subscribers/") && c.method === "PUT",
    );
    expect(updateCalls.length).toBe(1);

    const updateBody = updateCalls[0]?.body as Record<string, unknown>;
    const fields = updateBody["fields"] as Record<string, string>;
    expect(fields["last_recipe_saved"]).toBe("Field Recipe");
    expect(fields["last_recipe_saved_at"]).toBeDefined();
  });
});
