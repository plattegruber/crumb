/**
 * Recipe Library service (SPEC §6).
 *
 * All operations are creator-scoped via CreatorScopedDb.
 * All public functions return Promise<Result<T, E>>.
 */
import { eq, and, like, sql, desc, asc } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Database } from "../db/index.js";
import {
  recipes,
  ingredientGroups,
  ingredients,
  instructionGroups,
  instructions,
  photos,
  creators,
  collectionRecipes,
} from "../db/schema.js";
import type { CreatorScopedDb } from "../middleware/creator-scope.js";
import { generateSlug, resolveSlugConflict } from "../lib/slug.js";
import { jaroWinkler, normalizeForComparison } from "../lib/jaro-winkler.js";
import type { Result } from "@crumb/shared";
import { ok, err } from "@crumb/shared";
import type {
  Quantity,
  RecipeStatus,
  DietaryTag,
  MealType,
  Season,
  RecipeId,
  IngredientId,
  InstructionId,
  PhotoId,
} from "@crumb/shared";
import { multiply } from "@crumb/shared";
import { createLogger, type Logger } from "../lib/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateIngredientInput {
  readonly id: IngredientId;
  readonly quantity: Quantity | null;
  readonly unit: string | null;
  readonly item: string;
  readonly notes: string | null;
}

export interface CreateIngredientGroupInput {
  readonly label: string | null;
  readonly ingredients: readonly CreateIngredientInput[];
}

export interface CreateInstructionInput {
  readonly id: InstructionId;
  readonly body: string;
}

export interface CreateInstructionGroupInput {
  readonly label: string | null;
  readonly instructions: readonly CreateInstructionInput[];
}

export interface CreatePhotoInput {
  readonly id: PhotoId;
  readonly url: string;
  readonly altText: string | null;
  readonly width: number;
  readonly height: number;
}

export interface CreateRecipeInput {
  readonly id: RecipeId;
  readonly title: string;
  readonly description?: string | null;
  readonly sourceJson?: string;
  readonly status?: RecipeStatus;
  readonly prepMinutes?: number | null;
  readonly cookMinutes?: number | null;
  readonly totalMinutes?: number | null;
  readonly yieldQuantity?: number | null;
  readonly yieldUnit?: string | null;
  readonly notes?: string | null;
  readonly dietaryTags?: readonly DietaryTag[];
  readonly cuisine?: string | null;
  readonly mealTypes?: readonly MealType[];
  readonly seasons?: readonly Season[];
  readonly ingredientGroups?: readonly CreateIngredientGroupInput[];
  readonly instructionGroups?: readonly CreateInstructionGroupInput[];
  readonly photos?: readonly CreatePhotoInput[];
}

export interface UpdateRecipeInput {
  readonly title?: string;
  readonly description?: string | null;
  readonly status?: RecipeStatus;
  readonly emailReady?: boolean;
  readonly prepMinutes?: number | null;
  readonly cookMinutes?: number | null;
  readonly totalMinutes?: number | null;
  readonly yieldQuantity?: number | null;
  readonly yieldUnit?: string | null;
  readonly notes?: string | null;
  readonly dietaryTags?: readonly DietaryTag[];
  readonly cuisine?: string | null;
  readonly mealTypes?: readonly MealType[];
  readonly seasons?: readonly Season[];
  readonly ingredientGroups?: readonly CreateIngredientGroupInput[];
  readonly instructionGroups?: readonly CreateInstructionGroupInput[];
  readonly photos?: readonly CreatePhotoInput[];
  readonly slug?: string;
}

/**
 * Row shape returned by Drizzle for the `recipes` table.
 * Property names match the snake_case JS keys in schema.ts.
 */
export interface RecipeRow {
  readonly id: string;
  readonly creator_id: string;
  readonly title: string;
  readonly slug: string;
  readonly description: string | null;
  readonly source_type: string;
  readonly source_data: Record<string, unknown> | null;
  readonly status: string;
  readonly email_ready: boolean;
  readonly prep_minutes: number | null;
  readonly cook_minutes: number | null;
  readonly total_minutes: number | null;
  readonly yield_quantity: number | null;
  readonly yield_unit: string | null;
  readonly notes: string | null;
  readonly dietary_tags: readonly string[];
  readonly dietary_tags_confirmed: boolean;
  readonly cuisine: string | null;
  readonly meal_types: readonly string[];
  readonly seasons: readonly string[];
  readonly nutrition_source: string | null;
  readonly nutrition_values: Record<string, unknown> | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface IngredientGroupRow {
  readonly id: number;
  readonly recipe_id: string;
  readonly label: string | null;
  readonly sort_order: number;
}

export interface IngredientRow {
  readonly id: string;
  readonly group_id: number;
  readonly quantity_type: string | null;
  readonly quantity_data: Record<string, unknown> | null;
  readonly unit: string | null;
  readonly item: string;
  readonly notes: string | null;
  readonly sort_order: number;
}

export interface InstructionGroupRow {
  readonly id: number;
  readonly recipe_id: string;
  readonly label: string | null;
  readonly sort_order: number;
}

export interface InstructionRow {
  readonly id: string;
  readonly group_id: number;
  readonly body: string;
  readonly sort_order: number;
}

export interface PhotoRow {
  readonly id: string;
  readonly recipe_id: string;
  readonly url: string;
  readonly alt_text: string | null;
  readonly width: number;
  readonly height: number;
  readonly sort_order: number;
}

export interface RecipeWithRelations {
  readonly recipe: RecipeRow;
  readonly ingredientGroups: readonly (IngredientGroupRow & {
    readonly ingredients: readonly IngredientRow[];
  })[];
  readonly instructionGroups: readonly (InstructionGroupRow & {
    readonly instructions: readonly InstructionRow[];
  })[];
  readonly photos: readonly PhotoRow[];
}

export interface ListRecipesParams {
  readonly q?: string;
  readonly dietaryTags?: readonly DietaryTag[];
  readonly cuisine?: string;
  readonly mealType?: MealType;
  readonly season?: Season;
  readonly maxCookTimeMinutes?: number;
  readonly collectionId?: string;
  readonly status?: RecipeStatus;
  readonly emailReady?: boolean;
  readonly sort?: "created_at" | "updated_at" | "title";
  readonly order?: "asc" | "desc";
  readonly page?: number;
  readonly perPage?: number;
}

export interface PaginatedResult<T> {
  readonly data: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly totalPages: number;
}

export type RecipeError =
  | { readonly type: "not_found" }
  | { readonly type: "free_tier_limit"; readonly message: string }
  | { readonly type: "invalid_input"; readonly message: string }
  | { readonly type: "database_error"; readonly message: string };

export interface DuplicateCheckResult {
  readonly duplicates: readonly {
    readonly recipeId: string;
    readonly title: string;
    readonly similarity: number;
  }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FREE_TIER_RECIPE_LIMIT = 25;
const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;
const DUPLICATE_THRESHOLD = 0.85;

const defaultLogger = createLogger("recipe");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Serialize a Quantity for storage as quantity_type + quantity_data.
 */
function serializeQuantity(q: Quantity): { type: string; data: Record<string, unknown> } {
  return { type: q.type, data: q as unknown as Record<string, unknown> };
}

/**
 * Deserialize quantity_type + quantity_data back into a JSON string representation.
 */
function _deserializeQuantityToJson(
  quantityType: string | null,
  quantityData: Record<string, unknown> | null,
): string | null {
  if (quantityType === null || quantityData === null) return null;
  return JSON.stringify(quantityData);
}

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

/**
 * Create a new recipe with all related data.
 */
export async function createRecipe(
  scopedDb: CreatorScopedDb<Database>,
  input: CreateRecipeInput,
  logger: Logger = defaultLogger,
): Promise<Result<RecipeWithRelations, RecipeError>> {
  const { db, creatorId } = scopedDb;

  // Check free tier limit
  const tierCheck = await checkFreeTierLimit(scopedDb);
  if (!tierCheck.ok) return tierCheck;

  // Generate slug
  const baseSlug = generateSlug(input.title);
  if (baseSlug.length === 0) {
    return err({ type: "invalid_input", message: "Title must produce a valid slug" });
  }

  // Find existing slugs for conflict resolution
  const existingSlugs = await db
    .select({ slug: recipes.slug })
    .from(recipes)
    .where(and(eq(recipes.creator_id, creatorId), like(recipes.slug, `${baseSlug}%`)));

  const slugSet = new Set(existingSlugs.map((r) => r.slug));
  const finalSlug = resolveSlugConflict(baseSlug, slugSet);

  const now = new Date().toISOString();
  const status = input.status ?? "Draft";

  // Use batch for transactional insert
  const stmts: BatchItem<"sqlite">[] = [];

  // Parse source JSON to get type + data
  const sourceJson = input.sourceJson ?? '{"type":"Manual"}';
  const sourceParsed = JSON.parse(sourceJson) as Record<string, unknown>;
  const sourceType = (sourceParsed["type"] as string) ?? "Manual";

  // Insert recipe
  stmts.push(
    db.insert(recipes).values({
      id: input.id,
      creator_id: creatorId,
      title: input.title,
      slug: finalSlug,
      description: input.description ?? null,
      source_type: sourceType,
      source_data: sourceParsed,
      status,
      email_ready: false,
      prep_minutes: input.prepMinutes ?? null,
      cook_minutes: input.cookMinutes ?? null,
      total_minutes: input.totalMinutes ?? null,
      yield_quantity: input.yieldQuantity ?? null,
      yield_unit: input.yieldUnit ?? null,
      notes: input.notes ?? null,
      dietary_tags: (input.dietaryTags ?? []) as unknown as readonly string[],
      dietary_tags_confirmed: false,
      cuisine: input.cuisine ?? null,
      meal_types: (input.mealTypes ?? []) as unknown as readonly string[],
      seasons: (input.seasons ?? []) as unknown as readonly string[],
      nutrition_source: null,
      nutrition_values: null,
      created_at: now,
      updated_at: now,
    }),
  );

  // Insert ingredient groups and ingredients
  if (input.ingredientGroups) {
    for (let gi = 0; gi < input.ingredientGroups.length; gi++) {
      const group = input.ingredientGroups[gi];
      if (!group) continue;
      // ingredient_groups.id is autoincrement — we cannot set it.
      // So we insert group, then query for its ID, then insert ingredients.
      // But since we are in a batch, we cannot do this. Instead, we must
      // insert groups first, then ingredients separately after the batch.
    }
  }

  // Execute the recipe insert batch first
  if (stmts.length > 0) {
    const first = stmts[0] as BatchItem<"sqlite">;
    const rest = stmts.slice(1);
    await db.batch([first, ...rest]);
  }

  // Insert ingredient groups and ingredients sequentially
  // (ingredient_groups.id is autoincrement, so we need to insert and retrieve)
  if (input.ingredientGroups) {
    for (let gi = 0; gi < input.ingredientGroups.length; gi++) {
      const group = input.ingredientGroups[gi];
      if (!group) continue;

      const insertedGroup = await db
        .insert(ingredientGroups)
        .values({
          recipe_id: input.id,
          label: group.label,
          sort_order: gi,
        })
        .returning();

      const groupId = insertedGroup[0]?.id;
      if (groupId === undefined) continue;

      for (let ii = 0; ii < group.ingredients.length; ii++) {
        const ingredient = group.ingredients[ii];
        if (!ingredient) continue;
        const qty = ingredient.quantity ? serializeQuantity(ingredient.quantity) : null;
        await db.insert(ingredients).values({
          id: ingredient.id,
          group_id: groupId,
          quantity_type: qty?.type ?? null,
          quantity_data: qty?.data ?? null,
          unit: ingredient.unit,
          item: ingredient.item,
          notes: ingredient.notes,
          sort_order: ii,
        });
      }
    }
  }

  // Insert instruction groups and instructions sequentially
  if (input.instructionGroups) {
    for (let gi = 0; gi < input.instructionGroups.length; gi++) {
      const group = input.instructionGroups[gi];
      if (!group) continue;

      const insertedGroup = await db
        .insert(instructionGroups)
        .values({
          recipe_id: input.id,
          label: group.label,
          sort_order: gi,
        })
        .returning();

      const groupId = insertedGroup[0]?.id;
      if (groupId === undefined) continue;

      for (let ii = 0; ii < group.instructions.length; ii++) {
        const instruction = group.instructions[ii];
        if (!instruction) continue;
        await db.insert(instructions).values({
          id: instruction.id,
          group_id: groupId,
          body: instruction.body,
          sort_order: ii,
        });
      }
    }
  }

  // Insert photos
  if (input.photos) {
    for (let pi = 0; pi < input.photos.length; pi++) {
      const photo = input.photos[pi];
      if (!photo) continue;
      await db.insert(photos).values({
        id: photo.id,
        recipe_id: input.id,
        url: photo.url,
        alt_text: photo.altText,
        width: photo.width,
        height: photo.height,
        sort_order: pi,
      });
    }
  }

  // Fetch and return the created recipe
  logger.info("recipe_created", {
    recipeId: input.id,
    creator: creatorId,
    slug: finalSlug,
    title: input.title,
  });
  return getRecipe(scopedDb, input.id);
}

/**
 * Update an existing recipe with partial fields.
 */
export async function updateRecipe(
  scopedDb: CreatorScopedDb<Database>,
  recipeId: string,
  input: UpdateRecipeInput,
  logger: Logger = defaultLogger,
): Promise<Result<RecipeWithRelations, RecipeError>> {
  const { db, creatorId } = scopedDb;

  // Check recipe exists
  const existing = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), eq(recipes.creator_id, creatorId)))
    .limit(1);

  if (existing.length === 0) {
    return err({ type: "not_found" });
  }

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = { updated_at: now };

  // Handle title update and slug regeneration
  if (input.title !== undefined) {
    updateData["title"] = input.title;
    // Regenerate slug if not manually set
    if (input.slug === undefined) {
      const baseSlug = generateSlug(input.title);
      if (baseSlug.length > 0) {
        const existingSlugs = await db
          .select({ slug: recipes.slug })
          .from(recipes)
          .where(and(eq(recipes.creator_id, creatorId), like(recipes.slug, `${baseSlug}%`)));
        const slugSet = new Set(
          existingSlugs.filter((r) => r.slug !== existing[0]?.slug).map((r) => r.slug),
        );
        updateData["slug"] = resolveSlugConflict(baseSlug, slugSet);
      }
    }
  }

  if (input.slug !== undefined) {
    updateData["slug"] = input.slug;
  }

  if (input.description !== undefined) updateData["description"] = input.description;
  if (input.status !== undefined) updateData["status"] = input.status;
  if (input.emailReady !== undefined) updateData["email_ready"] = input.emailReady;
  if (input.prepMinutes !== undefined) updateData["prep_minutes"] = input.prepMinutes;
  if (input.cookMinutes !== undefined) updateData["cook_minutes"] = input.cookMinutes;
  if (input.totalMinutes !== undefined) updateData["total_minutes"] = input.totalMinutes;
  if (input.yieldQuantity !== undefined) updateData["yield_quantity"] = input.yieldQuantity;
  if (input.yieldUnit !== undefined) updateData["yield_unit"] = input.yieldUnit;
  if (input.notes !== undefined) updateData["notes"] = input.notes;
  if (input.cuisine !== undefined) updateData["cuisine"] = input.cuisine;

  if (input.dietaryTags !== undefined) {
    updateData["dietary_tags"] = input.dietaryTags;
  }
  if (input.mealTypes !== undefined) {
    updateData["meal_types"] = input.mealTypes;
  }
  if (input.seasons !== undefined) {
    updateData["seasons"] = input.seasons;
  }

  // If ingredients are updated, reset dietary_tags_confirmed
  if (input.ingredientGroups !== undefined) {
    updateData["dietary_tags_confirmed"] = false;
  }

  // Update recipe row
  await db
    .update(recipes)
    .set(updateData)
    .where(and(eq(recipes.id, recipeId), eq(recipes.creator_id, creatorId)));

  // Replace ingredient groups and ingredients if provided
  if (input.ingredientGroups !== undefined) {
    // Delete existing ingredients via their groups
    const existingGroups = await db
      .select({ id: ingredientGroups.id })
      .from(ingredientGroups)
      .where(eq(ingredientGroups.recipe_id, recipeId));

    for (const g of existingGroups) {
      await db.delete(ingredients).where(eq(ingredients.group_id, g.id));
    }
    await db.delete(ingredientGroups).where(eq(ingredientGroups.recipe_id, recipeId));

    // Insert new
    for (let gi = 0; gi < input.ingredientGroups.length; gi++) {
      const group = input.ingredientGroups[gi];
      if (!group) continue;

      const insertedGroup = await db
        .insert(ingredientGroups)
        .values({
          recipe_id: recipeId,
          label: group.label,
          sort_order: gi,
        })
        .returning();

      const groupId = insertedGroup[0]?.id;
      if (groupId === undefined) continue;

      for (let ii = 0; ii < group.ingredients.length; ii++) {
        const ingredient = group.ingredients[ii];
        if (!ingredient) continue;
        const qty = ingredient.quantity ? serializeQuantity(ingredient.quantity) : null;
        await db.insert(ingredients).values({
          id: ingredient.id,
          group_id: groupId,
          quantity_type: qty?.type ?? null,
          quantity_data: qty?.data ?? null,
          unit: ingredient.unit,
          item: ingredient.item,
          notes: ingredient.notes,
          sort_order: ii,
        });
      }
    }
  }

  // Replace instruction groups and instructions if provided
  if (input.instructionGroups !== undefined) {
    // Delete existing instructions via their groups
    const existingGroups = await db
      .select({ id: instructionGroups.id })
      .from(instructionGroups)
      .where(eq(instructionGroups.recipe_id, recipeId));

    for (const g of existingGroups) {
      await db.delete(instructions).where(eq(instructions.group_id, g.id));
    }
    await db.delete(instructionGroups).where(eq(instructionGroups.recipe_id, recipeId));

    for (let gi = 0; gi < input.instructionGroups.length; gi++) {
      const group = input.instructionGroups[gi];
      if (!group) continue;

      const insertedGroup = await db
        .insert(instructionGroups)
        .values({
          recipe_id: recipeId,
          label: group.label,
          sort_order: gi,
        })
        .returning();

      const groupId = insertedGroup[0]?.id;
      if (groupId === undefined) continue;

      for (let ii = 0; ii < group.instructions.length; ii++) {
        const instruction = group.instructions[ii];
        if (!instruction) continue;
        await db.insert(instructions).values({
          id: instruction.id,
          group_id: groupId,
          body: instruction.body,
          sort_order: ii,
        });
      }
    }
  }

  // Replace photos if provided
  if (input.photos !== undefined) {
    await db.delete(photos).where(eq(photos.recipe_id, recipeId));

    for (let pi = 0; pi < input.photos.length; pi++) {
      const photo = input.photos[pi];
      if (!photo) continue;
      await db.insert(photos).values({
        id: photo.id,
        recipe_id: recipeId,
        url: photo.url,
        alt_text: photo.altText,
        width: photo.width,
        height: photo.height,
        sort_order: pi,
      });
    }
  }

  // Log fields that were changed
  const fieldsChanged = Object.keys(updateData).filter((k) => k !== "updated_at");
  logger.info("recipe_updated", {
    recipeId,
    fieldsChanged,
  });

  return getRecipe(scopedDb, recipeId);
}

/**
 * Soft-delete a recipe by setting status to 'Archived'.
 */
export async function deleteRecipe(
  scopedDb: CreatorScopedDb<Database>,
  recipeId: string,
  logger: Logger = defaultLogger,
): Promise<Result<{ readonly id: string }, RecipeError>> {
  const { db, creatorId } = scopedDb;

  const existing = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), eq(recipes.creator_id, creatorId)))
    .limit(1);

  if (existing.length === 0) {
    return err({ type: "not_found" });
  }

  await db
    .update(recipes)
    .set({ status: "Archived", updated_at: new Date().toISOString() })
    .where(and(eq(recipes.id, recipeId), eq(recipes.creator_id, creatorId)));

  logger.info("recipe_deleted", { recipeId });

  return ok({ id: recipeId });
}

/**
 * Get a recipe with all related data.
 * Optionally scales ingredient quantities for a different serving size.
 */
export async function getRecipe(
  scopedDb: CreatorScopedDb<Database>,
  recipeId: string,
  servings?: number,
): Promise<Result<RecipeWithRelations, RecipeError>> {
  const { db, creatorId } = scopedDb;

  const recipeRows = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), eq(recipes.creator_id, creatorId)))
    .limit(1);

  if (recipeRows.length === 0 || !recipeRows[0]) {
    return err({ type: "not_found" });
  }

  const recipe = recipeRows[0];

  // Fetch ingredient groups for this recipe
  const igRows = await db
    .select()
    .from(ingredientGroups)
    .where(eq(ingredientGroups.recipe_id, recipeId))
    .orderBy(asc(ingredientGroups.sort_order));

  // Fetch all ingredients for the groups
  const groupIds = igRows.map((g) => g.id);
  let ingredientRows: (typeof ingredients.$inferSelect)[] = [];
  if (groupIds.length > 0) {
    // Fetch ingredients for all groups in this recipe
    ingredientRows = await db
      .select()
      .from(ingredients)
      .where(
        sql`${ingredients.group_id} IN (
          SELECT ${ingredientGroups.id} FROM ${ingredientGroups}
          WHERE ${ingredientGroups.recipe_id} = ${recipeId}
        )`,
      )
      .orderBy(asc(ingredients.sort_order));
  }

  // Fetch instruction groups for this recipe
  const isgRows = await db
    .select()
    .from(instructionGroups)
    .where(eq(instructionGroups.recipe_id, recipeId))
    .orderBy(asc(instructionGroups.sort_order));

  // Fetch all instructions for the groups
  let instructionRows: (typeof instructions.$inferSelect)[] = [];
  if (isgRows.length > 0) {
    instructionRows = await db
      .select()
      .from(instructions)
      .where(
        sql`${instructions.group_id} IN (
          SELECT ${instructionGroups.id} FROM ${instructionGroups}
          WHERE ${instructionGroups.recipe_id} = ${recipeId}
        )`,
      )
      .orderBy(asc(instructions.sort_order));
  }

  const photoRows = await db
    .select()
    .from(photos)
    .where(eq(photos.recipe_id, recipeId))
    .orderBy(asc(photos.sort_order));

  // Calculate scale factor
  let scaleFactor: number | null = null;
  if (
    servings !== undefined &&
    servings > 0 &&
    recipe.yield_quantity !== null &&
    recipe.yield_quantity > 0
  ) {
    scaleFactor = servings / recipe.yield_quantity;
  }

  // Assemble ingredient groups with ingredients
  const assembledIngredientGroups = igRows.map((group) => {
    const groupIngredients = ingredientRows
      .filter((ing) => ing.group_id === group.id)
      .map((ing) => {
        if (scaleFactor !== null && ing.quantity_type !== null && ing.quantity_data !== null) {
          const parsed = ing.quantity_data as unknown as Quantity;
          const scaled = multiply(parsed, scaleFactor);
          return {
            ...ing,
            quantity_type: scaled.type,
            quantity_data: scaled as unknown as Record<string, unknown>,
          };
        }
        return ing;
      });
    return { ...group, ingredients: groupIngredients };
  });

  // Assemble instruction groups with instructions
  const assembledInstructionGroups = isgRows.map((group) => {
    const groupInstructions = instructionRows.filter((inst) => inst.group_id === group.id);
    return { ...group, instructions: groupInstructions };
  });

  return ok({
    recipe,
    ingredientGroups: assembledIngredientGroups,
    instructionGroups: assembledInstructionGroups,
    photos: photoRows,
  });
}

/**
 * List and search recipes with filtering, sorting, and pagination.
 */
export async function listRecipes(
  scopedDb: CreatorScopedDb<Database>,
  params: ListRecipesParams,
  logger: Logger = defaultLogger,
): Promise<Result<PaginatedResult<RecipeRow>, RecipeError>> {
  const { db, creatorId } = scopedDb;

  const page = Math.max(1, params.page ?? 1);
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, params.perPage ?? DEFAULT_PER_PAGE));
  const offset = (page - 1) * perPage;

  // Build WHERE conditions
  const conditions = [eq(recipes.creator_id, creatorId)];

  if (params.status !== undefined) {
    conditions.push(eq(recipes.status, params.status));
  }

  if (params.emailReady !== undefined) {
    conditions.push(eq(recipes.email_ready, params.emailReady));
  }

  if (params.cuisine !== undefined) {
    conditions.push(eq(recipes.cuisine, params.cuisine));
  }

  if (params.maxCookTimeMinutes !== undefined) {
    conditions.push(
      sql`${recipes.cook_minutes} IS NOT NULL AND ${recipes.cook_minutes} <= ${params.maxCookTimeMinutes}`,
    );
  }

  // Full-text search on title, description, notes
  if (params.q !== undefined && params.q.length > 0) {
    const searchTerms = params.q.split(/\s+/).filter((t) => t.length > 0);
    for (const term of searchTerms) {
      const pattern = `%${term}%`;
      conditions.push(
        sql`(${recipes.title} LIKE ${pattern} COLLATE NOCASE
            OR ${recipes.description} LIKE ${pattern} COLLATE NOCASE
            OR ${recipes.notes} LIKE ${pattern} COLLATE NOCASE
            OR ${recipes.id} IN (
              SELECT DISTINCT ${ingredientGroups.recipe_id}
              FROM ${ingredientGroups}
              JOIN ${ingredients} ON ${ingredients.group_id} = ${ingredientGroups.id}
              WHERE ${ingredientGroups.recipe_id} IN (
                SELECT id FROM ${recipes} WHERE ${recipes.creator_id} = ${creatorId}
              )
              AND ${ingredients.item} LIKE ${pattern} COLLATE NOCASE
            ))`,
      );
    }
  }

  // Filter by dietary tags (JSON array contains)
  if (params.dietaryTags !== undefined && params.dietaryTags.length > 0) {
    for (const tag of params.dietaryTags) {
      // Stored as JSON array e.g. ["GlutenFree","Vegan"], so search for the quoted value
      const pattern = `%"${tag}"%`;
      conditions.push(sql`${recipes.dietary_tags} LIKE ${pattern}`);
    }
  }

  // Filter by meal type
  if (params.mealType !== undefined) {
    conditions.push(sql`${recipes.meal_types} LIKE ${"%" + params.mealType + "%"} COLLATE NOCASE`);
  }

  // Filter by season
  if (params.season !== undefined) {
    conditions.push(sql`${recipes.seasons} LIKE ${"%" + params.season + "%"} COLLATE NOCASE`);
  }

  // Filter by collection
  if (params.collectionId !== undefined) {
    conditions.push(
      sql`${recipes.id} IN (
        SELECT ${collectionRecipes.recipe_id} FROM ${collectionRecipes}
        WHERE ${collectionRecipes.collection_id} = ${params.collectionId}
      )`,
    );
  }

  const whereClause = and(...conditions);

  // Count total
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(recipes)
    .where(whereClause);

  const total = countResult[0]?.count ?? 0;

  // Sorting
  let orderByClause;
  const sortDir = params.order === "asc" ? asc : desc;
  switch (params.sort) {
    case "title":
      orderByClause = sortDir(recipes.title);
      break;
    case "updated_at":
      orderByClause = sortDir(recipes.updated_at);
      break;
    case "created_at":
    default:
      orderByClause = sortDir(recipes.created_at);
      break;
  }

  const rows = await db
    .select()
    .from(recipes)
    .where(whereClause)
    .orderBy(orderByClause)
    .limit(perPage)
    .offset(offset);

  logger.debug("recipe_search", {
    query: params.q ?? null,
    filters: {
      dietaryTags: params.dietaryTags ?? null,
      cuisine: params.cuisine ?? null,
      mealType: params.mealType ?? null,
      season: params.season ?? null,
      status: params.status ?? null,
    },
    resultCount: rows.length,
    total,
  });

  return ok({
    data: rows,
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
  });
}

/**
 * Check for duplicate recipes based on title similarity.
 */
export async function checkDuplicates(
  scopedDb: CreatorScopedDb<Database>,
  title: string,
  excludeRecipeId?: string,
  logger: Logger = defaultLogger,
): Promise<Result<DuplicateCheckResult, RecipeError>> {
  const { db, creatorId } = scopedDb;

  const allRecipes = await db
    .select({ id: recipes.id, title: recipes.title })
    .from(recipes)
    .where(and(eq(recipes.creator_id, creatorId), sql`${recipes.status} != 'Archived'`));

  const normalizedTitle = normalizeForComparison(title);
  const duplicates: { recipeId: string; title: string; similarity: number }[] = [];

  for (const recipe of allRecipes) {
    if (excludeRecipeId !== undefined && recipe.id === excludeRecipeId) continue;
    const normalizedExisting = normalizeForComparison(recipe.title);
    const similarity = jaroWinkler(normalizedTitle, normalizedExisting);
    if (similarity >= DUPLICATE_THRESHOLD) {
      duplicates.push({
        recipeId: recipe.id,
        title: recipe.title,
        similarity,
      });
    }
  }

  // Sort by similarity descending
  duplicates.sort((a, b) => b.similarity - a.similarity);

  if (duplicates.length > 0) {
    logger.warn("duplicate_detection_matches", {
      title,
      matchCount: duplicates.length,
      topMatch: duplicates[0]?.title ?? null,
      topSimilarity: duplicates[0]?.similarity ?? 0,
    });
  }

  return ok({ duplicates });
}

/**
 * Check if creator is on free tier and has reached the recipe limit.
 */
async function checkFreeTierLimit(
  scopedDb: CreatorScopedDb<Database>,
): Promise<Result<void, RecipeError>> {
  const { db, creatorId } = scopedDb;

  // Get creator's subscription tier
  const creatorRows = await db
    .select({ tier: creators.subscription_tier })
    .from(creators)
    .where(eq(creators.id, creatorId))
    .limit(1);

  // If no creator row found, assume free tier
  const tier = creatorRows[0]?.tier ?? "Free";

  if (tier !== "Free") {
    return ok(undefined);
  }

  // Count active (non-archived) recipes
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(recipes)
    .where(and(eq(recipes.creator_id, creatorId), sql`${recipes.status} != 'Archived'`));

  const count = countResult[0]?.count ?? 0;

  if (count >= FREE_TIER_RECIPE_LIMIT) {
    return err({
      type: "free_tier_limit",
      message: `Free tier is limited to ${FREE_TIER_RECIPE_LIMIT} active recipes. Upgrade to add more.`,
    });
  }

  return ok(undefined);
}
