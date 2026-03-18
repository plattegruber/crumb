/**
 * Collection HTTP routes (SPEC §6.2).
 *
 * Wires the collection service to Hono endpoints.
 */
import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth.js";
import { createDb } from "../db/index.js";
import { withCreatorScope } from "../middleware/creator-scope.js";
import {
  createCollection,
  getCollection,
  listCollections,
  updateCollection,
  deleteCollection,
  addRecipeToCollection,
  removeRecipeFromCollection,
} from "../services/collection.js";
import type { CollectionError } from "../services/collection.js";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const collectionRoutes = new Hono<AppEnv>();

/**
 * Map a CollectionError to an HTTP status code.
 */
function errorToStatus(error: CollectionError): ContentfulStatusCode {
  switch (error.type) {
    case "not_found":
      return 404;
    case "invalid_input":
      return 400;
    case "database_error":
      return 500;
  }
}

/**
 * POST /collections — Create a new collection.
 */
collectionRoutes.post("/", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const body = await c.req.json<{ id?: string; name: string; description?: string | null }>();

  const result = await createCollection(scopedDb, {
    ...body,
    id: body.id ?? crypto.randomUUID(),
  });

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 201);
});

/**
 * GET /collections — List all collections.
 */
collectionRoutes.get("/", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const result = await listCollections(scopedDb);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 200);
});

/**
 * GET /collections/:id — Get a collection with its recipes.
 */
collectionRoutes.get("/:id", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const collectionId = c.req.param("id");

  const result = await getCollection(scopedDb, collectionId);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 200);
});

/**
 * PUT /collections/:id — Update a collection.
 */
collectionRoutes.put("/:id", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const collectionId = c.req.param("id");
  const body = await c.req.json<{ name?: string; description?: string | null }>();

  const result = await updateCollection(scopedDb, collectionId, body);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 200);
});

/**
 * DELETE /collections/:id — Delete a collection.
 */
collectionRoutes.delete("/:id", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const collectionId = c.req.param("id");

  const result = await deleteCollection(scopedDb, collectionId);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 200);
});

/**
 * POST /collections/:id/recipes — Add a recipe to a collection.
 */
collectionRoutes.post("/:id/recipes", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const collectionId = c.req.param("id");
  const body = await c.req.json<{ recipeId: string }>();

  const result = await addRecipeToCollection(scopedDb, collectionId, body.recipeId);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 200);
});

/**
 * DELETE /collections/:id/recipes/:recipeId — Remove a recipe from a collection.
 */
collectionRoutes.delete("/:id/recipes/:recipeId", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const collectionId = c.req.param("id");
  const recipeId = c.req.param("recipeId");

  const result = await removeRecipeFromCollection(scopedDb, collectionId, recipeId);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 200);
});

export { collectionRoutes };
