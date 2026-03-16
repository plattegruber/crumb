// ---------------------------------------------------------------------------
// Data models (SPEC §2.4, §2.9–2.19)
// ---------------------------------------------------------------------------
// These are the remaining data model types that assemble the branded IDs,
// enums, and value types defined in ids.ts, enums.ts, and value-types.ts.
// ---------------------------------------------------------------------------

import type {
  BrandKitId,
  CollectionId,
  CreatorId,
  EventId,
  ImportJobId,
  KitFormId,
  KitSequenceId,
  KitSubscriberId,
  PhotoId,
  ProductId,
  RecipeId,
  Slug,
  TeamMemberId,
  Url,
} from "./ids.js";

import type {
  DietaryTag,
  EbookFormat,
  EventSource,
  KitSubscriberState,
  NutritionSource,
  ProductStatus,
  PublishPlatform,
  RecipeStatus,
  TeamMemberRole,
} from "./enums.js";

import type {
  IngredientGroup,
  InstructionGroup,
  Photo,
  RecipeClassification,
  RecipeTiming,
  RecipeYield,
} from "./value-types.js";

import type { Quantity } from "./quantity.js";

// ---------------------------------------------------------------------------
// §2.4 RecipeSource — discriminated union
// ---------------------------------------------------------------------------

export type RecipeSource =
  | { readonly type: "Manual" }
  | { readonly type: "ImportedFromUrl"; readonly url: Url }
  | { readonly type: "ImportedFromInstagram"; readonly post_url: Url }
  | { readonly type: "ImportedFromTikTok"; readonly video_url: Url }
  | { readonly type: "ImportedFromYoutube"; readonly video_url: Url }
  | { readonly type: "ImportedFromScreenshot"; readonly upload_id: string }
  | {
      readonly type: "SyncedFromWordPress";
      readonly site_url: Url;
      readonly wordpress_recipe_id: string;
      readonly last_synced_at: number;
    };

// ---------------------------------------------------------------------------
// §2.9 NutritionFacts
// ---------------------------------------------------------------------------

/** Value type — all nutrition values are optional (per serving). */
export interface NutritionValues {
  readonly calories: number | null;
  readonly total_fat_g: number | null;
  readonly saturated_fat_g: number | null;
  readonly cholesterol_mg: number | null;
  readonly sodium_mg: number | null;
  readonly total_carbs_g: number | null;
  readonly dietary_fiber_g: number | null;
  readonly total_sugars_g: number | null;
  readonly protein_g: number | null;
  readonly vitamin_d_mcg: number | null;
  readonly calcium_mg: number | null;
  readonly iron_mg: number | null;
  readonly potassium_mg: number | null;
}

/** Value type — nutrition info with its provenance. */
export interface NutritionFacts {
  readonly source: NutritionSource;
  readonly per_serving: NutritionValues;
}

// ---------------------------------------------------------------------------
// §2.10 RecipeEngagementScore
// ---------------------------------------------------------------------------

/** Value type — stored for auditability. */
export interface EngagementScoreInputs {
  readonly save_clicks_30d: number;
  readonly sequence_triggers_30d: number;
  readonly card_views_30d: number;
  readonly purchase_attributions_all: number;
}

/** Computed engagement score for a recipe. Not a field on Recipe. */
export interface RecipeEngagementScore {
  readonly recipe_id: RecipeId;
  readonly creator_id: CreatorId;
  readonly score: number; // 0.0–10.0
  readonly computed_at: number; // timestamp
  readonly inputs: EngagementScoreInputs;
}

// ---------------------------------------------------------------------------
// §2.11 Collection
// ---------------------------------------------------------------------------

export interface Collection {
  readonly id: CollectionId;
  readonly creator_id: CreatorId;
  readonly name: string;
  readonly description: string | null;
  readonly recipe_ids: readonly RecipeId[];
  readonly created_at: number;
  readonly updated_at: number;
}

// ---------------------------------------------------------------------------
// §2.12 ImportJob
// ---------------------------------------------------------------------------

/** Discriminated union — import source variants. */
export type ImportSource =
  | { readonly type: "FromUrl"; readonly url: Url }
  | { readonly type: "FromInstagramPost"; readonly url: Url }
  | { readonly type: "FromTikTokVideo"; readonly url: Url }
  | { readonly type: "FromYouTubeVideo"; readonly url: Url }
  | { readonly type: "FromScreenshot"; readonly upload_id: string }
  | { readonly type: "FromInstagramBulk"; readonly account_handle: string }
  | { readonly type: "FromWordPressSync"; readonly site_url: Url };

/** Discriminated union — import error variants. */
export type ImportError =
  | { readonly type: "FetchFailed"; readonly reason: string }
  | { readonly type: "ExtractionFailed"; readonly reason: string }
  | { readonly type: "VideoTooLong"; readonly duration_seconds: number }
  | { readonly type: "FileTooLarge"; readonly size_bytes: number }
  | { readonly type: "WordPressAuthFailed" }
  | { readonly type: "Timeout" };

/**
 * Discriminated union — import job status.
 * Each variant carries only the data relevant to that state.
 */
export type ImportStatus =
  | {
      readonly type: "Pending";
      readonly source: ImportSource;
    }
  | {
      readonly type: "Processing";
      readonly source: ImportSource;
      readonly started_at: number;
    }
  | {
      readonly type: "NeedsReview";
      readonly source: ImportSource;
      readonly extract: RecipeExtract;
    }
  | {
      readonly type: "Completed";
      readonly source: ImportSource;
      readonly recipe_id: RecipeId;
    }
  | {
      readonly type: "Failed";
      readonly source: ImportSource;
      readonly error: ImportError;
    };

export interface ImportJob {
  readonly id: ImportJobId;
  readonly creator_id: CreatorId;
  readonly status: ImportStatus;
  readonly created_at: number;
  readonly updated_at: number;
}

// ---------------------------------------------------------------------------
// §2.13 RecipeExtract
// ---------------------------------------------------------------------------

/** Value type — raw ingredient as extracted by AI. */
export interface RawIngredient {
  readonly raw_text: string;
  readonly quantity: Quantity | null;
  readonly unit: string | null;
  readonly item: string | null;
  readonly notes: string | null;
  readonly confidence: number; // 0.0–1.0
}

/** Value type — raw ingredient group as extracted by AI. */
export interface RawIngredientGroup {
  readonly label: string | null;
  readonly ingredients: readonly RawIngredient[];
}

/** Value type — per-field extraction confidence scores. */
export interface ExtractionConfidence {
  readonly overall: number; // 0.0–1.0
  readonly field_scores: Readonly<Record<string, number>>;
}

/**
 * Intermediate value produced by the AI extraction pipeline.
 * Exists only inside an ImportStatus.NeedsReview variant.
 */
export interface RecipeExtract {
  readonly title: string | null;
  readonly description: string | null;
  readonly ingredients: readonly RawIngredientGroup[];
  readonly instructions: readonly string[];
  readonly timing: RecipeTiming;
  readonly yield: RecipeYield | null;
  readonly notes: string | null;
  readonly photo_urls: readonly Url[];
  readonly dietary_tags: ReadonlySet<DietaryTag>;
  readonly confidence: ExtractionConfidence;
}

// ---------------------------------------------------------------------------
// §2.14 Product
// ---------------------------------------------------------------------------

/** Value type — a chapter within an ebook. */
export interface Chapter {
  readonly title: string;
  readonly intro_copy: string | null;
  readonly recipe_ids: readonly RecipeId[];
}

/** Value type — ebook-specific product detail. */
export interface EbookDetail {
  readonly recipe_ids: readonly RecipeId[];
  readonly chapters: readonly Chapter[];
  readonly intro_copy: string | null;
  readonly author_bio: string | null;
  readonly format: EbookFormat;
}

/** Value type — a single day in a meal plan. */
export interface MealPlanDay {
  readonly day_number: number; // 1-based
  readonly breakfast: RecipeId | null;
  readonly lunch: RecipeId | null;
  readonly dinner: RecipeId | null;
  readonly snacks: readonly RecipeId[];
}

/** Value type — a single item in a shopping list section. */
export interface ShoppingItem {
  readonly quantity: Quantity | null;
  readonly unit: string | null;
  readonly item: string;
  readonly recipe_refs: readonly RecipeId[];
}

/** Value type — a section of a shopping list grouped by category. */
export interface ShoppingSection {
  readonly label: string;
  readonly items: readonly ShoppingItem[];
}

/** Value type — generated shopping list for a meal plan. */
export interface ShoppingList {
  readonly sections: readonly ShoppingSection[];
  readonly generated_at: number; // timestamp
}

/** Value type — meal plan-specific product detail. */
export interface MealPlanDetail {
  readonly days: readonly MealPlanDay[];
  readonly shopping_list: ShoppingList | null;
}

/** Shared base record for all product types. */
export interface ProductBase {
  readonly id: ProductId;
  readonly creator_id: CreatorId;
  readonly status: ProductStatus;
  readonly title: string;
  readonly description: string | null;
  readonly brand_kit_id: BrandKitId;
  readonly template_id: string;
  readonly pdf_url: Url | null;
  readonly epub_url: Url | null;
  readonly published_to: readonly PublishedListing[];
  readonly kit_form_id: KitFormId | null;
  readonly kit_sequence_id: KitSequenceId | null;
  readonly suggested_price_cents: number | null;
  readonly currency: string; // ISO 4217, default "USD"
  readonly ai_copy_reviewed: boolean;
  readonly created_at: number;
  readonly updated_at: number;
}

/** Discriminated union — product types with type-specific detail records. */
export type Product =
  | {
      readonly type: "Ebook";
      readonly base: ProductBase;
      readonly detail: EbookDetail;
    }
  | {
      readonly type: "MealPlan";
      readonly base: ProductBase;
      readonly detail: MealPlanDetail;
    }
  | {
      readonly type: "RecipeCardPack";
      readonly base: ProductBase;
      readonly recipe_ids: readonly RecipeId[];
    }
  | {
      readonly type: "LeadMagnet";
      readonly base: ProductBase;
      readonly parent_product_id: ProductId;
      readonly recipe_ids: readonly RecipeId[];
    };

// ---------------------------------------------------------------------------
// §2.15 PublishedListing
// ---------------------------------------------------------------------------

/** Value type — record of a product published to an external platform. */
export interface PublishedListing {
  readonly platform: PublishPlatform;
  readonly listing_url: Url | null;
  readonly platform_id: string | null;
  readonly published_at: number; // timestamp
}

// ---------------------------------------------------------------------------
// §2.16 RecipeEngagementEvent
// ---------------------------------------------------------------------------

/**
 * Discriminated union — engagement event type.
 * PurchaseAttribution is the only variant carrying a product_id.
 */
export type EngagementEventType =
  | { readonly type: "SaveClick" }
  | { readonly type: "CardView" }
  | { readonly type: "SequenceTrigger" }
  | { readonly type: "PurchaseAttribution"; readonly product_id: ProductId };

export interface RecipeEngagementEvent {
  readonly id: EventId;
  readonly creator_id: CreatorId;
  readonly recipe_id: RecipeId;
  readonly event: EngagementEventType;
  readonly kit_subscriber_id: KitSubscriberId | null;
  readonly source: EventSource;
  readonly occurred_at: number; // timestamp
}

// ---------------------------------------------------------------------------
// §2.17 SegmentProfile
// ---------------------------------------------------------------------------

/** Value type — statistics for a dietary segment. */
export interface SegmentStat {
  readonly subscriber_count: number;
  readonly engagement_rate: number; // fraction with >=1 save_click in last 30d
  readonly growth_rate_30d: number; // % change over 30 days
  readonly top_recipe_ids: readonly RecipeId[]; // up to 3
}

/**
 * Derived by the Analytics Engine. Represents the dietary preference
 * distribution of a creator's Kit subscriber list at a point in time.
 */
export interface SegmentProfile {
  readonly creator_id: CreatorId;
  readonly computed_at: number; // timestamp
  readonly segments: ReadonlyMap<DietaryTag, SegmentStat>;
}

// ---------------------------------------------------------------------------
// §2.18 KitSubscriberRecord
// ---------------------------------------------------------------------------

/** Ephemeral value type — derived from Kit API, never persisted. */
export interface KitSubscriberRecord {
  readonly id: KitSubscriberId;
  readonly email: string;
  readonly first_name: string | null;
  readonly tags: ReadonlySet<string>;
  readonly custom_fields: ReadonlyMap<string, string>;
  readonly state: KitSubscriberState;
}

// ---------------------------------------------------------------------------
// §2.19 TeamMember
// ---------------------------------------------------------------------------

export interface TeamMember {
  readonly id: TeamMemberId;
  readonly creator_id: CreatorId;
  readonly email: string;
  readonly role: TeamMemberRole;
  readonly invited_at: number; // timestamp
  readonly accepted_at: number | null; // timestamp
}

// ---------------------------------------------------------------------------
// §2.4 Recipe — full entity (assembles all pieces)
// ---------------------------------------------------------------------------

export interface Recipe {
  readonly id: RecipeId;
  readonly creator_id: CreatorId;
  readonly title: string;
  readonly slug: Slug;
  readonly description: string | null;
  readonly source: RecipeSource;
  readonly status: RecipeStatus;
  readonly email_ready: boolean;

  readonly timing: RecipeTiming;
  readonly yield: RecipeYield | null;

  readonly ingredients: readonly IngredientGroup[];
  readonly instructions: readonly InstructionGroup[];
  readonly notes: string | null;

  readonly photos: readonly Photo[];

  readonly classification: RecipeClassification;
  readonly nutrition: NutritionFacts | null;

  readonly collection_ids: ReadonlySet<CollectionId>;

  readonly created_at: number;
  readonly updated_at: number;
}
