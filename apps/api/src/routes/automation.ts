/**
 * Automation Engine HTTP routes (SPEC SS10).
 *
 * Includes both authenticated creator routes and the public
 * Save This Recipe redirect endpoint.
 */
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { AppEnv } from "../middleware/auth.js";
import { createDb } from "../db/index.js";
import { recipes, creators } from "../db/schema.js";
import {
  handleSaveThisRecipe,
  createNewRecipeBroadcast,
  createLeadMagnetSequence,
  listSeasonalDrops,
  createSeasonalDrop,
  processSeasonalDrops,
} from "../services/automation.js";
import type { AutomationError, CreateSeasonalDropInput } from "../services/automation.js";
import type { KitClientConfig } from "../lib/kit/client.js";
import type { ContentfulStatusCode } from "hono/utils/http-status";

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function errorToStatus(error: AutomationError): ContentfulStatusCode {
  switch (error.type) {
    case "not_found":
      return 404;
    case "no_sequence_configured":
      return 404;
    case "already_enrolled":
      return 409;
    case "free_tier_limit":
      return 403;
    case "kit_error":
      return 502;
    case "invalid_input":
      return 400;
    case "database_error":
      return 500;
  }
}

function errorToBody(error: AutomationError): Record<string, unknown> {
  switch (error.type) {
    case "kit_error":
      return {
        error: error.type,
        messages: error.kitError.messages,
      };
    default:
      return { error: error.type, message: "message" in error ? error.message : error.type };
  }
}

// ---------------------------------------------------------------------------
// Helper to build a KitClientConfig
// ---------------------------------------------------------------------------

function kitConfigFromEnv(fetchFn: typeof globalThis.fetch): KitClientConfig {
  return { fetchFn };
}

// ---------------------------------------------------------------------------
// Authenticated routes (creator-scoped)
// ---------------------------------------------------------------------------

const automationRoutes = new Hono<AppEnv>();

/**
 * POST /automation/save-recipe
 * Handle a Save This Recipe click (called by the CTA redirect).
 *
 * Body: { recipeSlug: string, subscriberId: string, accessToken: string }
 */
automationRoutes.post("/save-recipe", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const kitConfig = kitConfigFromEnv(fetch);

  const body = await c.req.json<{
    recipeSlug: string;
    subscriberId: string;
    accessToken: string;
  }>();

  const result = await handleSaveThisRecipe(
    db,
    creatorId,
    body.recipeSlug,
    body.subscriberId,
    body.accessToken,
    kitConfig,
  );

  if (!result.ok) {
    return c.json(errorToBody(result.error), errorToStatus(result.error));
  }

  return c.json(result.value, 200);
});

/**
 * POST /automation/broadcast-draft/:recipeId
 * Manually trigger broadcast draft creation.
 *
 * Body: { accessToken: string }
 */
automationRoutes.post("/broadcast-draft/:recipeId", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const kitConfig = kitConfigFromEnv(fetch);
  const recipeId = c.req.param("recipeId");

  const body = await c.req.json<{ accessToken: string }>();

  const result = await createNewRecipeBroadcast(
    db,
    creatorId,
    recipeId,
    body.accessToken,
    kitConfig,
  );

  if (!result.ok) {
    return c.json(errorToBody(result.error), errorToStatus(result.error));
  }

  return c.json(result.value, 201);
});

/**
 * POST /automation/lead-magnet-sequence/:productId
 * Create a lead magnet delivery sequence.
 *
 * Body: { accessToken: string }
 */
automationRoutes.post("/lead-magnet-sequence/:productId", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const kitConfig = kitConfigFromEnv(fetch);
  const productId = c.req.param("productId");

  const body = await c.req.json<{ accessToken: string }>();

  const result = await createLeadMagnetSequence(
    db,
    creatorId,
    productId,
    body.accessToken,
    kitConfig,
  );

  if (!result.ok) {
    return c.json(errorToBody(result.error), errorToStatus(result.error));
  }

  return c.json(result.value, 201);
});

/**
 * GET /automation/seasonal-drops
 * List configured seasonal drops.
 */
automationRoutes.get("/seasonal-drops", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);

  const result = await listSeasonalDrops(db, creatorId);

  if (!result.ok) {
    return c.json(errorToBody(result.error), errorToStatus(result.error));
  }

  return c.json({ drops: result.value }, 200);
});

/**
 * POST /automation/seasonal-drops
 * Create a seasonal drop configuration.
 */
automationRoutes.post("/seasonal-drops", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);

  const body = await c.req.json<CreateSeasonalDropInput>();

  const result = await createSeasonalDrop(db, creatorId, body);

  if (!result.ok) {
    return c.json(errorToBody(result.error), errorToStatus(result.error));
  }

  return c.json(result.value, 201);
});

/**
 * POST /automation/seasonal-drops/process
 * Trigger processing of due seasonal drops.
 *
 * Body: { accessToken: string }
 */
automationRoutes.post("/seasonal-drops/process", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const kitConfig = kitConfigFromEnv(fetch);

  const body = await c.req.json<{ accessToken: string }>();

  const result = await processSeasonalDrops(db, creatorId, body.accessToken, kitConfig);

  if (!result.ok) {
    return c.json(errorToBody(result.error), errorToStatus(result.error));
  }

  return c.json(result.value, 200);
});

export { automationRoutes };

// ---------------------------------------------------------------------------
// Public Save This Recipe redirect endpoint
// ---------------------------------------------------------------------------

/**
 * GET /save/:creatorId/:recipeSlug
 *
 * The public endpoint subscribers click.
 * - Extracts kit_subscriber_id from query param `ck`
 * - Calls handleSaveThisRecipe
 * - Redirects to recipe source_url or creator's Kit landing page
 * - Must complete within 500ms per spec
 */
export function createSaveRedirectRoutes(): Hono<AppEnv> {
  const saveRoutes = new Hono<AppEnv>();

  saveRoutes.get("/:creatorId/:recipeSlug", async (c) => {
    const creatorId = c.req.param("creatorId");
    const recipeSlug = c.req.param("recipeSlug");
    const subscriberId = c.req.query("ck") ?? null;

    const db = createDb(c.env.DB);

    // Look up the recipe for redirect URL
    const recipeRows = await db
      .select({
        source_data: recipes.source_data,
      })
      .from(recipes)
      .where(sql`${recipes.creator_id} = ${creatorId} AND ${recipes.slug} = ${recipeSlug}`)
      .limit(1);

    // Determine redirect URL
    let redirectUrl = "https://kit.com";
    if (recipeRows.length > 0 && recipeRows[0]?.source_data) {
      const sourceData = recipeRows[0].source_data as Record<string, unknown>;
      const url = sourceData["url"] ?? sourceData["post_url"] ?? sourceData["video_url"];
      if (typeof url === "string") {
        redirectUrl = url;
      }
    }

    // Fire-and-forget the save recipe handling if subscriber ID is present
    if (subscriberId) {
      const kitConfig = kitConfigFromEnv(fetch);

      // Look up creator's Kit access token
      const creatorRows = await db
        .select({ kit_access_token: creators.kit_access_token })
        .from(creators)
        .where(sql`${creators.id} = ${creatorId}`)
        .limit(1);

      const accessToken = creatorRows[0]?.kit_access_token;
      if (accessToken) {
        // Run in background -- do not await to keep redirect fast
        void handleSaveThisRecipe(db, creatorId, recipeSlug, subscriberId, accessToken, kitConfig);
      }
    }

    return c.redirect(redirectUrl, 302);
  });

  return saveRoutes;
}
