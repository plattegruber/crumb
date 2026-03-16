/**
 * Tests for the Publishing Pipeline service (SPEC §12).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { createDb } from "../../src/db/index.js";
import { withCreatorScope } from "../../src/middleware/creator-scope.js";
import {
  publishToPlatform,
  getProductListings,
  packageForDownload,
  generateShareAssets,
  validatePlatform,
  createStanStoreAdapter,
  createGumroadAdapter,
  createLtkAdapter,
} from "../../src/services/publishing.js";
import type {
  PlatformAdapter,
  PlatformUploadResult,
  PublishError,
  StorageBucket,
  ProductBaseRow,
} from "../../src/services/publishing.js";
import type { CreatorId } from "../../src/types/auth.js";
import type { Result, PublishPlatform } from "@dough/shared";
import { ok, err, PUBLISH_PLATFORM } from "@dough/shared";
import { createTestTables, cleanTestTables } from "../helpers/db-setup.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CREATOR_ID = "creator-pub-1" as CreatorId;
const OTHER_CREATOR_ID = "creator-pub-2" as CreatorId;
const NOW_ISO = new Date().toISOString();
const BRAND_KIT_ID = "bk-1";

async function insertCreator(d1: D1Database, creatorId: string): Promise<void> {
  await d1.exec(
    `INSERT INTO creators (id, email, name, password_hash, subscription_tier, subscription_started_at, created_at, updated_at) VALUES ('${creatorId}', '${creatorId}@test.com', 'Test Creator', 'hash', 'Creator', '${NOW_ISO}', '${NOW_ISO}', '${NOW_ISO}')`,
  );
}

async function insertBrandKit(
  d1: D1Database,
  id: string,
  creatorId: string,
  overrides?: { primaryColor?: string; headingFont?: string; logoUrl?: string | null },
): Promise<void> {
  const primaryColor = overrides?.primaryColor ?? "#FF5733";
  const headingFont = overrides?.headingFont ?? "Playfair Display";
  const logoUrl = overrides?.logoUrl === undefined ? null : overrides.logoUrl;
  await d1.exec(
    `INSERT INTO brand_kits (id, creator_id, name, logo_url, primary_color, secondary_color, accent_color, heading_font_family, heading_font_fallback, body_font_family, body_font_fallback, created_at, updated_at) VALUES ('${id}', '${creatorId}', 'Test Brand Kit', ${logoUrl === null ? "NULL" : `'${logoUrl}'`}, '${primaryColor}', NULL, NULL, '${headingFont}', '["Georgia"]', 'Open Sans', '["Arial"]', '${NOW_ISO}', '${NOW_ISO}')`,
  );
}

async function insertProduct(
  d1: D1Database,
  id: string,
  creatorId: string,
  overrides?: {
    status?: string;
    pdfUrl?: string | null;
    productType?: string;
    title?: string;
    description?: string | null;
    suggestedPriceCents?: number | null;
  },
): Promise<void> {
  const status = overrides?.status ?? "Published";
  const pdfUrl =
    overrides?.pdfUrl === undefined ? "https://storage.example.com/test.pdf" : overrides.pdfUrl;
  const productType = overrides?.productType ?? "Ebook";
  const title = overrides?.title ?? "Test Product";
  const description =
    overrides?.description === undefined ? "A test product" : overrides.description;
  const priceCents =
    overrides?.suggestedPriceCents === undefined ? 1999 : overrides.suggestedPriceCents;
  await d1.exec(
    `INSERT INTO product_base (id, creator_id, product_type, status, title, description, brand_kit_id, template_id, pdf_url, epub_url, kit_form_id, kit_sequence_id, suggested_price_cents, currency, ai_copy_reviewed, created_at, updated_at) VALUES ('${id}', '${creatorId}', '${productType}', '${status}', '${title}', ${description === null ? "NULL" : `'${description}'`}, '${BRAND_KIT_ID}', 'template-1', ${pdfUrl === null ? "NULL" : `'${pdfUrl}'`}, NULL, NULL, NULL, ${priceCents === null ? "NULL" : String(priceCents)}, 'USD', 0, '${NOW_ISO}', '${NOW_ISO}')`,
  );
}

async function insertLeadMagnet(
  d1: D1Database,
  productId: string,
  parentProductId: string,
): Promise<void> {
  await d1.exec(
    `INSERT INTO lead_magnets (product_id, parent_product_id, recipe_ids) VALUES ('${productId}', '${parentProductId}', '[]')`,
  );
}

/**
 * Creates a mock PlatformAdapter for testing.
 */
function createMockAdapter(
  platform: PublishPlatform,
  result: Result<PlatformUploadResult, PublishError>,
): PlatformAdapter {
  return {
    platform,
    async uploadProduct(
      _product: ProductBaseRow,
      _pdfUrl: string,
    ): Promise<Result<PlatformUploadResult, PublishError>> {
      return result;
    },
  };
}

/**
 * Creates a mock StorageBucket for testing.
 */
function createMockStorage(files?: Record<string, string>): StorageBucket {
  const store = new Map<string, string>(Object.entries(files ?? {}));
  return {
    async get(key: string) {
      const content = store.get(key);
      if (content === undefined) return null;
      return {
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(content));
            controller.close();
          },
        }),
      };
    },
    async put(key: string, value: ReadableStream | ArrayBuffer | string) {
      if (typeof value === "string") {
        store.set(key, value);
      } else {
        store.set(key, "[binary data]");
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Publishing Pipeline Service", () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(async () => {
    await createTestTables(env.DB);
    await cleanTestTables(env.DB);
    db = createDb(env.DB);
    await insertCreator(env.DB, TEST_CREATOR_ID);
    await insertBrandKit(env.DB, BRAND_KIT_ID, TEST_CREATOR_ID);
  });

  // -------------------------------------------------------------------------
  // validatePlatform
  // -------------------------------------------------------------------------

  describe("validatePlatform", () => {
    it("accepts valid platforms", () => {
      expect(validatePlatform("StanStore").ok).toBe(true);
      expect(validatePlatform("Gumroad").ok).toBe(true);
      expect(validatePlatform("LTK").ok).toBe(true);
    });

    it("rejects invalid platform", () => {
      const result = validatePlatform("Shopify");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("invalid_platform");
    });
  });

  // -------------------------------------------------------------------------
  // publishToPlatform
  // -------------------------------------------------------------------------

  describe("publishToPlatform", () => {
    it("successfully publishes with mocked adapter", async () => {
      await insertProduct(env.DB, "prod-1", TEST_CREATOR_ID);
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const adapter = createMockAdapter(
        PUBLISH_PLATFORM.StanStore,
        ok({
          listing_url: "https://stan.store/product/123",
          platform_id: "ss-123",
        }),
      );

      const result = await publishToPlatform(
        scopedDb,
        "prod-1",
        PUBLISH_PLATFORM.StanStore,
        adapter,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.product_id).toBe("prod-1");
      expect(result.value.platform).toBe("StanStore");
      expect(result.value.listing_url).toBe("https://stan.store/product/123");
      expect(result.value.platform_id).toBe("ss-123");
      expect(result.value.published_at).toBeTruthy();
    });

    it("surfaces adapter error to caller", async () => {
      await insertProduct(env.DB, "prod-1", TEST_CREATOR_ID);
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const adapter = createMockAdapter(
        PUBLISH_PLATFORM.Gumroad,
        err({
          type: "platform_unavailable",
          platform: "Gumroad",
          message: "Gumroad API returned 503",
        }),
      );

      const result = await publishToPlatform(scopedDb, "prod-1", PUBLISH_PLATFORM.Gumroad, adapter);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("platform_unavailable");
      if (result.error.type !== "platform_unavailable") return;
      expect(result.error.platform).toBe("Gumroad");
    });

    it("stores PublishedListing with listing_url", async () => {
      await insertProduct(env.DB, "prod-1", TEST_CREATOR_ID);
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const adapter = createMockAdapter(
        PUBLISH_PLATFORM.LTK,
        ok({
          listing_url: "https://ltk.com/product/456",
          platform_id: "ltk-456",
        }),
      );

      await publishToPlatform(scopedDb, "prod-1", PUBLISH_PLATFORM.LTK, adapter);

      // Verify listing was stored
      const listingsResult = await getProductListings(scopedDb, "prod-1");
      expect(listingsResult.ok).toBe(true);
      if (!listingsResult.ok) return;
      expect(listingsResult.value).toHaveLength(1);
      expect(listingsResult.value[0]?.listing_url).toBe("https://ltk.com/product/456");
    });

    it("stores PublishedListing without listing_url when platform does not return one (§14.4)", async () => {
      await insertProduct(env.DB, "prod-1", TEST_CREATOR_ID);
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const adapter = createMockAdapter(
        PUBLISH_PLATFORM.StanStore,
        ok({
          listing_url: null,
          platform_id: "ss-789",
        }),
      );

      const result = await publishToPlatform(
        scopedDb,
        "prod-1",
        PUBLISH_PLATFORM.StanStore,
        adapter,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.listing_url).toBeNull();
      expect(result.value.platform_id).toBe("ss-789");
    });

    it("returns not_found for non-existent product", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const adapter = createMockAdapter(
        PUBLISH_PLATFORM.StanStore,
        ok({
          listing_url: null,
          platform_id: null,
        }),
      );

      const result = await publishToPlatform(
        scopedDb,
        "nonexistent",
        PUBLISH_PLATFORM.StanStore,
        adapter,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not_found");
    });

    it("rejects product not in Published status", async () => {
      await insertProduct(env.DB, "prod-draft", TEST_CREATOR_ID, { status: "Draft" });
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const adapter = createMockAdapter(
        PUBLISH_PLATFORM.StanStore,
        ok({
          listing_url: null,
          platform_id: null,
        }),
      );

      const result = await publishToPlatform(
        scopedDb,
        "prod-draft",
        PUBLISH_PLATFORM.StanStore,
        adapter,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not_published_status");
    });

    it("rejects product without pdf_url", async () => {
      await insertProduct(env.DB, "prod-nopdf", TEST_CREATOR_ID, {
        status: "Published",
        pdfUrl: null,
      });
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const adapter = createMockAdapter(
        PUBLISH_PLATFORM.StanStore,
        ok({
          listing_url: null,
          platform_id: null,
        }),
      );

      const result = await publishToPlatform(
        scopedDb,
        "prod-nopdf",
        PUBLISH_PLATFORM.StanStore,
        adapter,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("no_pdf");
    });

    it("isolates products by creator_id", async () => {
      await insertCreator(env.DB, OTHER_CREATOR_ID);
      await insertProduct(env.DB, "prod-other", OTHER_CREATOR_ID);
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const adapter = createMockAdapter(
        PUBLISH_PLATFORM.StanStore,
        ok({
          listing_url: null,
          platform_id: null,
        }),
      );

      const result = await publishToPlatform(
        scopedDb,
        "prod-other",
        PUBLISH_PLATFORM.StanStore,
        adapter,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not_found");
    });

    it("handles lead magnet URL update when parent product is published", async () => {
      // Create parent product
      await insertProduct(env.DB, "prod-parent", TEST_CREATOR_ID);
      // Create lead magnet product
      await insertProduct(env.DB, "prod-lm", TEST_CREATOR_ID, {
        productType: "LeadMagnet",
      });
      // Link them
      await insertLeadMagnet(env.DB, "prod-lm", "prod-parent");

      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const adapter = createMockAdapter(
        PUBLISH_PLATFORM.StanStore,
        ok({
          listing_url: "https://stan.store/product/parent-123",
          platform_id: "ss-parent-123",
        }),
      );

      const result = await publishToPlatform(
        scopedDb,
        "prod-parent",
        PUBLISH_PLATFORM.StanStore,
        adapter,
      );

      // Publishing should succeed
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.listing_url).toBe("https://stan.store/product/parent-123");

      // The listing should be stored for the parent product
      const listings = await getProductListings(scopedDb, "prod-parent");
      expect(listings.ok).toBe(true);
      if (!listings.ok) return;
      expect(listings.value).toHaveLength(1);
    });

    it("handles file_upload_rejected error (§14.4)", async () => {
      await insertProduct(env.DB, "prod-1", TEST_CREATOR_ID);
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const adapter = createMockAdapter(
        PUBLISH_PLATFORM.StanStore,
        err({
          type: "file_upload_rejected",
          platform: "StanStore",
          message: "File type not supported. Only PDF files are accepted.",
        }),
      );

      const result = await publishToPlatform(
        scopedDb,
        "prod-1",
        PUBLISH_PLATFORM.StanStore,
        adapter,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("file_upload_rejected");
      if (result.error.type !== "file_upload_rejected") return;
      expect(result.error.message).toBe("File type not supported. Only PDF files are accepted.");
    });
  });

  // -------------------------------------------------------------------------
  // getProductListings
  // -------------------------------------------------------------------------

  describe("getProductListings", () => {
    it("returns empty array when no listings exist", async () => {
      await insertProduct(env.DB, "prod-1", TEST_CREATOR_ID);
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await getProductListings(scopedDb, "prod-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(0);
    });

    it("returns not_found for product owned by another creator", async () => {
      await insertCreator(env.DB, OTHER_CREATOR_ID);
      await insertProduct(env.DB, "prod-other", OTHER_CREATOR_ID);
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await getProductListings(scopedDb, "prod-other");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not_found");
    });
  });

  // -------------------------------------------------------------------------
  // packageForDownload
  // -------------------------------------------------------------------------

  describe("packageForDownload", () => {
    it("creates download package for a product with PDF", async () => {
      await insertProduct(env.DB, "prod-1", TEST_CREATOR_ID);
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const storage = createMockStorage({
        "products/prod-1/product.pdf": "pdf-content",
      });

      const result = await packageForDownload(scopedDb, "prod-1", storage);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.productId).toBe("prod-1");
      expect(result.value.pdfPresent).toBe(true);
      expect(result.value.instructionsText).toContain("Manual Upload Instructions");
      expect(result.value.instructionsText).toContain("Test Product");
      expect(result.value.downloadUrl).toBeTruthy();
    });

    it("indicates when PDF is not found in storage", async () => {
      await insertProduct(env.DB, "prod-1", TEST_CREATOR_ID);
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const storage = createMockStorage({});

      const result = await packageForDownload(scopedDb, "prod-1", storage);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.pdfPresent).toBe(false);
    });

    it("rejects product without pdf_url", async () => {
      await insertProduct(env.DB, "prod-nopdf", TEST_CREATOR_ID, { pdfUrl: null });
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const storage = createMockStorage({});

      const result = await packageForDownload(scopedDb, "prod-nopdf", storage);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("no_pdf");
    });

    it("returns not_found for non-existent product", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      const storage = createMockStorage({});

      const result = await packageForDownload(scopedDb, "nonexistent", storage);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not_found");
    });

    it("includes price in instructions when set", async () => {
      await insertProduct(env.DB, "prod-1", TEST_CREATOR_ID, {
        suggestedPriceCents: 2499,
      });
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);
      const storage = createMockStorage({});

      const result = await packageForDownload(scopedDb, "prod-1", storage);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.instructionsText).toContain("$24.99");
    });
  });

  // -------------------------------------------------------------------------
  // generateShareAssets
  // -------------------------------------------------------------------------

  describe("generateShareAssets", () => {
    it("generates three assets with correct dimensions", async () => {
      await insertProduct(env.DB, "prod-1", TEST_CREATOR_ID);
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await generateShareAssets(scopedDb, "prod-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.assets).toHaveLength(3);

      // Square (1080x1080)
      const square = result.value.assets.find((a) => a.format === "square");
      expect(square).toBeDefined();
      expect(square?.dimensions.width).toBe(1080);
      expect(square?.dimensions.height).toBe(1080);

      // Vertical (1080x1920)
      const vertical = result.value.assets.find((a) => a.format === "vertical");
      expect(vertical).toBeDefined();
      expect(vertical?.dimensions.width).toBe(1080);
      expect(vertical?.dimensions.height).toBe(1920);

      // Story (1080x1920 with safe zones)
      const story = result.value.assets.find((a) => a.format === "story");
      expect(story).toBeDefined();
      expect(story?.dimensions.width).toBe(1080);
      expect(story?.dimensions.height).toBe(1920);
      expect(story?.safeZones).not.toBeNull();
      expect(story?.safeZones?.top).toBe(200);
      expect(story?.safeZones?.bottom).toBe(200);
    });

    it("includes product title in asset HTML", async () => {
      await insertProduct(env.DB, "prod-1", TEST_CREATOR_ID, {
        title: "Summer Recipe Collection",
      });
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await generateShareAssets(scopedDb, "prod-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.productTitle).toBe("Summer Recipe Collection");
      for (const asset of result.value.assets) {
        expect(asset.html).toContain("Summer Recipe Collection");
      }
    });

    it("uses 'Available now' CTA for non-lead-magnet products", async () => {
      await insertProduct(env.DB, "prod-1", TEST_CREATOR_ID, {
        productType: "Ebook",
      });
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await generateShareAssets(scopedDb, "prod-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.ctaText).toBe("Available now");
      for (const asset of result.value.assets) {
        expect(asset.html).toContain("Available now");
      }
    });

    it("uses 'Get it free' CTA for lead magnet products", async () => {
      await insertProduct(env.DB, "prod-lm", TEST_CREATOR_ID, {
        productType: "LeadMagnet",
      });
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await generateShareAssets(scopedDb, "prod-lm");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.ctaText).toBe("Get it free");
      for (const asset of result.value.assets) {
        expect(asset.html).toContain("Get it free");
      }
    });

    it("includes brand kit colors and font in asset HTML", async () => {
      await insertProduct(env.DB, "prod-1", TEST_CREATOR_ID);
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await generateShareAssets(scopedDb, "prod-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      for (const asset of result.value.assets) {
        expect(asset.html).toContain("#FF5733"); // primary color
        expect(asset.html).toContain("Playfair Display"); // heading font
      }
    });

    it("includes logo when present in brand kit", async () => {
      // Re-insert brand kit with logo
      await env.DB.exec(`DELETE FROM brand_kits WHERE id = '${BRAND_KIT_ID}'`);
      await insertBrandKit(env.DB, BRAND_KIT_ID, TEST_CREATOR_ID, {
        logoUrl: "https://example.com/logo.png",
      });
      await insertProduct(env.DB, "prod-1", TEST_CREATOR_ID);
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await generateShareAssets(scopedDb, "prod-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      for (const asset of result.value.assets) {
        expect(asset.html).toContain("https://example.com/logo.png");
      }
    });

    it("returns not_found for non-existent product", async () => {
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await generateShareAssets(scopedDb, "nonexistent");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("not_found");
    });

    it("uses default brand kit when product's brand kit is missing", async () => {
      // Insert product with a brand_kit_id that doesn't exist in brand_kits table
      await env.DB.exec(
        `INSERT INTO product_base (id, creator_id, product_type, status, title, description, brand_kit_id, template_id, pdf_url, currency, ai_copy_reviewed, created_at, updated_at) VALUES ('prod-nobk', '${TEST_CREATOR_ID}', 'Ebook', 'Published', 'No BK Product', NULL, 'nonexistent-bk', 'template-1', 'https://example.com/test.pdf', 'USD', 0, '${NOW_ISO}', '${NOW_ISO}')`,
      );
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await generateShareAssets(scopedDb, "prod-nobk");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Should use fallback colors/fonts
      for (const asset of result.value.assets) {
        expect(asset.html).toContain("#333333"); // fallback color
        expect(asset.html).toContain("Georgia"); // fallback font
      }
    });

    it("generates storage keys for each asset format", async () => {
      await insertProduct(env.DB, "prod-1", TEST_CREATOR_ID);
      const scopedDb = withCreatorScope(db, TEST_CREATOR_ID);

      const result = await generateShareAssets(scopedDb, "prod-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const keys = result.value.assets.map((a) => a.storageKey);
      expect(keys).toContain("products/prod-1/share-assets/square.html");
      expect(keys).toContain("products/prod-1/share-assets/vertical.html");
      expect(keys).toContain("products/prod-1/share-assets/story.html");
    });
  });

  // -------------------------------------------------------------------------
  // Platform adapter constructors (with mock fetch)
  // -------------------------------------------------------------------------

  describe("StanStoreAdapter", () => {
    it("returns upload result on success", async () => {
      const mockFetch = async (
        _url: string | URL | Request,
        _init?: RequestInit,
      ): Promise<Response> => {
        return new Response(JSON.stringify({ url: "https://stan.store/product/abc", id: "abc" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      const adapter = createStanStoreAdapter({
        apiKey: "test-key",
        storeId: "test-store",
        fetchFn: mockFetch as typeof fetch,
      });

      const product: ProductBaseRow = {
        id: "prod-1",
        creator_id: TEST_CREATOR_ID,
        product_type: "Ebook",
        status: "Published",
        title: "Test Product",
        description: "desc",
        brand_kit_id: BRAND_KIT_ID,
        template_id: "t-1",
        pdf_url: "https://example.com/test.pdf",
        epub_url: null,
        kit_form_id: null,
        kit_sequence_id: null,
        suggested_price_cents: 999,
        currency: "USD",
        ai_copy_reviewed: false,
        created_at: NOW_ISO,
        updated_at: NOW_ISO,
      };

      const result = await adapter.uploadProduct(product, "https://example.com/test.pdf");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.listing_url).toBe("https://stan.store/product/abc");
      expect(result.value.platform_id).toBe("abc");
    });

    it("returns platform_unavailable on 5xx error", async () => {
      const mockFetch = async (): Promise<Response> => {
        return new Response("Internal Server Error", { status: 500 });
      };

      const adapter = createStanStoreAdapter({
        apiKey: "test-key",
        storeId: "test-store",
        fetchFn: mockFetch as typeof fetch,
      });

      const product: ProductBaseRow = {
        id: "prod-1",
        creator_id: TEST_CREATOR_ID,
        product_type: "Ebook",
        status: "Published",
        title: "Test Product",
        description: null,
        brand_kit_id: BRAND_KIT_ID,
        template_id: "t-1",
        pdf_url: "https://example.com/test.pdf",
        epub_url: null,
        kit_form_id: null,
        kit_sequence_id: null,
        suggested_price_cents: null,
        currency: "USD",
        ai_copy_reviewed: false,
        created_at: NOW_ISO,
        updated_at: NOW_ISO,
      };

      const result = await adapter.uploadProduct(product, "https://example.com/test.pdf");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("platform_unavailable");
    });

    it("returns file_upload_rejected on 4xx error", async () => {
      const mockFetch = async (): Promise<Response> => {
        return new Response("File too large", { status: 400 });
      };

      const adapter = createStanStoreAdapter({
        apiKey: "test-key",
        storeId: "test-store",
        fetchFn: mockFetch as typeof fetch,
      });

      const product: ProductBaseRow = {
        id: "prod-1",
        creator_id: TEST_CREATOR_ID,
        product_type: "Ebook",
        status: "Published",
        title: "Test Product",
        description: null,
        brand_kit_id: BRAND_KIT_ID,
        template_id: "t-1",
        pdf_url: "https://example.com/test.pdf",
        epub_url: null,
        kit_form_id: null,
        kit_sequence_id: null,
        suggested_price_cents: null,
        currency: "USD",
        ai_copy_reviewed: false,
        created_at: NOW_ISO,
        updated_at: NOW_ISO,
      };

      const result = await adapter.uploadProduct(product, "https://example.com/test.pdf");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("file_upload_rejected");
      if (result.error.type !== "file_upload_rejected") return;
      expect(result.error.message).toBe("File too large");
    });
  });

  describe("GumroadAdapter", () => {
    it("returns upload result on success", async () => {
      const mockFetch = async (): Promise<Response> => {
        return new Response(
          JSON.stringify({
            success: true,
            product: { short_url: "https://gumroad.com/l/abc", id: "gum-abc" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      };

      const adapter = createGumroadAdapter({
        accessToken: "test-token",
        fetchFn: mockFetch as typeof fetch,
      });

      const product: ProductBaseRow = {
        id: "prod-1",
        creator_id: TEST_CREATOR_ID,
        product_type: "Ebook",
        status: "Published",
        title: "Test Product",
        description: "desc",
        brand_kit_id: BRAND_KIT_ID,
        template_id: "t-1",
        pdf_url: "https://example.com/test.pdf",
        epub_url: null,
        kit_form_id: null,
        kit_sequence_id: null,
        suggested_price_cents: 999,
        currency: "USD",
        ai_copy_reviewed: false,
        created_at: NOW_ISO,
        updated_at: NOW_ISO,
      };

      const result = await adapter.uploadProduct(product, "https://example.com/test.pdf");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.listing_url).toBe("https://gumroad.com/l/abc");
      expect(result.value.platform_id).toBe("gum-abc");
    });
  });

  describe("LtkAdapter", () => {
    it("returns upload result on success", async () => {
      const mockFetch = async (): Promise<Response> => {
        return new Response(
          JSON.stringify({
            listing_url: "https://ltk.com/product/ltk-abc",
            product_id: "ltk-abc",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      };

      const adapter = createLtkAdapter({
        apiKey: "test-key",
        partnerId: "partner-1",
        fetchFn: mockFetch as typeof fetch,
      });

      const product: ProductBaseRow = {
        id: "prod-1",
        creator_id: TEST_CREATOR_ID,
        product_type: "Ebook",
        status: "Published",
        title: "Test Product",
        description: "desc",
        brand_kit_id: BRAND_KIT_ID,
        template_id: "t-1",
        pdf_url: "https://example.com/test.pdf",
        epub_url: null,
        kit_form_id: null,
        kit_sequence_id: null,
        suggested_price_cents: 999,
        currency: "USD",
        ai_copy_reviewed: false,
        created_at: NOW_ISO,
        updated_at: NOW_ISO,
      };

      const result = await adapter.uploadProduct(product, "https://example.com/test.pdf");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.listing_url).toBe("https://ltk.com/product/ltk-abc");
      expect(result.value.platform_id).toBe("ltk-abc");
    });

    it("returns platform_unavailable on network error", async () => {
      const mockFetch = async (): Promise<Response> => {
        throw new Error("Network error");
      };

      const adapter = createLtkAdapter({
        apiKey: "test-key",
        partnerId: "partner-1",
        fetchFn: mockFetch as typeof fetch,
      });

      const product: ProductBaseRow = {
        id: "prod-1",
        creator_id: TEST_CREATOR_ID,
        product_type: "Ebook",
        status: "Published",
        title: "Test Product",
        description: null,
        brand_kit_id: BRAND_KIT_ID,
        template_id: "t-1",
        pdf_url: "https://example.com/test.pdf",
        epub_url: null,
        kit_form_id: null,
        kit_sequence_id: null,
        suggested_price_cents: null,
        currency: "USD",
        ai_copy_reviewed: false,
        created_at: NOW_ISO,
        updated_at: NOW_ISO,
      };

      const result = await adapter.uploadProduct(product, "https://example.com/test.pdf");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.type).toBe("platform_unavailable");
    });
  });
});
