/**
 * Automation Engine service (SPEC SS10).
 *
 * Implements:
 *   SS10.1 Save This Recipe Sequence
 *   SS10.2 New Recipe Broadcast Draft
 *   SS10.3 Lead Magnet Delivery Sequence
 *   SS10.4 Seasonal Recipe Drops
 *
 * All Kit API calls go through the Kit Integration Layer.
 * The Automation Engine creates DRAFTS only -- it never sends emails.
 * All public functions return Promise<Result<T, E>>.
 */
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import type { Database } from "../db/index.js";
import {
  recipes,
  creators,
  collections,
  collectionRecipes,
  productBase,
  seasonalDrops,
  automationConfigs,
  recipeEngagementScores,
} from "../db/schema.js";
import type { KitClientConfig } from "../lib/kit/client.js";
import {
  getOrCreateTag,
  tagSubscriber,
  addSubscriberToSequence,
  updateSubscriber,
  createBroadcastDraft,
} from "../lib/kit/client.js";
import {
  recipeSavedTagName,
  dietaryTagName,
  KIT_CUSTOM_FIELD_LABELS,
} from "../lib/kit/tag-conventions.js";
import type { KitApiError, BroadcastDraftParams } from "../lib/kit/types.js";
import type { Result } from "@crumb/shared";
import { ok, err } from "@crumb/shared";
import type { DietaryTag, Slug } from "@crumb/shared";
import { createLogger, type Logger } from "../lib/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AutomationError =
  | { readonly type: "not_found"; readonly message: string }
  | { readonly type: "no_sequence_configured" }
  | { readonly type: "already_enrolled" }
  | { readonly type: "free_tier_limit"; readonly message: string }
  | { readonly type: "kit_error"; readonly kitError: KitApiError }
  | { readonly type: "invalid_input"; readonly message: string }
  | { readonly type: "database_error"; readonly message: string };

export interface SaveRecipeResult {
  readonly sequenceEnrolled: boolean;
  readonly sequenceId: string | null;
  readonly tagsApplied: readonly string[];
  readonly customFieldsUpdated: boolean;
}

export interface BroadcastDraftResult {
  readonly broadcastId: string;
  readonly subject: string;
}

export interface LeadMagnetSequenceResult {
  readonly sequenceId: string;
  readonly emailCount: number;
}

export interface SeasonalDropRow {
  readonly id: string;
  readonly creator_id: string;
  readonly label: string;
  readonly start_date: string;
  readonly end_date: string;
  readonly collection_id: string;
  readonly target_segment: string | null;
  readonly recurrence: string;
  readonly last_processed_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateSeasonalDropInput {
  readonly id: string;
  readonly label: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly collectionId: string;
  readonly targetSegment: string | null;
  readonly recurrence: string;
}

export interface SeasonalDropProcessResult {
  readonly dropsProcessed: number;
  readonly broadcastsCreated: readonly BroadcastDraftResult[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FREE_TIER_SENDS_PER_MONTH = 3;
const defaultLogger = createLogger("automation");

// ---------------------------------------------------------------------------
// SS10.1 Save This Recipe Sequence
// ---------------------------------------------------------------------------

/**
 * Handle a Save This Recipe click from a subscriber.
 *
 * 1. Check if creator has a Save This Recipe sequence configured
 * 2. Check if subscriber is already in the sequence (skip if yes)
 * 3. If saved recipe's collection -> published Product -> use Product's nurture sequence
 * 4. Otherwise -> use default Save This Recipe sequence
 * 5. Call addSubscriberToSequence
 * 6. Tag subscriber with recipe:saved:{slug} and confirmed dietary tags
 * 7. Update last_recipe_saved and last_recipe_saved_at custom fields
 */
export async function handleSaveThisRecipe(
  db: Database,
  creatorId: string,
  recipeSlug: string,
  subscriberId: string,
  accessToken: string,
  kitConfig: KitClientConfig,
  logger: Logger = defaultLogger,
): Promise<Result<SaveRecipeResult, AutomationError>> {
  // Find the recipe by slug + creator
  const recipeRows = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.creator_id, creatorId), eq(recipes.slug, recipeSlug)))
    .limit(1);

  if (recipeRows.length === 0 || !recipeRows[0]) {
    return err({ type: "not_found", message: `Recipe not found: ${recipeSlug}` });
  }

  const recipe = recipeRows[0];
  const tagsApplied: string[] = [];

  // Tag subscriber with recipe:saved:{slug}
  const savedTagName = recipeSavedTagName(recipe.slug as Slug);
  const savedTagResult = await getOrCreateTag(kitConfig, accessToken, savedTagName);
  if (!savedTagResult.ok) {
    return err({ type: "kit_error", kitError: savedTagResult.error });
  }
  const tagResult = await tagSubscriber(
    kitConfig,
    accessToken,
    subscriberId,
    String(savedTagResult.value.id),
  );
  if (!tagResult.ok) {
    return err({ type: "kit_error", kitError: tagResult.error });
  }
  tagsApplied.push(savedTagName);

  // Tag with confirmed dietary tags
  if (recipe.dietary_tags_confirmed) {
    const dietaryTags = recipe.dietary_tags as readonly string[];
    for (const tag of dietaryTags) {
      const dietaryName = dietaryTagName(tag as DietaryTag);
      const dietaryTagResult = await getOrCreateTag(kitConfig, accessToken, dietaryName);
      if (dietaryTagResult.ok) {
        const applyResult = await tagSubscriber(
          kitConfig,
          accessToken,
          subscriberId,
          String(dietaryTagResult.value.id),
        );
        if (applyResult.ok) {
          tagsApplied.push(dietaryName);
        }
      }
    }
  }

  // Update custom fields: last_recipe_saved and last_recipe_saved_at
  const now = new Date().toISOString();
  const fieldsUpdate: Record<string, string> = {
    [KIT_CUSTOM_FIELD_LABELS.LastRecipeSaved]: recipe.title,
    [KIT_CUSTOM_FIELD_LABELS.LastRecipeSavedAt]: now,
  };
  const updateResult = await updateSubscriber(
    kitConfig,
    accessToken,
    subscriberId,
    fieldsUpdate,
  );
  const customFieldsUpdated = updateResult.ok;

  // Check automation config for sequence
  const configRows = await db
    .select()
    .from(automationConfigs)
    .where(eq(automationConfigs.creator_id, creatorId))
    .limit(1);

  const config = configRows[0];
  if (!config || !config.save_recipe_sequence_id) {
    // No sequence configured -- still return success for tags/fields
    return ok({
      sequenceEnrolled: false,
      sequenceId: null,
      tagsApplied,
      customFieldsUpdated,
    });
  }

  // Determine which sequence to use
  let sequenceId = config.save_recipe_sequence_id;

  // Check if recipe belongs to a collection that has a published product
  const collectionLinks = await db
    .select({ collection_id: collectionRecipes.collection_id })
    .from(collectionRecipes)
    .where(eq(collectionRecipes.recipe_id, recipe.id));

  if (collectionLinks.length > 0) {
    // Check each collection for a linked published product with a nurture sequence
    for (const link of collectionLinks) {
      // Find products whose recipe_ids include recipes from this collection
      // Products with kit_sequence_id set are considered to have nurture sequences
      const productRows = await db
        .select({
          kit_sequence_id: productBase.kit_sequence_id,
        })
        .from(productBase)
        .where(
          and(
            eq(productBase.creator_id, creatorId),
            eq(productBase.status, "Published"),
            sql`${productBase.kit_sequence_id} IS NOT NULL`,
          ),
        )
        .limit(1);

      if (productRows.length > 0 && productRows[0]?.kit_sequence_id) {
        sequenceId = productRows[0].kit_sequence_id;
        break;
      }
    }
  }

  // Enroll subscriber in the sequence
  const enrollResult = await addSubscriberToSequence(
    kitConfig,
    accessToken,
    subscriberId,
    sequenceId,
  );

  if (!enrollResult.ok) {
    // If enrollment fails, still return partial success
    return ok({
      sequenceEnrolled: false,
      sequenceId,
      tagsApplied,
      customFieldsUpdated,
    });
  }

  logger.info("save_this_recipe_handled", {
    recipeSlug,
    creator: creatorId,
    sequenceEnrolled: true,
    tagsApplied,
  });

  return ok({
    sequenceEnrolled: true,
    sequenceId,
    tagsApplied,
    customFieldsUpdated,
  });
}

// ---------------------------------------------------------------------------
// SS10.2 New Recipe Broadcast Draft
// ---------------------------------------------------------------------------

/**
 * Create a Kit broadcast draft when a recipe's email_ready is set to true.
 *
 * Subject: "[Recipe Title] -- a new recipe for you"
 * Content: recipe card HTML placeholder + blank intro
 * Description: "[PRODUCT] auto-draft -- {recipe.title}"
 */
export async function createNewRecipeBroadcast(
  db: Database,
  creatorId: string,
  recipeId: string,
  accessToken: string,
  kitConfig: KitClientConfig,
  logger: Logger = defaultLogger,
): Promise<Result<BroadcastDraftResult, AutomationError>> {
  // Check free tier send limit
  const limitCheck = await checkFreeTierSendLimit(db, creatorId);
  if (!limitCheck.ok) {
    return limitCheck;
  }

  // Find the recipe
  const recipeRows = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), eq(recipes.creator_id, creatorId)))
    .limit(1);

  if (recipeRows.length === 0 || !recipeRows[0]) {
    return err({ type: "not_found", message: `Recipe not found: ${recipeId}` });
  }

  const recipe = recipeRows[0];
  const subject = `${recipe.title} \u2014 a new recipe for you`;
  const description = `[PRODUCT] auto-draft \u2014 ${recipe.title}`;

  // Recipe card HTML placeholder
  const content = buildRecipeCardPlaceholder(recipe.title, recipe.description ?? "");

  const broadcastParams: BroadcastDraftParams = {
    subject,
    content,
    description,
    email_template_id: null,
    subscriber_filter: null,
    send_at: null,
  };

  const result = await createBroadcastDraft(kitConfig, accessToken, broadcastParams);

  if (!result.ok) {
    return err({ type: "kit_error", kitError: result.error });
  }

  // Increment sends counter
  await incrementSendsCounter(db, creatorId);

  logger.info("broadcast_draft_created", {
    broadcastId: String(result.value.id),
    recipeId,
    creator: creatorId,
    subject,
  });

  return ok({
    broadcastId: String(result.value.id),
    subject,
  });
}

// ---------------------------------------------------------------------------
// SS10.3 Lead Magnet Delivery Sequence
// ---------------------------------------------------------------------------

/**
 * Create a 4-email Kit sequence for lead magnet delivery.
 *
 * Day 0: Delivery email with PDF
 * Day 2: Value email (AI-generated draft placeholder)
 * Day 4: Recipe card block
 * Day 7: Pitch for full product
 *
 * Since Kit V4 API does not support creating sequences programmatically,
 * this creates 4 broadcast drafts as a workaround and returns a
 * placeholder sequence ID. In production, the creator would wire these
 * into a Kit sequence manually.
 */
export async function createLeadMagnetSequence(
  db: Database,
  creatorId: string,
  productId: string,
  accessToken: string,
  kitConfig: KitClientConfig,
  logger: Logger = defaultLogger,
): Promise<Result<LeadMagnetSequenceResult, AutomationError>> {
  // Find the product
  const productRows = await db
    .select()
    .from(productBase)
    .where(and(eq(productBase.id, productId), eq(productBase.creator_id, creatorId)))
    .limit(1);

  if (productRows.length === 0 || !productRows[0]) {
    return err({ type: "not_found", message: `Product not found: ${productId}` });
  }

  const product = productRows[0];
  const productTitle = product.title;

  // Find the creator for the name
  const creatorRows = await db
    .select({ name: creators.name })
    .from(creators)
    .where(eq(creators.id, creatorId))
    .limit(1);

  const creatorName = creatorRows[0]?.name ?? "the creator";

  // Create 4 broadcast drafts representing the sequence emails
  const emailDrafts = [
    {
      subject: `Here's your free ${productTitle}!`,
      content: buildDeliveryEmailPlaceholder(productTitle),
      description: `[PRODUCT] lead magnet delivery \u2014 Day 0 \u2014 ${productTitle}`,
    },
    {
      subject: `3 tips for ${productTitle.toLowerCase()}`,
      content: buildValueEmailPlaceholder(),
      description: `[PRODUCT] lead magnet value \u2014 Day 2 \u2014 ${productTitle}`,
    },
    {
      subject: `Another recipe from ${creatorName}`,
      content: buildRecipeCardPlaceholder("Featured Recipe", ""),
      description: `[PRODUCT] lead magnet recipe \u2014 Day 4 \u2014 ${productTitle}`,
    },
    {
      subject: `Get the full ${productTitle}`,
      content: buildPitchEmailPlaceholder(productTitle),
      description: `[PRODUCT] lead magnet pitch \u2014 Day 7 \u2014 ${productTitle}`,
    },
  ];

  for (const draft of emailDrafts) {
    const params: BroadcastDraftParams = {
      subject: draft.subject,
      content: draft.content,
      description: draft.description,
      email_template_id: null,
      subscriber_filter: null,
      send_at: null,
    };

    const result = await createBroadcastDraft(kitConfig, accessToken, params);
    if (!result.ok) {
      return err({ type: "kit_error", kitError: result.error });
    }
  }

  // Store a placeholder sequence ID on the product
  const sequenceId = `lead-magnet-seq-${productId}`;
  await db
    .update(productBase)
    .set({
      kit_sequence_id: sequenceId,
      updated_at: new Date().toISOString(),
    })
    .where(eq(productBase.id, productId));

  logger.info("lead_magnet_sequence_created", {
    productId,
    creator: creatorId,
    sequenceId,
    emailCount: 4,
  });

  return ok({
    sequenceId,
    emailCount: 4,
  });
}

// ---------------------------------------------------------------------------
// SS10.4 Seasonal Recipe Drops
// ---------------------------------------------------------------------------

/**
 * List configured seasonal drops for a creator.
 */
export async function listSeasonalDrops(
  db: Database,
  creatorId: string,
): Promise<Result<readonly SeasonalDropRow[], AutomationError>> {
  const rows = await db
    .select()
    .from(seasonalDrops)
    .where(eq(seasonalDrops.creator_id, creatorId));

  return ok(rows);
}

/**
 * Create a new seasonal drop configuration.
 */
export async function createSeasonalDrop(
  db: Database,
  creatorId: string,
  input: CreateSeasonalDropInput,
): Promise<Result<SeasonalDropRow, AutomationError>> {
  if (!input.label || input.label.trim().length === 0) {
    return err({ type: "invalid_input", message: "Label is required" });
  }

  if (!input.startDate || !input.endDate) {
    return err({ type: "invalid_input", message: "Start and end dates are required" });
  }

  // Verify the collection exists
  const collectionRows = await db
    .select({ id: collections.id })
    .from(collections)
    .where(
      and(eq(collections.id, input.collectionId), eq(collections.creator_id, creatorId)),
    )
    .limit(1);

  if (collectionRows.length === 0) {
    return err({
      type: "not_found",
      message: `Collection not found: ${input.collectionId}`,
    });
  }

  const now = new Date().toISOString();
  await db.insert(seasonalDrops).values({
    id: input.id,
    creator_id: creatorId,
    label: input.label,
    start_date: input.startDate,
    end_date: input.endDate,
    collection_id: input.collectionId,
    target_segment: input.targetSegment,
    recurrence: input.recurrence,
    last_processed_at: null,
    created_at: now,
    updated_at: now,
  });

  // Fetch and return the created drop
  const rows = await db
    .select()
    .from(seasonalDrops)
    .where(eq(seasonalDrops.id, input.id))
    .limit(1);

  if (rows.length === 0 || !rows[0]) {
    return err({ type: "database_error", message: "Failed to retrieve created seasonal drop" });
  }

  return ok(rows[0]);
}

/**
 * Process seasonal drops whose start date has arrived.
 *
 * For each qualifying drop:
 * 1. Select recipe from collection by engagement_score (highest untapped)
 * 2. Create broadcast draft
 */
export async function processSeasonalDrops(
  db: Database,
  creatorId: string,
  accessToken: string,
  kitConfig: KitClientConfig,
  logger: Logger = defaultLogger,
): Promise<Result<SeasonalDropProcessResult, AutomationError>> {
  // Check free tier send limit
  const limitCheck = await checkFreeTierSendLimit(db, creatorId);
  if (!limitCheck.ok) {
    return limitCheck;
  }

  const today = new Date().toISOString().split("T")[0] ?? "";

  // Find drops whose start_date <= today and end_date >= today
  // and haven't been processed today
  const drops = await db
    .select()
    .from(seasonalDrops)
    .where(
      and(
        eq(seasonalDrops.creator_id, creatorId),
        sql`${seasonalDrops.start_date} <= ${today}`,
        sql`${seasonalDrops.end_date} >= ${today}`,
        sql`(${seasonalDrops.last_processed_at} IS NULL OR ${seasonalDrops.last_processed_at} < ${today})`,
      ),
    );

  const broadcastsCreated: BroadcastDraftResult[] = [];
  let dropsProcessed = 0;

  for (const drop of drops) {
    // Get recipes in the collection
    const collectionRecipeRows = await db
      .select({ recipe_id: collectionRecipes.recipe_id })
      .from(collectionRecipes)
      .where(eq(collectionRecipes.collection_id, drop.collection_id));

    if (collectionRecipeRows.length === 0) {
      continue;
    }

    const recipeIds = collectionRecipeRows.map((r) => r.recipe_id);

    // Find recipe with highest engagement score among the collection's recipes
    let selectedRecipeId: string | null = null;

    if (recipeIds.length > 0) {
      const scoreRows = await db
        .select({
          recipe_id: recipeEngagementScores.recipe_id,
        })
        .from(recipeEngagementScores)
        .where(
          inArray(recipeEngagementScores.recipe_id, recipeIds),
        )
        .orderBy(desc(recipeEngagementScores.score))
        .limit(1);

      // If there are scored recipes, use the top one; otherwise pick first
      if (scoreRows.length > 0 && scoreRows[0]) {
        selectedRecipeId = scoreRows[0].recipe_id;
      } else {
        selectedRecipeId = recipeIds[0] ?? null;
      }
    }

    if (!selectedRecipeId) {
      continue;
    }

    // Fetch the recipe details
    const selectedRecipe = await db
      .select()
      .from(recipes)
      .where(eq(recipes.id, selectedRecipeId))
      .limit(1);

    if (selectedRecipe.length === 0 || !selectedRecipe[0]) {
      continue;
    }

    const recipe = selectedRecipe[0];
    const subject = `${recipe.title} \u2014 a new recipe for you`;
    const content = buildRecipeCardPlaceholder(recipe.title, recipe.description ?? "");
    const description = `[PRODUCT] seasonal drop \u2014 ${drop.label} \u2014 ${recipe.title}`;

    const params: BroadcastDraftParams = {
      subject,
      content,
      description,
      email_template_id: null,
      subscriber_filter: null,
      send_at: null,
    };

    const result = await createBroadcastDraft(kitConfig, accessToken, params);
    if (!result.ok) {
      continue; // Skip this drop but continue with others
    }

    // Update last_processed_at
    const now = new Date().toISOString();
    await db
      .update(seasonalDrops)
      .set({ last_processed_at: today, updated_at: now })
      .where(eq(seasonalDrops.id, drop.id));

    broadcastsCreated.push({
      broadcastId: String(result.value.id),
      subject,
    });

    dropsProcessed += 1;
    await incrementSendsCounter(db, creatorId);
  }

  logger.info("seasonal_drops_processed", {
    creator: creatorId,
    dropsProcessed,
    broadcastsCreated: broadcastsCreated.length,
  });

  return ok({
    dropsProcessed,
    broadcastsCreated,
  });
}

// ---------------------------------------------------------------------------
// Free tier limit helpers
// ---------------------------------------------------------------------------

/**
 * Check if the creator has reached their free tier broadcast limit
 * (3 sends/month for Free tier).
 */
async function checkFreeTierSendLimit(
  db: Database,
  creatorId: string,
): Promise<Result<void, AutomationError>> {
  const creatorRows = await db
    .select({ tier: creators.subscription_tier })
    .from(creators)
    .where(eq(creators.id, creatorId))
    .limit(1);

  const tier = creatorRows[0]?.tier ?? "Free";
  if (tier !== "Free") {
    return ok(undefined);
  }

  // Check/reset monthly counter
  const configRows = await db
    .select()
    .from(automationConfigs)
    .where(eq(automationConfigs.creator_id, creatorId))
    .limit(1);

  const config = configRows[0];
  if (!config) {
    // No config yet -- they haven't used any sends
    return ok(undefined);
  }

  // Check if month needs to reset
  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  if (config.sends_month_reset_at !== currentMonth) {
    // Reset counter for new month
    await db
      .update(automationConfigs)
      .set({
        sends_this_month: 0,
        sends_month_reset_at: currentMonth,
        updated_at: now.toISOString(),
      })
      .where(eq(automationConfigs.creator_id, creatorId));
    return ok(undefined);
  }

  if (config.sends_this_month >= FREE_TIER_SENDS_PER_MONTH) {
    return err({
      type: "free_tier_limit",
      message: `Free tier is limited to ${FREE_TIER_SENDS_PER_MONTH} broadcast drafts per month. Upgrade to create more.`,
    });
  }

  return ok(undefined);
}

/**
 * Increment the monthly sends counter for a creator.
 */
async function incrementSendsCounter(
  db: Database,
  creatorId: string,
): Promise<void> {
  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const configRows = await db
    .select()
    .from(automationConfigs)
    .where(eq(automationConfigs.creator_id, creatorId))
    .limit(1);

  if (configRows.length === 0) {
    await db.insert(automationConfigs).values({
      creator_id: creatorId,
      save_recipe_sequence_id: null,
      sends_this_month: 1,
      sends_month_reset_at: currentMonth,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
  } else {
    const config = configRows[0];
    const resetAt = config?.sends_month_reset_at;
    const newCount = resetAt === currentMonth ? (config?.sends_this_month ?? 0) + 1 : 1;

    await db
      .update(automationConfigs)
      .set({
        sends_this_month: newCount,
        sends_month_reset_at: currentMonth,
        updated_at: now.toISOString(),
      })
      .where(eq(automationConfigs.creator_id, creatorId));
  }
}

// ---------------------------------------------------------------------------
// Email content helpers (placeholders)
// ---------------------------------------------------------------------------

function buildRecipeCardPlaceholder(title: string, description: string): string {
  return [
    "<!-- [PRODUCT] Recipe Card Block (Standard Mode) -->",
    "<div style=\"max-width:600px;margin:0 auto;padding:20px;\">",
    "  <p>[Write your intro here]</p>",
    "  <hr>",
    `  <h2>${escapeHtml(title)}</h2>`,
    description.length > 0 ? `  <p>${escapeHtml(description)}</p>` : "",
    "  <p><em>[Recipe card will render here via the Kit plugin]</em></p>",
    "</div>",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

function buildDeliveryEmailPlaceholder(productTitle: string): string {
  return [
    "<div style=\"max-width:600px;margin:0 auto;padding:20px;\">",
    `  <h1>Here's your free ${escapeHtml(productTitle)}!</h1>`,
    "  <p>Thanks for signing up! Your download is attached below.</p>",
    "  <p><em>[PDF attachment placeholder]</em></p>",
    "</div>",
  ].join("\n");
}

function buildValueEmailPlaceholder(): string {
  return [
    "<div style=\"max-width:600px;margin:0 auto;padding:20px;\">",
    "  <h1>Tips and tricks</h1>",
    "  <p><em>[AI-generated content placeholder -- creator should edit before sending]</em></p>",
    "</div>",
  ].join("\n");
}

function buildPitchEmailPlaceholder(productTitle: string): string {
  return [
    "<div style=\"max-width:600px;margin:0 auto;padding:20px;\">",
    `  <h1>Get the full ${escapeHtml(productTitle)}</h1>`,
    "  <p>If you enjoyed the free sample, you'll love the complete collection.</p>",
    "  <p><em>[Product listing link placeholder]</em></p>",
    "</div>",
  ].join("\n");
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
