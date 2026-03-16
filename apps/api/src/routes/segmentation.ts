// ---------------------------------------------------------------------------
// Segmentation Engine routes — SPEC 9
// ---------------------------------------------------------------------------

import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth.js";
import type { DietaryTag, RecipeId, CreatorId } from "@crumb/shared";
import { DIETARY_TAG } from "@crumb/shared";
import { drizzle } from "drizzle-orm/d1";
import type { KitClientConfig } from "../lib/kit/client.js";
import {
  inferAndStoreDietaryTags,
  confirmDietaryTags,
  getSegmentProfile,
  computeSegmentProfile,
  createPreferenceCaptureForm,
} from "../services/segmentation.js";

const segmentationRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// POST /recipes/:id/dietary-tags/infer — trigger auto-tagging for a recipe
// ---------------------------------------------------------------------------

segmentationRoutes.post("/recipes/:id/dietary-tags/infer", async (c) => {
  const recipeId = c.req.param("id") as RecipeId;
  const creatorId = c.get("creatorId") as CreatorId;
  const db = drizzle(c.env.DB);

  const result = await inferAndStoreDietaryTags(db, recipeId, creatorId);

  if (!result.ok) {
    const statusCode =
      result.error.code === "RECIPE_NOT_FOUND"
        ? 404
        : result.error.code === "NOT_AUTHORIZED"
          ? 403
          : 500;
    return c.json({ error: result.error.message, code: result.error.code }, statusCode);
  }

  const tags = [...result.value.state.tags];
  const ambiguousEntries: Record<string, string> = {};
  for (const [key, value] of result.value.ambiguous) {
    ambiguousEntries[key] = value;
  }

  return c.json(
    {
      tags,
      confirmed: false,
      ambiguous: ambiguousEntries,
    },
    200,
  );
});

// ---------------------------------------------------------------------------
// PUT /recipes/:id/dietary-tags/confirm — confirm dietary tags
// ---------------------------------------------------------------------------

segmentationRoutes.put("/recipes/:id/dietary-tags/confirm", async (c) => {
  const recipeId = c.req.param("id") as RecipeId;
  const creatorId = c.get("creatorId") as CreatorId;
  const db = drizzle(c.env.DB);

  let body: { tags: readonly string[] };
  try {
    body = (await c.req.json()) as { tags: readonly string[] };
  } catch {
    return c.json({ error: "Invalid request body", code: "INVALID_INPUT" }, 400);
  }

  if (!body.tags || !Array.isArray(body.tags)) {
    return c.json({ error: "tags must be an array", code: "INVALID_INPUT" }, 400);
  }

  // Validate each tag is a valid DietaryTag
  const validTags = new Set<string>(Object.values(DIETARY_TAG));
  const confirmedTags: DietaryTag[] = [];
  for (const tag of body.tags) {
    if (!validTags.has(tag)) {
      return c.json({ error: `Invalid dietary tag: ${tag}`, code: "INVALID_INPUT" }, 400);
    }
    confirmedTags.push(tag as DietaryTag);
  }

  const result = await confirmDietaryTags(db, recipeId, creatorId, confirmedTags);

  if (!result.ok) {
    const statusCode =
      result.error.code === "RECIPE_NOT_FOUND"
        ? 404
        : result.error.code === "NOT_AUTHORIZED"
          ? 403
          : 500;
    return c.json({ error: result.error.message, code: result.error.code }, statusCode);
  }

  return c.json(
    {
      tags: result.value.tags,
      confirmed: result.value.confirmed,
    },
    200,
  );
});

// ---------------------------------------------------------------------------
// GET /segments — get current segment profile
// ---------------------------------------------------------------------------

segmentationRoutes.get("/segments", async (c) => {
  const creatorId = c.get("creatorId") as CreatorId;
  const db = drizzle(c.env.DB);

  const result = await getSegmentProfile(db, creatorId);

  if (!result.ok) {
    return c.json({ error: result.error.message, code: result.error.code }, 500);
  }

  if (result.value === null) {
    return c.json({ profile: null }, 200);
  }

  return c.json({ profile: result.value }, 200);
});

// ---------------------------------------------------------------------------
// POST /segments/compute — trigger segment profile computation
// ---------------------------------------------------------------------------

segmentationRoutes.post("/segments/compute", async (c) => {
  const creatorId = c.get("creatorId") as CreatorId;
  const db = drizzle(c.env.DB);

  const kitConfig: KitClientConfig = {
    fetchFn: globalThis.fetch.bind(globalThis),
  };

  // In a real implementation, the access token would come from the
  // creator's stored Kit connection. For now, require it in headers.
  const kitAccessToken = c.req.header("X-Kit-Access-Token");
  if (!kitAccessToken) {
    return c.json({ error: "Kit access token required", code: "INVALID_INPUT" }, 400);
  }

  const result = await computeSegmentProfile(db, creatorId, kitConfig, kitAccessToken);

  if (!result.ok) {
    return c.json({ error: result.error.message, code: result.error.code }, 500);
  }

  return c.json({ profile: result.value }, 200);
});

// ---------------------------------------------------------------------------
// POST /segments/preference-form — create preference capture form
// ---------------------------------------------------------------------------

segmentationRoutes.post("/segments/preference-form", async (c) => {
  const creatorId = c.get("creatorId") as CreatorId;
  const db = drizzle(c.env.DB);

  const kitConfig: KitClientConfig = {
    fetchFn: globalThis.fetch.bind(globalThis),
  };

  const kitAccessToken = c.req.header("X-Kit-Access-Token");
  if (!kitAccessToken) {
    return c.json({ error: "Kit access token required", code: "INVALID_INPUT" }, 400);
  }

  const result = await createPreferenceCaptureForm(db, creatorId, kitConfig, kitAccessToken);

  if (!result.ok) {
    const statusCode = result.error.code === "FORM_NOT_FOUND" ? 404 : 500;
    return c.json({ error: result.error.message, code: result.error.code }, statusCode);
  }

  return c.json(
    {
      form_id: result.value.formId,
      form_name: result.value.formName,
      embed_url: result.value.embedUrl,
    },
    200,
  );
});

export { segmentationRoutes };
