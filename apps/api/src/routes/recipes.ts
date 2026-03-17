/**
 * Recipe HTTP routes (SPEC §6).
 *
 * Wires the recipe service to Hono endpoints.
 */
import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth.js";
import { createDb } from "../db/index.js";
import { withCreatorScope } from "../middleware/creator-scope.js";
import {
  createRecipe,
  updateRecipe,
  deleteRecipe,
  getRecipe,
  listRecipes,
  checkDuplicates,
} from "../services/recipe.js";
import type {
  CreateRecipeInput,
  CreateIngredientGroupInput,
  CreateIngredientInput,
  CreateInstructionGroupInput,
  CreateInstructionInput,
  UpdateRecipeInput,
  ListRecipesParams,
  RecipeError,
} from "../services/recipe.js";
import type {
  RecipeStatus,
  DietaryTag,
  MealType,
  Season,
  IngredientId,
  InstructionId,
  Quantity,
} from "@dough/shared";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const recipeRoutes = new Hono<AppEnv>();

/**
 * Map a RecipeError to an HTTP status code.
 */
function errorToStatus(error: RecipeError): ContentfulStatusCode {
  switch (error.type) {
    case "not_found":
      return 404;
    case "free_tier_limit":
      return 403;
    case "invalid_input":
      return 400;
    case "database_error":
      return 500;
  }
}

/**
 * POST /recipes — Create a new recipe.
 */
recipeRoutes.post("/", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const raw = await c.req.json<Record<string, unknown>>();

  // Transform nested frontend format to flat service format, auto-generate ID
  const timing = raw["timing"] as Record<string, unknown> | undefined;
  const yieldData = raw["yield"] as Record<string, unknown> | undefined;

  // Transform ingredient groups from frontend format
  const rawIngredientGroups = raw["ingredientGroups"] as
    | readonly Record<string, unknown>[]
    | undefined;
  const ingredientGroups: CreateIngredientGroupInput[] | undefined = rawIngredientGroups
    ? rawIngredientGroups.map((g) => ({
        label: (g["label"] as string) ?? null,
        ingredients: ((g["ingredients"] as readonly Record<string, unknown>[]) ?? []).map(
          (ing): CreateIngredientInput => {
            // Parse quantity: frontend sends a simple string value, convert to Quantity
            const qtyStr = ing["quantity"] as string | null;
            let quantity: Quantity | null = null;
            if (qtyStr !== null && qtyStr !== undefined && String(qtyStr).trim() !== "") {
              const num = parseFloat(String(qtyStr));
              if (!isNaN(num)) {
                if (Number.isInteger(num)) {
                  quantity = { type: "WholeNumber", value: num } as Quantity;
                } else {
                  quantity = { type: "Decimal", value: num } as Quantity;
                }
              }
            }
            return {
              id: (ing["id"] as IngredientId) ?? (crypto.randomUUID() as IngredientId),
              quantity,
              unit: (ing["unit"] as string) ?? null,
              item: (ing["item"] as string) ?? "",
              notes: (ing["notes"] as string) ?? null,
            };
          },
        ),
      }))
    : undefined;

  // Transform instruction groups from frontend format
  const rawInstructionGroups = raw["instructionGroups"] as
    | readonly Record<string, unknown>[]
    | undefined;
  const instructionGroups: CreateInstructionGroupInput[] | undefined = rawInstructionGroups
    ? rawInstructionGroups.map((g) => ({
        label: (g["label"] as string) ?? null,
        instructions: ((g["instructions"] as readonly Record<string, unknown>[]) ?? []).map(
          (inst): CreateInstructionInput => ({
            id: (inst["id"] as InstructionId) ?? (crypto.randomUUID() as InstructionId),
            body: (inst["body"] as string) ?? "",
          }),
        ),
      }))
    : undefined;

  const body: CreateRecipeInput = {
    id: (raw["id"] as string) ?? crypto.randomUUID(),
    title: raw["title"] as string,
    description: (raw["description"] as string) ?? null,
    status: (raw["status"] as RecipeStatus) ?? undefined,
    prepMinutes: (timing?.["prep_minutes"] as number) ?? (raw["prepMinutes"] as number) ?? null,
    cookMinutes: (timing?.["cook_minutes"] as number) ?? (raw["cookMinutes"] as number) ?? null,
    totalMinutes: (timing?.["total_minutes"] as number) ?? (raw["totalMinutes"] as number) ?? null,
    yieldQuantity: (yieldData?.["quantity"] as number) ?? (raw["yieldQuantity"] as number) ?? null,
    yieldUnit: (yieldData?.["unit"] as string) ?? (raw["yieldUnit"] as string) ?? null,
    notes: (raw["notes"] as string) ?? null,
    cuisine: (raw["cuisine"] as string) ?? null,
    dietaryTags: (raw["dietaryTags"] as readonly DietaryTag[]) ?? [],
    mealTypes: (raw["mealTypes"] as readonly MealType[]) ?? [],
    seasons: (raw["seasons"] as readonly Season[]) ?? [],
    ingredientGroups,
    instructionGroups,
  };

  const result = await createRecipe(scopedDb, body);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 201);
});

/**
 * GET /recipes — List/search recipes with query params.
 */
recipeRoutes.get("/", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const query = c.req.query();

  const params: ListRecipesParams = {
    q: query["q"] ?? undefined,
    status: (query["status"] as RecipeStatus) ?? undefined,
    emailReady: query["email_ready"] !== undefined ? query["email_ready"] === "true" : undefined,
    cuisine: query["cuisine"] ?? undefined,
    mealType: (query["meal_type"] as MealType) ?? undefined,
    season: (query["season"] as Season) ?? undefined,
    maxCookTimeMinutes:
      query["max_cook_time_minutes"] !== undefined
        ? parseInt(query["max_cook_time_minutes"], 10)
        : undefined,
    collectionId: query["collection_id"] ?? undefined,
    dietaryTags: query["dietary_tags"]
      ? (query["dietary_tags"].split(",") as DietaryTag[])
      : undefined,
    sort: (query["sort"] as ListRecipesParams["sort"]) ?? undefined,
    order: (query["order"] as ListRecipesParams["order"]) ?? undefined,
    page: query["page"] !== undefined ? parseInt(query["page"], 10) : undefined,
    perPage: query["per_page"] !== undefined ? parseInt(query["per_page"], 10) : undefined,
  };

  const result = await listRecipes(scopedDb, params);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 200);
});

/**
 * GET /recipes/:id — Get a recipe with optional scaling.
 */
recipeRoutes.get("/:id", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const recipeId = c.req.param("id");
  const servingsParam = c.req.query("servings");
  const servings = servingsParam !== undefined ? parseInt(servingsParam, 10) : undefined;

  const result = await getRecipe(scopedDb, recipeId, servings);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 200);
});

/**
 * PUT /recipes/:id — Update a recipe.
 */
recipeRoutes.put("/:id", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const recipeId = c.req.param("id");
  const raw = await c.req.json<Record<string, unknown>>();

  // Transform ingredient groups from frontend format if present
  const rawIngredientGroups = raw["ingredientGroups"] as
    | readonly Record<string, unknown>[]
    | undefined;
  const updatedIngredientGroups: CreateIngredientGroupInput[] | undefined = rawIngredientGroups
    ? rawIngredientGroups.map((g) => ({
        label: (g["label"] as string) ?? null,
        ingredients: ((g["ingredients"] as readonly Record<string, unknown>[]) ?? []).map(
          (ing): CreateIngredientInput => {
            const qtyStr = ing["quantity"] as string | null;
            let quantity: Quantity | null = null;
            if (qtyStr !== null && qtyStr !== undefined && String(qtyStr).trim() !== "") {
              const num = parseFloat(String(qtyStr));
              if (!isNaN(num)) {
                if (Number.isInteger(num)) {
                  quantity = { type: "WholeNumber", value: num } as Quantity;
                } else {
                  quantity = { type: "Decimal", value: num } as Quantity;
                }
              }
            }
            return {
              id: (ing["id"] as IngredientId) ?? (crypto.randomUUID() as IngredientId),
              quantity,
              unit: (ing["unit"] as string) ?? null,
              item: (ing["item"] as string) ?? "",
              notes: (ing["notes"] as string) ?? null,
            };
          },
        ),
      }))
    : undefined;

  // Transform instruction groups from frontend format if present
  const rawInstructionGroups = raw["instructionGroups"] as
    | readonly Record<string, unknown>[]
    | undefined;
  const updatedInstructionGroups: CreateInstructionGroupInput[] | undefined = rawInstructionGroups
    ? rawInstructionGroups.map((g) => ({
        label: (g["label"] as string) ?? null,
        instructions: ((g["instructions"] as readonly Record<string, unknown>[]) ?? []).map(
          (inst): CreateInstructionInput => ({
            id: (inst["id"] as InstructionId) ?? (crypto.randomUUID() as InstructionId),
            body: (inst["body"] as string) ?? "",
          }),
        ),
      }))
    : undefined;

  const timing = raw["timing"] as Record<string, unknown> | undefined;
  const yieldData = raw["yield"] as Record<string, unknown> | undefined;

  const body: UpdateRecipeInput = {
    title: raw["title"] as string | undefined,
    description:
      raw["description"] !== undefined ? ((raw["description"] as string) ?? null) : undefined,
    status: raw["status"] as RecipeStatus | undefined,
    emailReady: raw["emailReady"] as boolean | undefined,
    prepMinutes:
      timing?.["prep_minutes"] !== undefined
        ? ((timing["prep_minutes"] as number) ?? null)
        : raw["prepMinutes"] !== undefined
          ? ((raw["prepMinutes"] as number) ?? null)
          : undefined,
    cookMinutes:
      timing?.["cook_minutes"] !== undefined
        ? ((timing["cook_minutes"] as number) ?? null)
        : raw["cookMinutes"] !== undefined
          ? ((raw["cookMinutes"] as number) ?? null)
          : undefined,
    totalMinutes:
      timing?.["total_minutes"] !== undefined
        ? ((timing["total_minutes"] as number) ?? null)
        : raw["totalMinutes"] !== undefined
          ? ((raw["totalMinutes"] as number) ?? null)
          : undefined,
    yieldQuantity:
      yieldData?.["quantity"] !== undefined
        ? ((yieldData["quantity"] as number) ?? null)
        : raw["yieldQuantity"] !== undefined
          ? ((raw["yieldQuantity"] as number) ?? null)
          : undefined,
    yieldUnit:
      yieldData?.["unit"] !== undefined
        ? ((yieldData["unit"] as string) ?? null)
        : raw["yieldUnit"] !== undefined
          ? ((raw["yieldUnit"] as string) ?? null)
          : undefined,
    notes: raw["notes"] !== undefined ? ((raw["notes"] as string) ?? null) : undefined,
    cuisine: raw["cuisine"] !== undefined ? ((raw["cuisine"] as string) ?? null) : undefined,
    dietaryTags: raw["dietaryTags"] as readonly DietaryTag[] | undefined,
    mealTypes: raw["mealTypes"] as readonly MealType[] | undefined,
    seasons: raw["seasons"] as readonly Season[] | undefined,
    ingredientGroups: updatedIngredientGroups,
    instructionGroups: updatedInstructionGroups,
  };

  const result = await updateRecipe(scopedDb, recipeId, body);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 200);
});

/**
 * DELETE /recipes/:id — Soft delete (archive) a recipe.
 */
recipeRoutes.delete("/:id", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const recipeId = c.req.param("id");

  const result = await deleteRecipe(scopedDb, recipeId);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 200);
});

/**
 * POST /recipes/:id/duplicate-check — Check for duplicate recipes.
 */
recipeRoutes.post("/:id/duplicate-check", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const recipeId = c.req.param("id");
  const body = await c.req.json<{ title: string }>();

  const result = await checkDuplicates(scopedDb, body.title, recipeId);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 200);
});

export { recipeRoutes };
