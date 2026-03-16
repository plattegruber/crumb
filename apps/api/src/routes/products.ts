/**
 * Product HTTP routes (SPEC §8).
 *
 * Wires the product service to Hono endpoints.
 */
import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth.js";
import { createDb } from "../db/index.js";
import { withCreatorScope } from "../middleware/creator-scope.js";
import {
  createEbook,
  createMealPlan,
  createRecipeCardPack,
  createLeadMagnet,
  getProduct,
  listProducts,
  updateProduct,
  reviewAiCopy,
  publishProduct,
  enqueueRender,
} from "../services/product.js";
import type {
  CreateEbookInput,
  CreateMealPlanInput,
  CreateRecipeCardPackInput,
  ListProductsParams,
  UpdateProductInput,
  ProductError,
} from "../services/product.js";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const productRoutes = new Hono<AppEnv>();

/**
 * Map a ProductError to an HTTP status code.
 */
function errorToStatus(error: ProductError): ContentfulStatusCode {
  switch (error.type) {
    case "not_found":
      return 404;
    case "invalid_input":
      return 400;
    case "invariant_violation":
      return 422;
    case "free_tier_limit":
      return 403;
    case "database_error":
      return 500;
  }
}

/**
 * POST /products/ebook — Create an ebook product.
 */
productRoutes.post("/ebook", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const body = await c.req.json<CreateEbookInput>();
  const result = await createEbook(scopedDb, body);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 201);
});

/**
 * POST /products/meal-plan — Create a meal plan product.
 */
productRoutes.post("/meal-plan", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const body = await c.req.json<CreateMealPlanInput>();
  const result = await createMealPlan(scopedDb, body);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 201);
});

/**
 * POST /products/recipe-card-pack — Create a recipe card pack product.
 */
productRoutes.post("/recipe-card-pack", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const body = await c.req.json<CreateRecipeCardPackInput>();
  const result = await createRecipeCardPack(scopedDb, body);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 201);
});

/**
 * POST /products/:id/lead-magnet — Generate a lead magnet from parent product.
 */
productRoutes.post("/:id/lead-magnet", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const parentId = c.req.param("id");
  const body = await c.req.json<{ id: string }>();
  const result = await createLeadMagnet(scopedDb, parentId, body.id);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 201);
});

/**
 * GET /products — List products with filters and pagination.
 */
productRoutes.get("/", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const query = c.req.query();
  const params: ListProductsParams = {
    status: query["status"] ?? undefined,
    product_type: query["product_type"] ?? undefined,
    page: query["page"] !== undefined ? parseInt(query["page"], 10) : undefined,
    perPage: query["per_page"] !== undefined ? parseInt(query["per_page"], 10) : undefined,
  };

  const result = await listProducts(scopedDb, params);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 200);
});

/**
 * GET /products/:id — Get a product with details.
 */
productRoutes.get("/:id", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const productId = c.req.param("id");
  const result = await getProduct(scopedDb, productId);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 200);
});

/**
 * PUT /products/:id — Update product base fields.
 */
productRoutes.put("/:id", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const productId = c.req.param("id");
  const body = await c.req.json<UpdateProductInput>();
  const result = await updateProduct(scopedDb, productId, body);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 200);
});

/**
 * POST /products/:id/review-copy — Mark AI copy as reviewed.
 */
productRoutes.post("/:id/review-copy", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const productId = c.req.param("id");
  const result = await reviewAiCopy(scopedDb, productId);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 200);
});

/**
 * POST /products/:id/render — Enqueue PDF rendering.
 */
productRoutes.post("/:id/render", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  // Verify product exists and belongs to creator
  const productId = c.req.param("id");
  const product = await getProduct(scopedDb, productId);

  if (!product.ok) {
    return c.json({ error: product.error }, errorToStatus(product.error));
  }

  const result = await enqueueRender(productId, c.env);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 202);
});

/**
 * POST /products/:id/publish — Transition product to Published status.
 */
productRoutes.post("/:id/publish", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const productId = c.req.param("id");
  const result = await publishProduct(scopedDb, productId);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 200);
});

export { productRoutes };
