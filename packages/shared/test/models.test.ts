import { describe, it, expect } from "vitest";
import type {
  ImportStatus,
  ImportSource,
  ImportError,
  Product,
  ProductBase,
  EngagementEventType,
  RecipeExtract,
  RecipeSource,
  NutritionFacts,
  NutritionValues,
  RecipeEngagementScore,
  EngagementScoreInputs,
  Collection,
  ImportJob,
  RawIngredient,
  RawIngredientGroup,
  ExtractionConfidence,
  MealPlanDay,
  MealPlanDetail,
  ShoppingItem,
  ShoppingSection,
  ShoppingList,
  PublishedListing,
  RecipeEngagementEvent,
  SegmentStat,
  SegmentProfile,
  KitSubscriberRecord,
  TeamMember,
  Recipe,
} from "../src/models.js";
import {
  createRecipeId,
  createCreatorId,
  createCollectionId,
  createProductId,
  createBrandKitId,
  createImportJobId,
  createEventId,
  createKitSubscriberId,
  createTeamMemberId,
  createSlug,
  createUrl,
} from "../src/ids.js";
import type { IngredientId, InstructionId } from "../src/ids.js";
import { wholeNumber, fraction } from "../src/quantity.js";

// ---------------------------------------------------------------------------
// Helpers — reusable fixtures
// ---------------------------------------------------------------------------

const recipeId = createRecipeId("r-1");
const creatorId = createCreatorId("c-1");
const productId = createProductId("p-1");
const url = createUrl("https://example.com")!;

function makeProductBase(overrides: Partial<ProductBase> = {}): ProductBase {
  return {
    id: createProductId("p-base"),
    creator_id: creatorId,
    status: "Draft",
    title: "My Product",
    description: null,
    brand_kit_id: createBrandKitId("bk-1"),
    template_id: "template-1",
    pdf_url: null,
    epub_url: null,
    published_to: [],
    kit_form_id: null,
    kit_sequence_id: null,
    suggested_price_cents: null,
    currency: "USD",
    ai_copy_reviewed: false,
    created_at: 1000,
    updated_at: 1000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// §2.4 RecipeSource — discriminated union
// ---------------------------------------------------------------------------

describe("RecipeSource", () => {
  it("narrows Manual variant", () => {
    const source: RecipeSource = { type: "Manual" };
    if (source.type === "Manual") {
      // No associated data — just verify narrowing
      expect(source.type).toBe("Manual");
    }
  });

  it("narrows ImportedFromUrl variant with url field", () => {
    const source: RecipeSource = { type: "ImportedFromUrl", url };
    if (source.type === "ImportedFromUrl") {
      expect(source.url).toBe(url);
    }
  });

  it("narrows SyncedFromWordPress variant with all fields", () => {
    const source: RecipeSource = {
      type: "SyncedFromWordPress",
      site_url: url,
      wordpress_recipe_id: "wp-42",
      last_synced_at: 999,
    };
    if (source.type === "SyncedFromWordPress") {
      expect(source.site_url).toBe(url);
      expect(source.wordpress_recipe_id).toBe("wp-42");
      expect(source.last_synced_at).toBe(999);
    }
  });

  it("covers all 7 variants", () => {
    const variants: RecipeSource[] = [
      { type: "Manual" },
      { type: "ImportedFromUrl", url },
      { type: "ImportedFromInstagram", post_url: url },
      { type: "ImportedFromTikTok", video_url: url },
      { type: "ImportedFromYoutube", video_url: url },
      { type: "ImportedFromScreenshot", upload_id: "upl-1" },
      {
        type: "SyncedFromWordPress",
        site_url: url,
        wordpress_recipe_id: "wp-1",
        last_synced_at: 0,
      },
    ];
    const types = variants.map((v) => v.type);
    expect(types).toHaveLength(7);
    expect(new Set(types).size).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// §2.9 NutritionFacts
// ---------------------------------------------------------------------------

describe("NutritionFacts", () => {
  it("allows all-null NutritionValues", () => {
    const values: NutritionValues = {
      calories: null,
      total_fat_g: null,
      saturated_fat_g: null,
      cholesterol_mg: null,
      sodium_mg: null,
      total_carbs_g: null,
      dietary_fiber_g: null,
      total_sugars_g: null,
      protein_g: null,
      vitamin_d_mcg: null,
      calcium_mg: null,
      iron_mg: null,
      potassium_mg: null,
    };
    const facts: NutritionFacts = {
      source: "Calculated",
      per_serving: values,
    };
    expect(facts.source).toBe("Calculated");
    expect(facts.per_serving.calories).toBeNull();
  });

  it("holds partial NutritionValues", () => {
    const facts: NutritionFacts = {
      source: "ManuallyEntered",
      per_serving: {
        calories: 350,
        total_fat_g: 12.5,
        saturated_fat_g: null,
        cholesterol_mg: null,
        sodium_mg: null,
        total_carbs_g: null,
        dietary_fiber_g: null,
        total_sugars_g: null,
        protein_g: 20,
        vitamin_d_mcg: null,
        calcium_mg: null,
        iron_mg: null,
        potassium_mg: null,
      },
    };
    expect(facts.per_serving.calories).toBe(350);
    expect(facts.per_serving.protein_g).toBe(20);
    expect(facts.per_serving.total_fat_g).toBe(12.5);
  });
});

// ---------------------------------------------------------------------------
// §2.10 RecipeEngagementScore
// ---------------------------------------------------------------------------

describe("RecipeEngagementScore", () => {
  it("holds score, inputs, and references", () => {
    const inputs: EngagementScoreInputs = {
      save_clicks_30d: 120,
      sequence_triggers_30d: 5,
      card_views_30d: 800,
      purchase_attributions_all: 3,
    };
    const score: RecipeEngagementScore = {
      recipe_id: recipeId,
      creator_id: creatorId,
      score: 7.5,
      computed_at: 1000,
      inputs,
    };
    expect(score.score).toBe(7.5);
    expect(score.inputs.save_clicks_30d).toBe(120);
    expect(score.recipe_id).toBe(recipeId);
  });
});

// ---------------------------------------------------------------------------
// §2.11 Collection
// ---------------------------------------------------------------------------

describe("Collection", () => {
  it("holds ordered recipe_ids", () => {
    const r1 = createRecipeId("r-1");
    const r2 = createRecipeId("r-2");
    const collection: Collection = {
      id: createCollectionId("col-1"),
      creator_id: creatorId,
      name: "Weeknight Dinners",
      description: "Quick meals",
      recipe_ids: [r1, r2],
      created_at: 1000,
      updated_at: 2000,
    };
    expect(collection.recipe_ids).toHaveLength(2);
    expect(collection.recipe_ids[0]).toBe(r1);
    expect(collection.description).toBe("Quick meals");
  });
});

// ---------------------------------------------------------------------------
// §2.12 ImportStatus — discriminated union narrowing
// ---------------------------------------------------------------------------

describe("ImportStatus", () => {
  it("narrows Pending variant — only has source", () => {
    const source: ImportSource = { type: "FromUrl", url };
    const status: ImportStatus = { type: "Pending", source };
    if (status.type === "Pending") {
      expect(status.source.type).toBe("FromUrl");
    }
  });

  it("narrows Processing variant — has source and started_at", () => {
    const source: ImportSource = { type: "FromInstagramPost", url };
    const status: ImportStatus = {
      type: "Processing",
      source,
      started_at: 1000,
    };
    if (status.type === "Processing") {
      expect(status.started_at).toBe(1000);
      expect(status.source.type).toBe("FromInstagramPost");
    }
  });

  it("narrows NeedsReview variant — has source and extract", () => {
    const extract: RecipeExtract = {
      title: "Pasta",
      description: null,
      ingredients: [],
      instructions: ["Boil water"],
      timing: { prep_minutes: 5, cook_minutes: 10, total_minutes: 15 },
      yield: { quantity: 4, unit: "servings" },
      notes: null,
      photo_urls: [],
      dietary_tags: new Set(),
      confidence: { overall: 0.9, field_scores: { title: 0.99 } },
    };
    const source: ImportSource = { type: "FromUrl", url };
    const status: ImportStatus = { type: "NeedsReview", source, extract };
    if (status.type === "NeedsReview") {
      expect(status.extract.title).toBe("Pasta");
      expect(status.extract.confidence.overall).toBe(0.9);
    }
  });

  it("narrows Completed variant — has source and recipe_id", () => {
    const source: ImportSource = { type: "FromUrl", url };
    const status: ImportStatus = {
      type: "Completed",
      source,
      recipe_id: recipeId,
    };
    if (status.type === "Completed") {
      expect(status.recipe_id).toBe(recipeId);
    }
  });

  it("narrows Failed variant — has source and error", () => {
    const source: ImportSource = { type: "FromTikTokVideo", url };
    const error: ImportError = { type: "VideoTooLong", duration_seconds: 600 };
    const status: ImportStatus = { type: "Failed", source, error };
    if (status.type === "Failed") {
      if (status.error.type === "VideoTooLong") {
        expect(status.error.duration_seconds).toBe(600);
      }
    }
  });

  it("each variant carries only its associated data", () => {
    // We verify this structurally: Pending has no extract, Completed has no error.
    const pending: ImportStatus = {
      type: "Pending",
      source: { type: "FromUrl", url },
    };
    const completed: ImportStatus = {
      type: "Completed",
      source: { type: "FromUrl", url },
      recipe_id: recipeId,
    };

    // TypeScript ensures at compile-time that these properties don't exist
    // on the wrong variant. At runtime we verify the shapes.
    expect(Object.keys(pending)).toEqual(["type", "source"]);
    expect(Object.keys(completed)).toEqual(["type", "source", "recipe_id"]);
  });
});

describe("ImportSource", () => {
  it("covers all 7 variants", () => {
    const sources: ImportSource[] = [
      { type: "FromUrl", url },
      { type: "FromInstagramPost", url },
      { type: "FromTikTokVideo", url },
      { type: "FromYouTubeVideo", url },
      { type: "FromScreenshot", upload_id: "upl-1" },
      { type: "FromInstagramBulk", account_handle: "@chef" },
      { type: "FromWordPressSync", site_url: url },
    ];
    const types = sources.map((s) => s.type);
    expect(new Set(types).size).toBe(7);
  });
});

describe("ImportError", () => {
  it("covers all 6 variants", () => {
    const errors: ImportError[] = [
      { type: "FetchFailed", reason: "404" },
      { type: "ExtractionFailed", reason: "no recipe found" },
      { type: "VideoTooLong", duration_seconds: 3600 },
      { type: "FileTooLarge", size_bytes: 100_000_000 },
      { type: "WordPressAuthFailed" },
      { type: "Timeout" },
    ];
    const types = errors.map((e) => e.type);
    expect(new Set(types).size).toBe(6);
  });

  it("narrows FetchFailed to access reason", () => {
    const error: ImportError = { type: "FetchFailed", reason: "DNS error" };
    if (error.type === "FetchFailed") {
      expect(error.reason).toBe("DNS error");
    }
  });

  it("narrows FileTooLarge to access size_bytes", () => {
    const error: ImportError = { type: "FileTooLarge", size_bytes: 50_000_000 };
    if (error.type === "FileTooLarge") {
      expect(error.size_bytes).toBe(50_000_000);
    }
  });

  it("narrows data-less variants correctly", () => {
    const error: ImportError = { type: "Timeout" };
    if (error.type === "Timeout") {
      expect(Object.keys(error)).toEqual(["type"]);
    }
  });
});

describe("ImportJob", () => {
  it("assembles into a complete ImportJob", () => {
    const job: ImportJob = {
      id: createImportJobId("ij-1"),
      creator_id: creatorId,
      status: {
        type: "Pending",
        source: { type: "FromUrl", url },
      },
      created_at: 1000,
      updated_at: 1000,
    };
    expect(job.status.type).toBe("Pending");
    expect(job.id).toBe(createImportJobId("ij-1"));
  });
});

// ---------------------------------------------------------------------------
// §2.13 RecipeExtract
// ---------------------------------------------------------------------------

describe("RecipeExtract", () => {
  it("holds extracted recipe data with confidence", () => {
    const rawIngredient: RawIngredient = {
      raw_text: "2 cups all-purpose flour",
      quantity: wholeNumber(2),
      unit: "cups",
      item: "all-purpose flour",
      notes: null,
      confidence: 0.95,
    };
    const group: RawIngredientGroup = {
      label: null,
      ingredients: [rawIngredient],
    };
    const confidence: ExtractionConfidence = {
      overall: 0.88,
      field_scores: { title: 0.99, ingredients: 0.85 },
    };
    const extract: RecipeExtract = {
      title: "Chocolate Cake",
      description: "A rich chocolate cake",
      ingredients: [group],
      instructions: ["Mix dry ingredients", "Add wet ingredients", "Bake"],
      timing: { prep_minutes: 20, cook_minutes: 45, total_minutes: null },
      yield: { quantity: 12, unit: "servings" },
      notes: null,
      photo_urls: [url],
      dietary_tags: new Set(["Vegetarian"]),
      confidence,
    };
    expect(extract.title).toBe("Chocolate Cake");
    expect(extract.ingredients[0]!.ingredients[0]!.raw_text).toBe("2 cups all-purpose flour");
    expect(extract.confidence.field_scores["title"]).toBe(0.99);
    expect(extract.instructions).toHaveLength(3);
    expect(extract.photo_urls).toHaveLength(1);
  });

  it("handles all-null optional fields", () => {
    const extract: RecipeExtract = {
      title: null,
      description: null,
      ingredients: [],
      instructions: [],
      timing: { prep_minutes: null, cook_minutes: null, total_minutes: null },
      yield: null,
      notes: null,
      photo_urls: [],
      dietary_tags: new Set(),
      confidence: { overall: 0.1, field_scores: {} },
    };
    expect(extract.title).toBeNull();
    expect(extract.yield).toBeNull();
    expect(extract.dietary_tags.size).toBe(0);
  });

  it("RawIngredient can have null parsed fields", () => {
    const raw: RawIngredient = {
      raw_text: "a pinch of salt",
      quantity: null,
      unit: null,
      item: null,
      notes: null,
      confidence: 0.3,
    };
    expect(raw.quantity).toBeNull();
    expect(raw.item).toBeNull();
    expect(raw.confidence).toBe(0.3);
  });
});

// ---------------------------------------------------------------------------
// §2.14 Product — discriminated union narrowing
// ---------------------------------------------------------------------------

describe("Product", () => {
  it("narrows Ebook variant with EbookDetail", () => {
    const product: Product = {
      type: "Ebook",
      base: makeProductBase(),
      detail: {
        recipe_ids: [recipeId],
        chapters: [{ title: "Chapter 1", intro_copy: null, recipe_ids: [recipeId] }],
        intro_copy: "Welcome",
        author_bio: null,
        format: "LetterSize",
      },
    };
    if (product.type === "Ebook") {
      expect(product.detail.chapters).toHaveLength(1);
      expect(product.detail.format).toBe("LetterSize");
      expect(product.detail.intro_copy).toBe("Welcome");
    }
  });

  it("narrows MealPlan variant with MealPlanDetail", () => {
    const day: MealPlanDay = {
      day_number: 1,
      breakfast: recipeId,
      lunch: null,
      dinner: recipeId,
      snacks: [],
    };
    const product: Product = {
      type: "MealPlan",
      base: makeProductBase(),
      detail: {
        days: [day],
        shopping_list: null,
      },
    };
    if (product.type === "MealPlan") {
      expect(product.detail.days[0]!.day_number).toBe(1);
      expect(product.detail.days[0]!.breakfast).toBe(recipeId);
      expect(product.detail.shopping_list).toBeNull();
    }
  });

  it("narrows RecipeCardPack variant", () => {
    const product: Product = {
      type: "RecipeCardPack",
      base: makeProductBase(),
      recipe_ids: [recipeId],
    };
    if (product.type === "RecipeCardPack") {
      expect(product.recipe_ids).toHaveLength(1);
    }
  });

  it("narrows LeadMagnet variant with parent_product_id", () => {
    const product: Product = {
      type: "LeadMagnet",
      base: makeProductBase(),
      parent_product_id: productId,
      recipe_ids: [recipeId],
    };
    if (product.type === "LeadMagnet") {
      expect(product.parent_product_id).toBe(productId);
      expect(product.recipe_ids).toHaveLength(1);
    }
  });

  it("each variant carries only its associated data", () => {
    const ebook: Product = {
      type: "Ebook",
      base: makeProductBase(),
      detail: {
        recipe_ids: [],
        chapters: [],
        intro_copy: null,
        author_bio: null,
        format: "TradeSize",
      },
    };
    const cardPack: Product = {
      type: "RecipeCardPack",
      base: makeProductBase(),
      recipe_ids: [],
    };

    // Ebook has "detail" but not "recipe_ids" (at the Product level)
    expect(Object.keys(ebook)).toEqual(["type", "base", "detail"]);
    // RecipeCardPack has "recipe_ids" but not "detail"
    expect(Object.keys(cardPack)).toEqual(["type", "base", "recipe_ids"]);
  });

  it("MealPlanDetail can include a ShoppingList", () => {
    const shoppingItem: ShoppingItem = {
      quantity: fraction(1, 2),
      unit: "cup",
      item: "olive oil",
      recipe_refs: [recipeId],
    };
    const section: ShoppingSection = {
      label: "Pantry",
      items: [shoppingItem],
    };
    const shoppingList: ShoppingList = {
      sections: [section],
      generated_at: 5000,
    };
    const detail: MealPlanDetail = {
      days: [],
      shopping_list: shoppingList,
    };
    expect(detail.shopping_list!.sections[0]!.items[0]!.item).toBe("olive oil");
    expect(detail.shopping_list!.generated_at).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// §2.15 PublishedListing
// ---------------------------------------------------------------------------

describe("PublishedListing", () => {
  it("holds platform listing data with optional fields", () => {
    const listing: PublishedListing = {
      platform: "StanStore",
      listing_url: url,
      platform_id: "stan-123",
      published_at: 3000,
    };
    expect(listing.platform).toBe("StanStore");
    expect(listing.listing_url).toBe(url);
  });

  it("allows null listing_url and platform_id", () => {
    const listing: PublishedListing = {
      platform: "Gumroad",
      listing_url: null,
      platform_id: null,
      published_at: 3000,
    };
    expect(listing.listing_url).toBeNull();
    expect(listing.platform_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §2.16 EngagementEventType — discriminated union narrowing
// ---------------------------------------------------------------------------

describe("EngagementEventType", () => {
  it("narrows SaveClick — no associated data", () => {
    const event: EngagementEventType = { type: "SaveClick" };
    if (event.type === "SaveClick") {
      expect(Object.keys(event)).toEqual(["type"]);
    }
  });

  it("narrows CardView — no associated data", () => {
    const event: EngagementEventType = { type: "CardView" };
    if (event.type === "CardView") {
      expect(Object.keys(event)).toEqual(["type"]);
    }
  });

  it("narrows SequenceTrigger — no associated data", () => {
    const event: EngagementEventType = { type: "SequenceTrigger" };
    if (event.type === "SequenceTrigger") {
      expect(Object.keys(event)).toEqual(["type"]);
    }
  });

  it("narrows PurchaseAttribution — carries product_id", () => {
    const event: EngagementEventType = {
      type: "PurchaseAttribution",
      product_id: productId,
    };
    if (event.type === "PurchaseAttribution") {
      expect(event.product_id).toBe(productId);
    }
  });

  it("PurchaseAttribution is the only variant with product_id", () => {
    const events: EngagementEventType[] = [
      { type: "SaveClick" },
      { type: "CardView" },
      { type: "SequenceTrigger" },
      { type: "PurchaseAttribution", product_id: productId },
    ];

    for (const event of events) {
      if (event.type === "PurchaseAttribution") {
        expect("product_id" in event).toBe(true);
      } else {
        expect("product_id" in event).toBe(false);
      }
    }
  });
});

describe("RecipeEngagementEvent", () => {
  it("assembles a complete event record", () => {
    const event: RecipeEngagementEvent = {
      id: createEventId("ev-1"),
      creator_id: creatorId,
      recipe_id: recipeId,
      event: { type: "SaveClick" },
      kit_subscriber_id: createKitSubscriberId("ks-1"),
      source: "KitWebhook",
      occurred_at: 4000,
    };
    expect(event.event.type).toBe("SaveClick");
    expect(event.kit_subscriber_id).toBe(createKitSubscriberId("ks-1"));
    expect(event.source).toBe("KitWebhook");
  });

  it("allows null kit_subscriber_id", () => {
    const event: RecipeEngagementEvent = {
      id: createEventId("ev-2"),
      creator_id: creatorId,
      recipe_id: recipeId,
      event: { type: "CardView" },
      kit_subscriber_id: null,
      source: "Internal",
      occurred_at: 5000,
    };
    expect(event.kit_subscriber_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §2.17 SegmentProfile
// ---------------------------------------------------------------------------

describe("SegmentProfile", () => {
  it("holds a map of DietaryTag to SegmentStat", () => {
    const stat: SegmentStat = {
      subscriber_count: 1200,
      engagement_rate: 0.15,
      growth_rate_30d: 0.05,
      top_recipe_ids: [recipeId],
    };
    const profile: SegmentProfile = {
      creator_id: creatorId,
      computed_at: 6000,
      segments: new Map([["GlutenFree", stat]]),
    };
    expect(profile.segments.get("GlutenFree")!.subscriber_count).toBe(1200);
    expect(profile.segments.get("GlutenFree")!.top_recipe_ids).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// §2.18 KitSubscriberRecord
// ---------------------------------------------------------------------------

describe("KitSubscriberRecord", () => {
  it("is an ephemeral value type with all fields", () => {
    const record: KitSubscriberRecord = {
      id: createKitSubscriberId("ks-1"),
      email: "test@example.com",
      first_name: "Jane",
      tags: new Set(["vegan", "meal-prep"]),
      custom_fields: new Map([["preference", "vegan"]]),
      state: "Active",
    };
    expect(record.email).toBe("test@example.com");
    expect(record.tags.has("vegan")).toBe(true);
    expect(record.custom_fields.get("preference")).toBe("vegan");
    expect(record.state).toBe("Active");
  });

  it("allows null first_name", () => {
    const record: KitSubscriberRecord = {
      id: createKitSubscriberId("ks-2"),
      email: "anon@example.com",
      first_name: null,
      tags: new Set(),
      custom_fields: new Map(),
      state: "Inactive",
    };
    expect(record.first_name).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §2.19 TeamMember
// ---------------------------------------------------------------------------

describe("TeamMember", () => {
  it("holds all fields including optional accepted_at", () => {
    const member: TeamMember = {
      id: createTeamMemberId("tm-1"),
      creator_id: creatorId,
      email: "teammate@example.com",
      role: "Member",
      invited_at: 7000,
      accepted_at: 8000,
    };
    expect(member.role).toBe("Member");
    expect(member.accepted_at).toBe(8000);
  });

  it("allows null accepted_at for pending invitations", () => {
    const member: TeamMember = {
      id: createTeamMemberId("tm-2"),
      creator_id: creatorId,
      email: "pending@example.com",
      role: "Member",
      invited_at: 7000,
      accepted_at: null,
    };
    expect(member.accepted_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §2.4 Recipe — full entity
// ---------------------------------------------------------------------------

describe("Recipe", () => {
  it("assembles the full Recipe type from all pieces", () => {
    const recipe: Recipe = {
      id: recipeId,
      creator_id: creatorId,
      title: "Chocolate Chip Cookies",
      slug: createSlug("chocolate-chip-cookies")!,
      description: "Classic cookies",
      source: { type: "Manual" },
      status: "Active",
      email_ready: true,
      timing: { prep_minutes: 15, cook_minutes: 12, total_minutes: null },
      yield: { quantity: 24, unit: "cookies" },
      ingredients: [
        {
          label: null,
          ingredients: [
            {
              id: "ing-1" as IngredientId,
              quantity: wholeNumber(2),
              unit: "cups",
              item: "flour",
              notes: null,
            },
          ],
        },
      ],
      instructions: [
        {
          label: null,
          instructions: [
            {
              id: "ins-1" as InstructionId,
              body: "Mix ingredients",
            },
          ],
        },
      ],
      notes: "Best served warm",
      photos: [],
      classification: {
        dietary: { type: "Confirmed", tags: new Set(["Vegetarian"]) },
        cuisine: "American",
        meal_types: new Set(["Dessert"]),
        seasons: new Set(),
      },
      nutrition: null,
      collection_ids: new Set([createCollectionId("col-1")]),
      created_at: 1000,
      updated_at: 2000,
    };
    expect(recipe.title).toBe("Chocolate Chip Cookies");
    expect(recipe.status).toBe("Active");
    expect(recipe.email_ready).toBe(true);
    expect(recipe.ingredients[0]!.ingredients[0]!.item).toBe("flour");
    expect(recipe.collection_ids.has(createCollectionId("col-1"))).toBe(true);
  });
});
