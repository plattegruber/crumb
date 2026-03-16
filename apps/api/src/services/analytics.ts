/**
 * Analytics Engine service (SPEC 11).
 *
 * Event Ingestion (11.1), Engagement Score Computation (11.2),
 * Product Recommendation Engine (11.3), and Revenue Attribution (11.4).
 *
 * All public functions return Promise<Result<T, E>>.
 * RecipeEngagementEvent records are append-only (invariant 7).
 */
import { eq, and, sql, gte } from "drizzle-orm";
import type { Database } from "../db/index.js";
import {
  recipeEngagementEvents,
  recipeEngagementScores,
  recipes,
  segmentProfiles,
  productBase,
  ebookDetails,
  recipeCardPacks,
} from "../db/schema.js";
import type { Result } from "@crumb/shared";
import { ok, err } from "@crumb/shared";
import { createLogger, type Logger } from "../lib/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The four event types defined in SPEC 2.16. */
export const ENGAGEMENT_EVENT_TYPE = {
  SaveClick: "SaveClick",
  CardView: "CardView",
  SequenceTrigger: "SequenceTrigger",
  PurchaseAttribution: "PurchaseAttribution",
} as const;

export type EngagementEventTypeName =
  (typeof ENGAGEMENT_EVENT_TYPE)[keyof typeof ENGAGEMENT_EVENT_TYPE];

export interface RecordEngagementEventInput {
  readonly id: string;
  readonly creatorId: string;
  readonly recipeId: string;
  readonly eventType: EngagementEventTypeName;
  readonly eventData: Record<string, unknown> | null;
  readonly kitSubscriberId: string | null;
  readonly source: string;
  readonly occurredAt: string; // ISO 8601
}

export interface EngagementScoreRow {
  readonly recipe_id: string;
  readonly creator_id: string;
  readonly score: number;
  readonly computed_at: string;
  readonly save_clicks_30d: number;
  readonly sequence_triggers_30d: number;
  readonly card_views_30d: number;
  readonly purchase_attributions_all: number;
}

export interface ProductRecommendation {
  readonly dietaryTag: string;
  readonly subscriberCount: number;
  readonly engagementRate: number;
  readonly recipeCount: number;
  readonly avgScore: number;
  readonly message: string;
}

export type AnalyticsError =
  | { readonly type: "not_found" }
  | { readonly type: "database_error"; readonly message: string }
  | { readonly type: "duplicate_event" };

const defaultLogger = createLogger("analytics");

// ---------------------------------------------------------------------------
// Privacy helper: hash subscriber IDs for aggregate views
// ---------------------------------------------------------------------------

export async function hashSubscriberId(subscriberId: string): Promise<string> {
  const encoded = new TextEncoder().encode(subscriberId);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = new Uint8Array(hashBuffer);
  let hex = "";
  for (let i = 0; i < hashArray.length; i++) {
    hex += (hashArray[i] as number).toString(16).padStart(2, "0");
  }
  return hex;
}

// ---------------------------------------------------------------------------
// 11.1 Event Ingestion
// ---------------------------------------------------------------------------

/**
 * Record an engagement event (append-only insert).
 *
 * Idempotent: if an event with the same ID already exists, returns
 * a duplicate_event error rather than inserting a duplicate.
 */
export async function recordEngagementEvent(
  db: Database,
  input: RecordEngagementEventInput,
  logger: Logger = defaultLogger,
): Promise<Result<{ readonly id: string }, AnalyticsError>> {
  // Check for existing event (idempotent duplicate handling)
  const existing = await db
    .select({ id: recipeEngagementEvents.id })
    .from(recipeEngagementEvents)
    .where(eq(recipeEngagementEvents.id, input.id))
    .limit(1);

  if (existing.length > 0) {
    return err({ type: "duplicate_event" });
  }

  // Hash subscriber ID for privacy if provided
  const hashedSubscriberId =
    input.kitSubscriberId !== null
      ? await hashSubscriberId(input.kitSubscriberId)
      : null;

  await db.insert(recipeEngagementEvents).values({
    id: input.id,
    creator_id: input.creatorId,
    recipe_id: input.recipeId,
    event_type: input.eventType,
    event_data: input.eventData,
    kit_subscriber_id: hashedSubscriberId,
    source: input.source,
    occurred_at: input.occurredAt,
  });

  logger.info("engagement_event_recorded", {
    eventId: input.id,
    eventType: input.eventType,
    recipeId: input.recipeId,
    creator: input.creatorId,
  });

  return ok({ id: input.id });
}

// ---------------------------------------------------------------------------
// 11.2 Engagement Score Computation
// ---------------------------------------------------------------------------

/**
 * Compute engagement scores for all recipes belonging to a creator.
 *
 * Formula:
 *   raw = (save_clicks_30d * 3.0) + (sequence_triggers_30d * 2.0) +
 *         (card_views_30d * 1.0) + (purchase_attributions_all * 4.0)
 *
 * Normalization: divide by max raw score across creator's recipes,
 * then multiply by 10 (0-10 scale).
 *
 * Recipes with no events get no score record.
 * Results are cached in KV with 24-hour TTL.
 */
export async function computeEngagementScores(
  db: Database,
  creatorId: string,
  cache: KVNamespace | null,
  logger: Logger = defaultLogger,
): Promise<Result<readonly EngagementScoreRow[], AnalyticsError>> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();
  const computedAt = now.toISOString();

  // Get all recipes for this creator
  const creatorRecipes = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(eq(recipes.creator_id, creatorId));

  if (creatorRecipes.length === 0) {
    return ok([]);
  }

  // For each recipe, count events by type
  const scoreInputs: Array<{
    recipeId: string;
    saveClicks30d: number;
    sequenceTriggers30d: number;
    cardViews30d: number;
    purchaseAttributionsAll: number;
  }> = [];

  for (const recipe of creatorRecipes) {
    // Count 30-day events
    const saveClicks = await db
      .select({ count: sql<number>`count(*)` })
      .from(recipeEngagementEvents)
      .where(
        and(
          eq(recipeEngagementEvents.creator_id, creatorId),
          eq(recipeEngagementEvents.recipe_id, recipe.id),
          eq(recipeEngagementEvents.event_type, ENGAGEMENT_EVENT_TYPE.SaveClick),
          gte(recipeEngagementEvents.occurred_at, thirtyDaysAgoIso),
        ),
      );

    const sequenceTriggers = await db
      .select({ count: sql<number>`count(*)` })
      .from(recipeEngagementEvents)
      .where(
        and(
          eq(recipeEngagementEvents.creator_id, creatorId),
          eq(recipeEngagementEvents.recipe_id, recipe.id),
          eq(recipeEngagementEvents.event_type, ENGAGEMENT_EVENT_TYPE.SequenceTrigger),
          gte(recipeEngagementEvents.occurred_at, thirtyDaysAgoIso),
        ),
      );

    const cardViews = await db
      .select({ count: sql<number>`count(*)` })
      .from(recipeEngagementEvents)
      .where(
        and(
          eq(recipeEngagementEvents.creator_id, creatorId),
          eq(recipeEngagementEvents.recipe_id, recipe.id),
          eq(recipeEngagementEvents.event_type, ENGAGEMENT_EVENT_TYPE.CardView),
          gte(recipeEngagementEvents.occurred_at, thirtyDaysAgoIso),
        ),
      );

    // Purchase attributions: all time
    const purchaseAttributions = await db
      .select({ count: sql<number>`count(*)` })
      .from(recipeEngagementEvents)
      .where(
        and(
          eq(recipeEngagementEvents.creator_id, creatorId),
          eq(recipeEngagementEvents.recipe_id, recipe.id),
          eq(
            recipeEngagementEvents.event_type,
            ENGAGEMENT_EVENT_TYPE.PurchaseAttribution,
          ),
        ),
      );

    const sc = saveClicks[0]?.count ?? 0;
    const st = sequenceTriggers[0]?.count ?? 0;
    const cv = cardViews[0]?.count ?? 0;
    const pa = purchaseAttributions[0]?.count ?? 0;

    // Only include recipes that have at least one event
    if (sc > 0 || st > 0 || cv > 0 || pa > 0) {
      scoreInputs.push({
        recipeId: recipe.id,
        saveClicks30d: sc,
        sequenceTriggers30d: st,
        cardViews30d: cv,
        purchaseAttributionsAll: pa,
      });
    }
  }

  if (scoreInputs.length === 0) {
    // Delete existing scores for this creator
    await db
      .delete(recipeEngagementScores)
      .where(eq(recipeEngagementScores.creator_id, creatorId));
    return ok([]);
  }

  // Compute raw scores
  const rawScores = scoreInputs.map((input) => ({
    recipeId: input.recipeId,
    raw:
      input.saveClicks30d * 3.0 +
      input.sequenceTriggers30d * 2.0 +
      input.cardViews30d * 1.0 +
      input.purchaseAttributionsAll * 4.0,
    inputs: input,
  }));

  // Find max raw score for normalization
  let maxRaw = 0;
  for (const rs of rawScores) {
    if (rs.raw > maxRaw) {
      maxRaw = rs.raw;
    }
  }

  // Normalize to 0-10 scale
  const results: EngagementScoreRow[] = [];
  for (const rs of rawScores) {
    const normalized = maxRaw > 0 ? (rs.raw / maxRaw) * 10 : 0;

    // Upsert score record
    // Delete existing then insert (D1 doesn't support ON CONFLICT ... DO UPDATE reliably for all cases)
    await db
      .delete(recipeEngagementScores)
      .where(eq(recipeEngagementScores.recipe_id, rs.recipeId));

    await db.insert(recipeEngagementScores).values({
      recipe_id: rs.recipeId,
      creator_id: creatorId,
      score: normalized,
      computed_at: computedAt,
      save_clicks_30d: rs.inputs.saveClicks30d,
      sequence_triggers_30d: rs.inputs.sequenceTriggers30d,
      card_views_30d: rs.inputs.cardViews30d,
      purchase_attributions_all: rs.inputs.purchaseAttributionsAll,
    });

    results.push({
      recipe_id: rs.recipeId,
      creator_id: creatorId,
      score: normalized,
      computed_at: computedAt,
      save_clicks_30d: rs.inputs.saveClicks30d,
      sequence_triggers_30d: rs.inputs.sequenceTriggers30d,
      card_views_30d: rs.inputs.cardViews30d,
      purchase_attributions_all: rs.inputs.purchaseAttributionsAll,
    });
  }

  // Delete scores for recipes that no longer have events
  const scoredRecipeIds = new Set(results.map((r) => r.recipe_id));
  const existingScores = await db
    .select({ recipe_id: recipeEngagementScores.recipe_id })
    .from(recipeEngagementScores)
    .where(eq(recipeEngagementScores.creator_id, creatorId));

  for (const existing of existingScores) {
    if (!scoredRecipeIds.has(existing.recipe_id)) {
      await db
        .delete(recipeEngagementScores)
        .where(eq(recipeEngagementScores.recipe_id, existing.recipe_id));
    }
  }

  // Cache results in KV with 24-hour TTL
  if (cache !== null) {
    const cacheKey = `engagement_scores:${creatorId}`;
    await cache.put(cacheKey, JSON.stringify(results), {
      expirationTtl: 86400, // 24 hours
    });
  }

  logger.info("engagement_scores_computed", {
    creator: creatorId,
    recipeCount: results.length,
  });

  return ok(results);
}

/**
 * Get cached engagement scores, or compute if not cached.
 */
export async function getEngagementScores(
  db: Database,
  creatorId: string,
  cache: KVNamespace | null,
): Promise<Result<readonly EngagementScoreRow[], AnalyticsError>> {
  // Try cache first
  if (cache !== null) {
    const cacheKey = `engagement_scores:${creatorId}`;
    const cached = await cache.get(cacheKey);
    if (cached !== null) {
      const parsed = JSON.parse(cached) as EngagementScoreRow[];
      return ok(parsed);
    }
  }

  // Fetch from database
  const rows = await db
    .select()
    .from(recipeEngagementScores)
    .where(eq(recipeEngagementScores.creator_id, creatorId));

  return ok(rows);
}

/**
 * Get engagement score for a single recipe.
 */
export async function getRecipeEngagementScore(
  db: Database,
  creatorId: string,
  recipeId: string,
): Promise<Result<EngagementScoreRow | null, AnalyticsError>> {
  const rows = await db
    .select()
    .from(recipeEngagementScores)
    .where(
      and(
        eq(recipeEngagementScores.recipe_id, recipeId),
        eq(recipeEngagementScores.creator_id, creatorId),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    return ok(null);
  }

  const row = rows[0];
  if (!row) {
    return ok(null);
  }

  return ok(row);
}

// ---------------------------------------------------------------------------
// 11.3 Product Recommendation Engine
// ---------------------------------------------------------------------------

/**
 * Compute product recommendations based on segment profiles and recipe data.
 *
 * Trigger conditions (all must be met for a dietary tag):
 * - subscriber_count >= 50
 * - engagement_rate >= 0.15
 * - creator has >= 5 confirmed recipes with that dietary tag
 *
 * Max 1 recommendation per tag per 30 days.
 */
export async function computeRecommendations(
  db: Database,
  creatorId: string,
  logger: Logger = defaultLogger,
): Promise<Result<readonly ProductRecommendation[], AnalyticsError>> {
  // Get segment profile for the creator
  const profiles = await db
    .select()
    .from(segmentProfiles)
    .where(eq(segmentProfiles.creator_id, creatorId))
    .limit(1);

  if (profiles.length === 0 || !profiles[0]) {
    return ok([]);
  }

  const profile = profiles[0];
  const segments = profile.segments as Record<
    string,
    {
      subscriber_count: number;
      engagement_rate: number;
      growth_rate_30d: number;
      top_recipe_ids: ReadonlyArray<string>;
    }
  >;

  const recommendations: ProductRecommendation[] = [];

  for (const [dietaryTag, segmentData] of Object.entries(segments)) {
    // Check subscriber count and engagement rate thresholds
    if (segmentData.subscriber_count < 50 || segmentData.engagement_rate < 0.15) {
      continue;
    }

    // Count confirmed recipes with this dietary tag
    const confirmedRecipes = await db
      .select({ id: recipes.id })
      .from(recipes)
      .where(
        and(
          eq(recipes.creator_id, creatorId),
          eq(recipes.dietary_tags_confirmed, true),
          sql`${recipes.dietary_tags} LIKE ${"%" + dietaryTag + "%"}`,
          sql`${recipes.status} != 'Archived'`,
        ),
      );

    if (confirmedRecipes.length < 5) {
      continue;
    }

    // Get engagement scores for matching recipes
    const recipeIds = confirmedRecipes.map((r) => r.id);
    let totalScore = 0;
    let scoredCount = 0;

    for (const rid of recipeIds) {
      const scoreRows = await db
        .select({ score: recipeEngagementScores.score })
        .from(recipeEngagementScores)
        .where(eq(recipeEngagementScores.recipe_id, rid))
        .limit(1);
      if (scoreRows.length > 0 && scoreRows[0]) {
        totalScore += scoreRows[0].score;
        scoredCount++;
      }
    }

    const avgScore = scoredCount > 0 ? totalScore / scoredCount : 0;

    recommendations.push({
      dietaryTag,
      subscriberCount: segmentData.subscriber_count,
      engagementRate: segmentData.engagement_rate,
      recipeCount: confirmedRecipes.length,
      avgScore: Math.round(avgScore * 10) / 10,
      message:
        `${segmentData.subscriber_count} of your subscribers engage most with ${dietaryTag} recipes. ` +
        `You have ${confirmedRecipes.length} ${dietaryTag} recipes with an average engagement score of ${Math.round(avgScore * 10) / 10}. ` +
        `This could be your next ebook.`,
    });
  }

  logger.info("recommendations_computed", {
    creator: creatorId,
    recommendationCount: recommendations.length,
  });

  return ok(recommendations);
}

// ---------------------------------------------------------------------------
// 11.4 Revenue Attribution
// ---------------------------------------------------------------------------

/**
 * Compute revenue attribution for a purchase.
 *
 * 1. Find all save_click events for the subscriber in the 30 days before purchase.
 * 2. Match saved recipes against the product's recipe list.
 * 3. Record purchase_attribution events for matching recipes.
 * 4. Last-touch model: most recent save is primary.
 */
export async function computeRevenueAttribution(
  db: Database,
  creatorId: string,
  subscriberId: string,
  productId: string,
  logger: Logger = defaultLogger,
): Promise<Result<readonly string[], AnalyticsError>> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();

  // Hash the subscriber ID to match stored events
  const hashedSubscriberId = await hashSubscriberId(subscriberId);

  // Find all save_click events for this subscriber in the last 30 days
  const saveEvents = await db
    .select({
      recipe_id: recipeEngagementEvents.recipe_id,
      occurred_at: recipeEngagementEvents.occurred_at,
    })
    .from(recipeEngagementEvents)
    .where(
      and(
        eq(recipeEngagementEvents.creator_id, creatorId),
        eq(recipeEngagementEvents.kit_subscriber_id, hashedSubscriberId),
        eq(recipeEngagementEvents.event_type, ENGAGEMENT_EVENT_TYPE.SaveClick),
        gte(recipeEngagementEvents.occurred_at, thirtyDaysAgoIso),
      ),
    );

  if (saveEvents.length === 0) {
    return ok([]);
  }

  // Get the product's recipe list
  // Check ebook_details first
  const ebookDetail = await db
    .select({ recipe_ids: ebookDetails.recipe_ids })
    .from(ebookDetails)
    .where(eq(ebookDetails.product_id, productId))
    .limit(1);

  let productRecipeIds: readonly string[] = [];

  if (ebookDetail.length > 0 && ebookDetail[0]) {
    productRecipeIds = ebookDetail[0].recipe_ids;
  } else {
    // Check recipe_card_packs
    const packDetail = await db
      .select({ recipe_ids: recipeCardPacks.recipe_ids })
      .from(recipeCardPacks)
      .where(eq(recipeCardPacks.product_id, productId))
      .limit(1);

    if (packDetail.length > 0 && packDetail[0]) {
      productRecipeIds = packDetail[0].recipe_ids;
    }
  }

  if (productRecipeIds.length === 0) {
    return ok([]);
  }

  // Find matching recipes between saves and product
  const productRecipeSet = new Set(productRecipeIds);
  const matchingSaves = saveEvents.filter((e) => productRecipeSet.has(e.recipe_id));

  if (matchingSaves.length === 0) {
    return ok([]);
  }

  // Sort by occurred_at descending (last-touch model)
  matchingSaves.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));

  // Record purchase_attribution events for each matching recipe
  const attributedEventIds: string[] = [];

  for (const save of matchingSaves) {
    const eventId = `pa-${productId}-${save.recipe_id}-${subscriberId}`;

    // Check for existing attribution (idempotent)
    const existingAttr = await db
      .select({ id: recipeEngagementEvents.id })
      .from(recipeEngagementEvents)
      .where(eq(recipeEngagementEvents.id, eventId))
      .limit(1);

    if (existingAttr.length > 0) {
      attributedEventIds.push(eventId);
      continue;
    }

    await db.insert(recipeEngagementEvents).values({
      id: eventId,
      creator_id: creatorId,
      recipe_id: save.recipe_id,
      event_type: ENGAGEMENT_EVENT_TYPE.PurchaseAttribution,
      event_data: { product_id: productId },
      kit_subscriber_id: hashedSubscriberId,
      source: "KitWebhook",
      occurred_at: now.toISOString(),
    });

    attributedEventIds.push(eventId);
  }

  logger.info("revenue_attribution_computed", {
    creator: creatorId,
    productId,
    attributedRecipeCount: attributedEventIds.length,
  });

  return ok(attributedEventIds);
}
