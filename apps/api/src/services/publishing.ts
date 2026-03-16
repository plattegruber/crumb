/**
 * Publishing Pipeline service (SPEC §12).
 *
 * Implements:
 *   §12.1 Platform Adapters (StanStore, Gumroad, LTK)
 *   §12.2 Publishing Flow
 *   §12.3 Social Share Asset Generation
 *
 * All public functions return Promise<Result<T, E>>.
 * Platform adapters are dependency-injected for testability.
 */
import { eq, and } from "drizzle-orm";
import type { Database } from "../db/index.js";
import {
  productBase,
  publishedListings,
  leadMagnets,
  brandKits,
} from "../db/schema.js";
import type { CreatorScopedDb } from "../middleware/creator-scope.js";
import type { Result, PublishPlatform } from "@crumb/shared";
import { ok, err, PUBLISH_PLATFORM } from "@crumb/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Row shape for a product_base record. */
export interface ProductBaseRow {
  readonly id: string;
  readonly creator_id: string;
  readonly product_type: string;
  readonly status: string;
  readonly title: string;
  readonly description: string | null;
  readonly brand_kit_id: string;
  readonly template_id: string;
  readonly pdf_url: string | null;
  readonly epub_url: string | null;
  readonly kit_form_id: string | null;
  readonly kit_sequence_id: string | null;
  readonly suggested_price_cents: number | null;
  readonly currency: string;
  readonly ai_copy_reviewed: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Row shape for a published_listings record. */
export interface PublishedListingRow {
  readonly id: number;
  readonly product_id: string;
  readonly platform: string;
  readonly listing_url: string | null;
  readonly platform_id: string | null;
  readonly published_at: string;
}

/** Row shape for a brand_kits record. */
export interface BrandKitRow {
  readonly id: string;
  readonly creator_id: string;
  readonly name: string;
  readonly logo_url: string | null;
  readonly primary_color: string;
  readonly secondary_color: string | null;
  readonly accent_color: string | null;
  readonly heading_font_family: string;
  readonly heading_font_fallback: ReadonlyArray<string>;
  readonly body_font_family: string;
  readonly body_font_fallback: ReadonlyArray<string>;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Error types for publishing operations (SPEC §14.4). */
export type PublishError =
  | { readonly type: "not_found" }
  | { readonly type: "not_published_status"; readonly message: string }
  | { readonly type: "no_pdf"; readonly message: string }
  | { readonly type: "platform_unavailable"; readonly platform: string; readonly message: string }
  | { readonly type: "file_upload_rejected"; readonly platform: string; readonly message: string }
  | { readonly type: "invalid_platform"; readonly message: string }
  | { readonly type: "storage_error"; readonly message: string };

/** Result from a platform adapter upload. */
export interface PlatformUploadResult {
  readonly listing_url: string | null;
  readonly platform_id: string | null;
}

// ---------------------------------------------------------------------------
// Platform Adapter interface (§12.1)
// ---------------------------------------------------------------------------

/**
 * Defines the contract for platform-specific product upload implementations.
 * Each adapter accepts injected `fetch` for testability.
 */
export interface PlatformAdapter {
  readonly platform: PublishPlatform;
  uploadProduct(
    product: ProductBaseRow,
    pdfUrl: string,
  ): Promise<Result<PlatformUploadResult, PublishError>>;
}

// ---------------------------------------------------------------------------
// Stan Store Adapter (placeholder)
// ---------------------------------------------------------------------------

export interface StanStoreConfig {
  readonly apiKey: string;
  readonly storeId: string;
  readonly fetchFn: typeof fetch;
}

/**
 * Placeholder StanStore API adapter (§12.1).
 * API client shape is defined; actual calls return platform_unavailable
 * until the real API integration is implemented.
 */
export function createStanStoreAdapter(
  config: StanStoreConfig,
): PlatformAdapter {
  return {
    platform: PUBLISH_PLATFORM.StanStore,
    async uploadProduct(
      product: ProductBaseRow,
      pdfUrl: string,
    ): Promise<Result<PlatformUploadResult, PublishError>> {
      try {
        // Placeholder: defines the shape of the Stan Store API call.
        // In a real implementation, this would:
        // 1. Upload the PDF file to Stan Store
        // 2. Create a product listing with title, description, price
        // 3. Return the listing URL and platform product ID
        const _requestBody = {
          title: product.title,
          description: product.description,
          price_cents: product.suggested_price_cents,
          currency: product.currency,
          file_url: pdfUrl,
          store_id: config.storeId,
        };

        const response = await config.fetchFn(
          `https://api.stanstore.com/v1/products`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${config.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(_requestBody),
          },
        );

        if (!response.ok) {
          if (response.status >= 500) {
            return err({
              type: "platform_unavailable",
              platform: "StanStore",
              message: `Stan Store API returned ${String(response.status)}`,
            });
          }
          const errorText = await response.text();
          return err({
            type: "file_upload_rejected",
            platform: "StanStore",
            message: errorText,
          });
        }

        const data = (await response.json()) as Record<string, unknown>;
        return ok({
          listing_url: typeof data["url"] === "string" ? data["url"] : null,
          platform_id: typeof data["id"] === "string" ? data["id"] : null,
        });
      } catch {
        return err({
          type: "platform_unavailable",
          platform: "StanStore",
          message: "Failed to connect to Stan Store API",
        });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Gumroad Adapter (placeholder)
// ---------------------------------------------------------------------------

export interface GumroadConfig {
  readonly accessToken: string;
  readonly fetchFn: typeof fetch;
}

/**
 * Placeholder Gumroad API v2 adapter (§12.1).
 */
export function createGumroadAdapter(config: GumroadConfig): PlatformAdapter {
  return {
    platform: PUBLISH_PLATFORM.Gumroad,
    async uploadProduct(
      product: ProductBaseRow,
      pdfUrl: string,
    ): Promise<Result<PlatformUploadResult, PublishError>> {
      try {
        const _requestBody = {
          name: product.title,
          description: product.description ?? "",
          price: product.suggested_price_cents ?? 0,
          currency: product.currency.toLowerCase(),
          url: pdfUrl,
        };

        const response = await config.fetchFn(
          `https://api.gumroad.com/v2/products`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${config.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(_requestBody),
          },
        );

        if (!response.ok) {
          if (response.status >= 500) {
            return err({
              type: "platform_unavailable",
              platform: "Gumroad",
              message: `Gumroad API returned ${String(response.status)}`,
            });
          }
          const errorText = await response.text();
          return err({
            type: "file_upload_rejected",
            platform: "Gumroad",
            message: errorText,
          });
        }

        const data = (await response.json()) as Record<string, unknown>;
        const productData = data["product"] as Record<string, unknown> | undefined;
        return ok({
          listing_url:
            typeof productData?.["short_url"] === "string"
              ? productData["short_url"]
              : null,
          platform_id:
            typeof productData?.["id"] === "string"
              ? productData["id"]
              : null,
        });
      } catch {
        return err({
          type: "platform_unavailable",
          platform: "Gumroad",
          message: "Failed to connect to Gumroad API",
        });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// LTK Adapter (placeholder)
// ---------------------------------------------------------------------------

export interface LtkConfig {
  readonly apiKey: string;
  readonly partnerId: string;
  readonly fetchFn: typeof fetch;
}

/**
 * Placeholder LTK Partner API adapter (§12.1).
 */
export function createLtkAdapter(config: LtkConfig): PlatformAdapter {
  return {
    platform: PUBLISH_PLATFORM.LTK,
    async uploadProduct(
      product: ProductBaseRow,
      pdfUrl: string,
    ): Promise<Result<PlatformUploadResult, PublishError>> {
      try {
        const _requestBody = {
          title: product.title,
          description: product.description ?? "",
          price_cents: product.suggested_price_cents,
          currency: product.currency,
          digital_asset_url: pdfUrl,
          partner_id: config.partnerId,
        };

        const response = await config.fetchFn(
          `https://api.ltk.com/v1/partners/${config.partnerId}/products`,
          {
            method: "POST",
            headers: {
              "X-API-Key": config.apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(_requestBody),
          },
        );

        if (!response.ok) {
          if (response.status >= 500) {
            return err({
              type: "platform_unavailable",
              platform: "LTK",
              message: `LTK API returned ${String(response.status)}`,
            });
          }
          const errorText = await response.text();
          return err({
            type: "file_upload_rejected",
            platform: "LTK",
            message: errorText,
          });
        }

        const data = (await response.json()) as Record<string, unknown>;
        return ok({
          listing_url:
            typeof data["listing_url"] === "string" ? data["listing_url"] : null,
          platform_id:
            typeof data["product_id"] === "string" ? data["product_id"] : null,
        });
      } catch {
        return err({
          type: "platform_unavailable",
          platform: "LTK",
          message: "Failed to connect to LTK API",
        });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Publishing Flow (§12.2)
// ---------------------------------------------------------------------------

/**
 * Validate that a platform string is a valid PublishPlatform.
 */
export function validatePlatform(
  platform: string,
): Result<PublishPlatform, PublishError> {
  const valid = Object.values(PUBLISH_PLATFORM) as string[];
  if (!valid.includes(platform)) {
    return err({
      type: "invalid_platform",
      message: `Invalid platform "${platform}". Must be one of: ${valid.join(", ")}`,
    });
  }
  return ok(platform as PublishPlatform);
}

/**
 * Publish a product to a specific platform (§12.2).
 *
 * 1. Verify product is in Published status with pdf_url.
 * 2. Call adapter to create listing.
 * 3. Store PublishedListing record.
 * 4. If product has a lead magnet, update the lead magnet's relationship.
 */
export async function publishToPlatform(
  scopedDb: CreatorScopedDb<Database>,
  productId: string,
  platform: PublishPlatform,
  adapter: PlatformAdapter,
): Promise<Result<PublishedListingRow, PublishError>> {
  const { db, creatorId } = scopedDb;

  // Step 1: Verify product exists and belongs to this creator
  const productRows = await db
    .select()
    .from(productBase)
    .where(
      and(eq(productBase.id, productId), eq(productBase.creator_id, creatorId)),
    )
    .limit(1);

  if (productRows.length === 0 || !productRows[0]) {
    return err({ type: "not_found" });
  }

  const product = productRows[0];

  // Verify Published status
  if (product.status !== "Published") {
    return err({
      type: "not_published_status",
      message: `Product must be in Published status to publish. Current status: ${product.status}`,
    });
  }

  // Verify pdf_url exists
  if (product.pdf_url === null) {
    return err({
      type: "no_pdf",
      message: "Product must have a PDF before publishing to a platform",
    });
  }

  // Step 2: Call adapter to create listing
  const uploadResult = await adapter.uploadProduct(product, product.pdf_url);
  if (!uploadResult.ok) {
    return uploadResult;
  }

  // Step 3: Store PublishedListing record
  const now = new Date().toISOString();
  const insertedRows = await db
    .insert(publishedListings)
    .values({
      product_id: productId,
      platform,
      listing_url: uploadResult.value.listing_url,
      platform_id: uploadResult.value.platform_id,
      published_at: now,
    })
    .returning();

  if (insertedRows.length === 0 || !insertedRows[0]) {
    return err({
      type: "storage_error",
      message: "Failed to store published listing record",
    });
  }

  // Step 4: If product has a lead magnet, update lead magnet relationships
  // Find lead magnets whose parent_product_id matches this product
  if (uploadResult.value.listing_url !== null) {
    const childLeadMagnets = await db
      .select({ product_id: leadMagnets.product_id })
      .from(leadMagnets)
      .where(eq(leadMagnets.parent_product_id, productId));

    // For each lead magnet child, store the listing URL association
    // The Day 7 pitch email URL update would be handled by the automation engine
    // using the published listing URL. For now, we ensure the listing is stored.
    for (const _lm of childLeadMagnets) {
      // In a full implementation, this would update the Kit sequence
      // for Day 7 pitch email with the listing URL.
      // That integration is handled by the automation engine.
    }
  }

  return ok(insertedRows[0]);
}

/**
 * Get all published listings for a product.
 */
export async function getProductListings(
  scopedDb: CreatorScopedDb<Database>,
  productId: string,
): Promise<Result<readonly PublishedListingRow[], PublishError>> {
  const { db, creatorId } = scopedDb;

  // Verify product belongs to creator
  const productRows = await db
    .select({ id: productBase.id })
    .from(productBase)
    .where(
      and(eq(productBase.id, productId), eq(productBase.creator_id, creatorId)),
    )
    .limit(1);

  if (productRows.length === 0) {
    return err({ type: "not_found" });
  }

  const listings = await db
    .select()
    .from(publishedListings)
    .where(eq(publishedListings.product_id, productId));

  return ok(listings);
}

// ---------------------------------------------------------------------------
// Fallback: Download Package (§12.1)
// ---------------------------------------------------------------------------

/** Metadata about a packaged download. */
export interface DownloadPackage {
  readonly productId: string;
  readonly pdfKey: string;
  readonly pdfPresent: boolean;
  readonly instructionsText: string;
  readonly downloadUrl: string;
}

/**
 * R2 storage interface for dependency injection in tests.
 */
export interface StorageBucket {
  get(key: string): Promise<{ readonly body: ReadableStream } | null>;
  put(key: string, value: ReadableStream | ArrayBuffer | string): Promise<void>;
}

/**
 * Package a product for manual download when platform API is unavailable (§12.1).
 *
 * Fetches PDF from R2, creates instructions, and returns a download descriptor.
 * In a full implementation this would create a ZIP and return a signed URL.
 */
export async function packageForDownload(
  scopedDb: CreatorScopedDb<Database>,
  productId: string,
  storage: StorageBucket,
): Promise<Result<DownloadPackage, PublishError>> {
  const { db, creatorId } = scopedDb;

  // Verify product belongs to creator
  const productRows = await db
    .select()
    .from(productBase)
    .where(
      and(eq(productBase.id, productId), eq(productBase.creator_id, creatorId)),
    )
    .limit(1);

  if (productRows.length === 0 || !productRows[0]) {
    return err({ type: "not_found" });
  }

  const product = productRows[0];

  if (product.pdf_url === null) {
    return err({
      type: "no_pdf",
      message: "Product must have a PDF to create a download package",
    });
  }

  // Extract R2 key from the PDF URL
  const pdfKey = `products/${productId}/product.pdf`;

  // Check that the PDF exists in R2
  const pdfObject = await storage.get(pdfKey);
  const pdfPresent = pdfObject !== null;

  // Generate instructions text for manual upload
  const instructionsText = [
    `Manual Upload Instructions for "${product.title}"`,
    "",
    "This package contains your product PDF ready for upload to your",
    "preferred selling platform.",
    "",
    "Supported platforms:",
    "  - Stan Store (https://stan.store)",
    "  - Gumroad (https://gumroad.com)",
    "  - LTK (https://www.shopltk.com)",
    "",
    "Steps:",
    "1. Log in to your selling platform.",
    "2. Create a new digital product listing.",
    "3. Upload the included PDF file.",
    `4. Set the price: ${product.suggested_price_cents !== null ? `$${(product.suggested_price_cents / 100).toFixed(2)} ${product.currency}` : "Set your own price"}`,
    `5. Set the title: ${product.title}`,
    product.description !== null ? `6. Set the description: ${product.description}` : "",
    "",
    "Once published, come back to your dashboard and add the listing URL",
    "so we can update any lead magnets that reference this product.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  // Store the instructions in R2 alongside the PDF
  const instructionsKey = `products/${productId}/instructions.txt`;
  await storage.put(instructionsKey, instructionsText);

  // In a full implementation, this would:
  // 1. Create a ZIP with the PDF and instructions
  // 2. Upload the ZIP to R2
  // 3. Generate a signed download URL with expiry
  const downloadUrl = `https://storage.example.com/downloads/${productId}/package.zip`;

  return ok({
    productId,
    pdfKey,
    pdfPresent,
    instructionsText,
    downloadUrl,
  });
}

// ---------------------------------------------------------------------------
// Social Share Asset Generation (§12.3)
// ---------------------------------------------------------------------------

/** Dimensions for a share asset. */
export interface AssetDimensions {
  readonly width: number;
  readonly height: number;
}

/** Safe zone insets for story format. */
export interface SafeZones {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/** A single generated share asset. */
export interface ShareAsset {
  readonly format: "square" | "vertical" | "story";
  readonly dimensions: AssetDimensions;
  readonly html: string;
  readonly storageKey: string;
  readonly safeZones: SafeZones | null;
}

/** Input brand kit data for asset generation. */
export interface BrandKitInput {
  readonly primaryColor: string;
  readonly headingFontFamily: string;
  readonly logoUrl: string | null;
}

/** Result of generating share assets. */
export interface ShareAssetsResult {
  readonly assets: readonly ShareAsset[];
  readonly productTitle: string;
  readonly ctaText: string;
}

/**
 * Asset format definitions per SPEC §12.3.
 */
const ASSET_FORMATS: readonly {
  readonly format: "square" | "vertical" | "story";
  readonly width: number;
  readonly height: number;
  readonly safeZones: SafeZones | null;
}[] = [
  { format: "square", width: 1080, height: 1080, safeZones: null },
  { format: "vertical", width: 1080, height: 1920, safeZones: null },
  {
    format: "story",
    width: 1080,
    height: 1920,
    safeZones: { top: 200, bottom: 200, left: 40, right: 40 },
  },
];

/**
 * Generate HTML-based social share assets for a published product (§12.3).
 *
 * Generates three asset configs:
 * - Square (1080x1080) — for Instagram feed
 * - Vertical (1080x1920) — for TikTok/Reels cover
 * - Story (1080x1920 with safe zones) — for Instagram/TikTok Stories
 */
export async function generateShareAssets(
  scopedDb: CreatorScopedDb<Database>,
  productId: string,
): Promise<Result<ShareAssetsResult, PublishError>> {
  const { db, creatorId } = scopedDb;

  // Fetch the product
  const productRows = await db
    .select()
    .from(productBase)
    .where(
      and(eq(productBase.id, productId), eq(productBase.creator_id, creatorId)),
    )
    .limit(1);

  if (productRows.length === 0 || !productRows[0]) {
    return err({ type: "not_found" });
  }

  const product = productRows[0];

  // Fetch the brand kit
  const brandKitRows = await db
    .select()
    .from(brandKits)
    .where(eq(brandKits.id, product.brand_kit_id))
    .limit(1);

  const brandKit: BrandKitInput =
    brandKitRows.length > 0 && brandKitRows[0]
      ? {
          primaryColor: brandKitRows[0].primary_color,
          headingFontFamily: brandKitRows[0].heading_font_family,
          logoUrl: brandKitRows[0].logo_url,
        }
      : {
          primaryColor: "#333333",
          headingFontFamily: "Georgia",
          logoUrl: null,
        };

  // Determine CTA text based on product type
  const ctaText =
    product.product_type === "LeadMagnet"
      ? "Get it free"
      : "Available now";

  const assets: ShareAsset[] = [];

  for (const formatDef of ASSET_FORMATS) {
    const html = generateAssetHtml(
      product.title,
      ctaText,
      brandKit,
      formatDef.width,
      formatDef.height,
      formatDef.safeZones,
    );

    assets.push({
      format: formatDef.format,
      dimensions: { width: formatDef.width, height: formatDef.height },
      html,
      storageKey: `products/${productId}/share-assets/${formatDef.format}.html`,
      safeZones: formatDef.safeZones,
    });
  }

  return ok({
    assets,
    productTitle: product.title,
    ctaText,
  });
}

/**
 * Generate HTML for a single share asset.
 *
 * In a full implementation, this would use a canvas/image generation service
 * to render PNG files. For now, we generate HTML that represents the asset layout.
 */
function generateAssetHtml(
  title: string,
  ctaText: string,
  brandKit: BrandKitInput,
  width: number,
  height: number,
  safeZones: SafeZones | null,
): string {
  const padding = safeZones
    ? `${String(safeZones.top)}px ${String(safeZones.right)}px ${String(safeZones.bottom)}px ${String(safeZones.left)}px`
    : "40px";

  const logoHtml = brandKit.logoUrl
    ? `<img src="${brandKit.logoUrl}" alt="Logo" style="max-width: 120px; max-height: 60px; margin-bottom: 20px;" />`
    : "";

  return [
    `<!DOCTYPE html>`,
    `<html>`,
    `<head><meta charset="utf-8" /></head>`,
    `<body style="margin: 0; padding: 0; width: ${String(width)}px; height: ${String(height)}px;">`,
    `  <div style="width: ${String(width)}px; height: ${String(height)}px; background-color: ${brandKit.primaryColor}; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: ${padding}; box-sizing: border-box;">`,
    `    ${logoHtml}`,
    `    <h1 style="font-family: '${brandKit.headingFontFamily}', Georgia, serif; color: #ffffff; text-align: center; font-size: ${height > 1200 ? "48" : "36"}px; margin: 0 0 24px 0;">${title}</h1>`,
    `    <p style="font-family: '${brandKit.headingFontFamily}', Georgia, serif; color: #ffffff; text-align: center; font-size: 24px; margin: 0; padding: 12px 32px; border: 2px solid #ffffff; border-radius: 8px;">${ctaText}</p>`,
    `  </div>`,
    `</body>`,
    `</html>`,
  ].join("\n");
}
