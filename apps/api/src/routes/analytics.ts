/**
 * Analytics HTTP routes (SPEC 11).
 *
 * Engagement scores, product recommendations, and Kit webhook endpoint.
 */
import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth.js";
import { createDb } from "../db/index.js";
import {
  getEngagementScores,
  getRecipeEngagementScore,
  computeEngagementScores,
  computeRecommendations,
} from "../services/analytics.js";
import { handleWebhookEvent } from "../services/webhook-handlers.js";
import { verifyWebhookSignature } from "../lib/kit/webhooks.js";
import type { KitWebhookPayload } from "../lib/kit/webhooks.js";

const analyticsRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// GET /analytics/engagement-scores — list scores for creator's recipes
// ---------------------------------------------------------------------------

analyticsRoutes.get("/engagement-scores", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);

  const result = await getEngagementScores(db, creatorId, c.env.CACHE);

  if (!result.ok) {
    return c.json({ error: result.error }, 500);
  }

  return c.json({ scores: result.value }, 200);
});

// ---------------------------------------------------------------------------
// GET /analytics/engagement-scores/:recipeId — single recipe score
// ---------------------------------------------------------------------------

analyticsRoutes.get("/engagement-scores/:recipeId", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const recipeId = c.req.param("recipeId");

  const result = await getRecipeEngagementScore(db, creatorId, recipeId);

  if (!result.ok) {
    return c.json({ error: result.error }, 500);
  }

  if (result.value === null) {
    return c.json({ error: { type: "not_found" } }, 404);
  }

  return c.json({ score: result.value }, 200);
});

// ---------------------------------------------------------------------------
// POST /analytics/compute-scores — trigger score computation
// ---------------------------------------------------------------------------

analyticsRoutes.post("/compute-scores", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);

  const result = await computeEngagementScores(db, creatorId, c.env.CACHE);

  if (!result.ok) {
    return c.json({ error: result.error }, 500);
  }

  return c.json({ scores: result.value, count: result.value.length }, 200);
});

// ---------------------------------------------------------------------------
// GET /analytics/recommendations — get product recommendations
// ---------------------------------------------------------------------------

analyticsRoutes.get("/recommendations", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);

  const result = await computeRecommendations(db, creatorId);

  if (!result.ok) {
    return c.json({ error: result.error }, 500);
  }

  return c.json({ recommendations: result.value }, 200);
});

export { analyticsRoutes };

// ---------------------------------------------------------------------------
// Kit Webhook endpoint — separate router to avoid auth middleware
// ---------------------------------------------------------------------------

const webhookRoutes = new Hono<AppEnv>();

/**
 * POST /webhooks/kit — Kit webhook endpoint.
 *
 * Verifies the HMAC signature and dispatches to the appropriate handler.
 * Returns 200 immediately per SPEC 14.2 (async processing).
 */
webhookRoutes.post("/kit", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("X-Kit-Signature") ?? "";

  // Verify webhook signature
  const verifyResult = await verifyWebhookSignature(
    rawBody,
    signature,
    c.env.KIT_CLIENT_SECRET,
  );

  if (!verifyResult.ok) {
    return c.json({ error: verifyResult.error.message }, 403);
  }

  // Parse payload
  let payload: KitWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as KitWebhookPayload;
  } catch {
    return c.json({ error: "Invalid JSON payload" }, 400);
  }

  // Determine creator_id from the webhook context
  // In a real implementation, this would be looked up from the Kit account ID
  // For now, we extract it from a custom header or query param
  const creatorId = c.req.header("X-Creator-Id") ?? c.req.query("creator_id") ?? "";

  if (creatorId.length === 0) {
    return c.json({ error: "Missing creator context" }, 400);
  }

  const db = createDb(c.env.DB);

  const result = await handleWebhookEvent(db, creatorId, payload);

  if (!result.ok) {
    // Per SPEC 14.2, still return 200 to acknowledge receipt
    // Errors are logged but don't cause webhook retries
    return c.json({ received: true, error: result.error.type }, 200);
  }

  return c.json({ received: true, result: result.value }, 200);
});

export { webhookRoutes };
