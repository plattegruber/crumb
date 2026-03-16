/**
 * Recipe Library service (SPEC §6).
 *
 * All operations are creator-scoped via CreatorScopedDb.
 * All public functions return Promise<Result<T, E>>.
 */
import { eq, and, like, inArray, sql, desc, asc } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { DrizzleDb } from "../db/index.js";
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
  Slug,
  RecipeId,
  IngredientId,
  InstructionId,
  PhotoId,
} from "@crumb/shared";
import { multiply } from "@crumb/shared";
import type { CreatorId } from "../types/auth.js";

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

export interface RecipeRow {
  readonly id: string;
  readonly creatorId: string;
  readonly title: string;
  readonly slug: string;
  readonly description: string | null;
  readonly source: string;
  readonly status: string;
  readonly emailReady: boolean;
  readonly prepMinutes: number | null;
  readonly cookMinutes: number | null;
  readonly totalMinutes: number | null;
  readonly yieldQuantity: number | null;
  readonly yieldUnit: string | null;
  readonly notes: string | null;
  readonly dietaryTags: string;
  readonly dietaryTagsConfirmed: boolean;
  readonly cuisine: string | null;
  readonly mealTypes: string;
  readonly seasons: string;
  readonly nutrition: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface IngredientGroupRow {
  readonly id: string;
  readonly recipeId: string;
  readonly creatorId: string;
  readonly label: string | null;
  readonly sortOrder: number;
}

export interface IngredientRow {
  readonly id: string;
  readonly groupId: string;
  readonly recipeId: string;
  readonly creatorId: string;
  readonly quantity: string | null;
  readonly unit: string | null;
  readonly item: string;
  readonly notes: string | null;
  readonly sortOrder: number;
}

export interface InstructionGroupRow {
  readonly id: string;
  readonly recipeId: string;
  readonly creatorId: string;
  readonly label: string | null;
  readonly sortOrder: number;
}

export interface InstructionRow {
  readonly id: string;
  readonly groupId: string;
  readonly recipeId: string;
  readonly creatorId: string;
  readonly body: string;
  readonly sortOrder: number;
}

export interface PhotoRow {
  readonly id: string;
  readonly recipeId: string;
  readonly creatorId: string;
  readonly url: string;
  readonly altText: string | null;
  readonly width: number;
  readonly height: number;
  readonly sortOrder: number;
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

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

/**
 * Create a new recipe with all related data.
 */
export async function createRecipe(
  scopedDb: CreatorScopedDb<DrizzleDb>,
  input: CreateRecipeInput,
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
    .where(and(eq(recipes.creatorId, creatorId), like(recipes.slug, `${baseSlug}%`)));

  const slugSet = new Set(existingSlugs.map((r) => r.slug));
  const finalSlug = resolveSlugConflict(baseSlug, slugSet);

  const now = new Date();
  const status = input.status ?? "Draft";

  // Use batch for transactional insert
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle batch requires tuple type, built dynamically
  const stmts: BatchItem<"sqlite">[] = [];

  // Insert recipe
  stmts.push(
    db.insert(recipes).values({
      id: input.id,
      creatorId,
      title: input.title,
      slug: finalSlug,
      description: input.description ?? null,
      source: input.sourceJson ?? '{"type":"Manual"}',
      status,
      emailReady: false,
      prepMinutes: input.prepMinutes ?? null,
      cookMinutes: input.cookMinutes ?? null,
      totalMinutes: input.totalMinutes ?? null,
      yieldQuantity: input.yieldQuantity ?? null,
      yieldUnit: input.yieldUnit ?? null,
      notes: input.notes ?? null,
      dietaryTags: JSON.stringify(input.dietaryTags ?? []),
      dietaryTagsConfirmed: false,
      cuisine: input.cuisine ?? null,
      mealTypes: JSON.stringify(input.mealTypes ?? []),
      seasons: JSON.stringify(input.seasons ?? []),
      nutrition: null,
      createdAt: now,
      updatedAt: now,
    }),
  );

  // Insert ingredient groups and ingredients
  if (input.ingredientGroups) {
    for (let gi = 0; gi < input.ingredientGroups.length; gi++) {
      const group = input.ingredientGroups[gi];
      if (!group) continue;
      const groupId = `${input.id}-ig-${gi}`;
      stmts.push(
        db.insert(ingredientGroups).values({
          id: groupId,
          recipeId: input.id,
          creatorId,
          label: group.label,
          sortOrder: gi,
        }),
      );
      for (let ii = 0; ii < group.ingredients.length; ii++) {
        const ingredient = group.ingredients[ii];
        if (!ingredient) continue;
        stmts.push(
          db.insert(ingredients).values({
            id: ingredient.id,
            groupId,
            recipeId: input.id,
            creatorId,
            quantity: ingredient.quantity ? JSON.stringify(ingredient.quantity) : null,
            unit: ingredient.unit,
            item: ingredient.item,
            notes: ingredient.notes,
            sortOrder: ii,
          }),
        );
      }
    }
  }

  // Insert instruction groups and instructions
  if (input.instructionGroups) {
    for (let gi = 0; gi < input.instructionGroups.length; gi++) {
      const group = input.instructionGroups[gi];
      if (!group) continue;
      const groupId = `${input.id}-isg-${gi}`;
      stmts.push(
        db.insert(instructionGroups).values({
          id: groupId,
          recipeId: input.id,
          creatorId,
          label: group.label,
          sortOrder: gi,
        }),
      );
      for (let ii = 0; ii < group.instructions.length; ii++) {
        const instruction = group.instructions[ii];
        if (!instruction) continue;
        stmts.push(
          db.insert(instructions).values({
            id: instruction.id,
            groupId,
            recipeId: input.id,
            creatorId,
            body: instruction.body,
            sortOrder: ii,
          }),
        );
      }
    }
  }

  // Insert photos
  if (input.photos) {
    for (let pi = 0; pi < input.photos.length; pi++) {
      const photo = input.photos[pi];
      if (!photo) continue;
      stmts.push(
        db.insert(photos).values({
          id: photo.id,
          recipeId: input.id,
          creatorId,
          url: photo.url,
          altText: photo.altText,
          width: photo.width,
          height: photo.height,
          sortOrder: pi,
        }),
      );
    }
  }

  // Execute batch (all-or-nothing in D1)
  // db.batch requires at least 1 statement; cast to required tuple type
  if (stmts.length > 0) {
    const first = stmts[0] as BatchItem<"sqlite">;
    const rest = stmts.slice(1);
    await db.batch([first, ...rest]);
  }

  // Fetch and return the created recipe
  return getRecipe(scopedDb, input.id);
}

/**
 * Update an existing recipe with partial fields.
 */
export async function updateRecipe(
  scopedDb: CreatorScopedDb<DrizzleDb>,
  recipeId: string,
  input: UpdateRecipeInput,
): Promise<Result<RecipeWithRelations, RecipeError>> {
  const { db, creatorId } = scopedDb;

  // Check recipe exists
  const existing = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), eq(recipes.creatorId, creatorId)))
    .limit(1);

  if (existing.length === 0) {
    return err({ type: "not_found" });
  }

  const now = new Date();
  const updateData: Record<string, unknown> = { updatedAt: now };

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
          .where(
            and(
              eq(recipes.creatorId, creatorId),
              like(recipes.slug, `${baseSlug}%`),
            ),
          );
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
  if (input.emailReady !== undefined) updateData["emailReady"] = input.emailReady;
  if (input.prepMinutes !== undefined) updateData["prepMinutes"] = input.prepMinutes;
  if (input.cookMinutes !== undefined) updateData["cookMinutes"] = input.cookMinutes;
  if (input.totalMinutes !== undefined) updateData["totalMinutes"] = input.totalMinutes;
  if (input.yieldQuantity !== undefined) updateData["yieldQuantity"] = input.yieldQuantity;
  if (input.yieldUnit !== undefined) updateData["yieldUnit"] = input.yieldUnit;
  if (input.notes !== undefined) updateData["notes"] = input.notes;
  if (input.cuisine !== undefined) updateData["cuisine"] = input.cuisine;

  if (input.dietaryTags !== undefined) {
    updateData["dietaryTags"] = JSON.stringify(input.dietaryTags);
  }
  if (input.mealTypes !== undefined) {
    updateData["mealTypes"] = JSON.stringify(input.mealTypes);
  }
  if (input.seasons !== undefined) {
    updateData["seasons"] = JSON.stringify(input.seasons);
  }

  // If ingredients are updated, reset dietary_tags_confirmed
  if (input.ingredientGroups !== undefined) {
    updateData["dietaryTagsConfirmed"] = false;
  }

  // Update recipe row
  await db
    .update(recipes)
    .set(updateData)
    .where(and(eq(recipes.id, recipeId), eq(recipes.creatorId, creatorId)));

  // Replace ingredient groups and ingredients if provided
  if (input.ingredientGroups !== undefined) {
    // Delete existing
    await db
      .delete(ingredients)
      .where(and(eq(ingredients.recipeId, recipeId), eq(ingredients.creatorId, creatorId)));
    await db
      .delete(ingredientGroups)
      .where(
        and(eq(ingredientGroups.recipeId, recipeId), eq(ingredientGroups.creatorId, creatorId)),
      );

    // Insert new
    for (let gi = 0; gi < input.ingredientGroups.length; gi++) {
      const group = input.ingredientGroups[gi];
      if (!group) continue;
      const groupId = `${recipeId}-ig-${gi}`;
      await db.insert(ingredientGroups).values({
        id: groupId,
        recipeId,
        creatorId,
        label: group.label,
        sortOrder: gi,
      });
      for (let ii = 0; ii < group.ingredients.length; ii++) {
        const ingredient = group.ingredients[ii];
        if (!ingredient) continue;
        await db.insert(ingredients).values({
          id: ingredient.id,
          groupId,
          recipeId,
          creatorId,
          quantity: ingredient.quantity ? JSON.stringify(ingredient.quantity) : null,
          unit: ingredient.unit,
          item: ingredient.item,
          notes: ingredient.notes,
          sortOrder: ii,
        });
      }
    }
  }

  // Replace instruction groups and instructions if provided
  if (input.instructionGroups !== undefined) {
    await db
      .delete(instructions)
      .where(and(eq(instructions.recipeId, recipeId), eq(instructions.creatorId, creatorId)));
    await db
      .delete(instructionGroups)
      .where(
        and(
          eq(instructionGroups.recipeId, recipeId),
          eq(instructionGroups.creatorId, creatorId),
        ),
      );

    for (let gi = 0; gi < input.instructionGroups.length; gi++) {
      const group = input.instructionGroups[gi];
      if (!group) continue;
      const groupId = `${recipeId}-isg-${gi}`;
      await db.insert(instructionGroups).values({
        id: groupId,
        recipeId,
        creatorId,
        label: group.label,
        sortOrder: gi,
      });
      for (let ii = 0; ii < group.instructions.length; ii++) {
        const instruction = group.instructions[ii];
        if (!instruction) continue;
        await db.insert(instructions).values({
          id: instruction.id,
          groupId,
          recipeId,
          creatorId,
          body: instruction.body,
          sortOrder: ii,
        });
      }
    }
  }

  // Replace photos if provided
  if (input.photos !== undefined) {
    await db
      .delete(photos)
      .where(and(eq(photos.recipeId, recipeId), eq(photos.creatorId, creatorId)));

    for (let pi = 0; pi < input.photos.length; pi++) {
      const photo = input.photos[pi];
      if (!photo) continue;
      await db.insert(photos).values({
        id: photo.id,
        recipeId,
        creatorId,
        url: photo.url,
        altText: photo.altText,
        width: photo.width,
        height: photo.height,
        sortOrder: pi,
      });
    }
  }

  return getRecipe(scopedDb, recipeId);
}

/**
 * Soft-delete a recipe by setting status to 'Archived'.
 */
export async function deleteRecipe(
  scopedDb: CreatorScopedDb<DrizzleDb>,
  recipeId: string,
): Promise<Result<{ readonly id: string }, RecipeError>> {
  const { db, creatorId } = scopedDb;

  const existing = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), eq(recipes.creatorId, creatorId)))
    .limit(1);

  if (existing.length === 0) {
    return err({ type: "not_found" });
  }

  await db
    .update(recipes)
    .set({ status: "Archived", updatedAt: new Date() })
    .where(and(eq(recipes.id, recipeId), eq(recipes.creatorId, creatorId)));

  return ok({ id: recipeId });
}

/**
 * Get a recipe with all related data.
 * Optionally scales ingredient quantities for a different serving size.
 */
export async function getRecipe(
  scopedDb: CreatorScopedDb<DrizzleDb>,
  recipeId: string,
  servings?: number,
): Promise<Result<RecipeWithRelations, RecipeError>> {
  const { db, creatorId } = scopedDb;

  const recipeRows = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), eq(recipes.creatorId, creatorId)))
    .limit(1);

  if (recipeRows.length === 0 || !recipeRows[0]) {
    return err({ type: "not_found" });
  }

  const recipe = recipeRows[0];

  // Fetch related data
  const igRows = await db
    .select()
    .from(ingredientGroups)
    .where(
      and(eq(ingredientGroups.recipeId, recipeId), eq(ingredientGroups.creatorId, creatorId)),
    )
    .orderBy(asc(ingredientGroups.sortOrder));

  const ingredientRows = await db
    .select()
    .from(ingredients)
    .where(and(eq(ingredients.recipeId, recipeId), eq(ingredients.creatorId, creatorId)))
    .orderBy(asc(ingredients.sortOrder));

  const isgRows = await db
    .select()
    .from(instructionGroups)
    .where(
      and(
        eq(instructionGroups.recipeId, recipeId),
        eq(instructionGroups.creatorId, creatorId),
      ),
    )
    .orderBy(asc(instructionGroups.sortOrder));

  const instructionRows = await db
    .select()
    .from(instructions)
    .where(and(eq(instructions.recipeId, recipeId), eq(instructions.creatorId, creatorId)))
    .orderBy(asc(instructions.sortOrder));

  const photoRows = await db
    .select()
    .from(photos)
    .where(and(eq(photos.recipeId, recipeId), eq(photos.creatorId, creatorId)))
    .orderBy(asc(photos.sortOrder));

  // Calculate scale factor
  let scaleFactor: number | null = null;
  if (servings !== undefined && servings > 0 && recipe.yieldQuantity !== null && recipe.yieldQuantity > 0) {
    scaleFactor = servings / recipe.yieldQuantity;
  }

  // Assemble ingredient groups with ingredients
  const assembledIngredientGroups = igRows.map((group) => {
    const groupIngredients = ingredientRows
      .filter((ing) => ing.groupId === group.id)
      .map((ing) => {
        if (scaleFactor !== null && ing.quantity !== null) {
          const parsed = JSON.parse(ing.quantity) as Quantity;
          const scaled = multiply(parsed, scaleFactor);
          return { ...ing, quantity: JSON.stringify(scaled) };
        }
        return ing;
      });
    return { ...group, ingredients: groupIngredients };
  });

  // Assemble instruction groups with instructions
  const assembledInstructionGroups = isgRows.map((group) => {
    const groupInstructions = instructionRows.filter((inst) => inst.groupId === group.id);
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
  scopedDb: CreatorScopedDb<DrizzleDb>,
  params: ListRecipesParams,
): Promise<Result<PaginatedResult<RecipeRow>, RecipeError>> {
  const { db, creatorId } = scopedDb;

  const page = Math.max(1, params.page ?? 1);
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, params.perPage ?? DEFAULT_PER_PAGE));
  const offset = (page - 1) * perPage;

  // Build WHERE conditions
  const conditions = [eq(recipes.creatorId, creatorId)];

  if (params.status !== undefined) {
    conditions.push(eq(recipes.status, params.status));
  }

  if (params.emailReady !== undefined) {
    conditions.push(eq(recipes.emailReady, params.emailReady));
  }

  if (params.cuisine !== undefined) {
    conditions.push(eq(recipes.cuisine, params.cuisine));
  }

  if (params.maxCookTimeMinutes !== undefined) {
    conditions.push(
      sql`${recipes.cookMinutes} IS NOT NULL AND ${recipes.cookMinutes} <= ${params.maxCookTimeMinutes}`,
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
              SELECT DISTINCT ${ingredients.recipeId} FROM ${ingredients}
              WHERE ${ingredients.creatorId} = ${creatorId}
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
      conditions.push(
        sql`${recipes.dietaryTags} LIKE ${pattern}`,
      );
    }
  }

  // Filter by meal type
  if (params.mealType !== undefined) {
    conditions.push(
      sql`${recipes.mealTypes} LIKE ${"%" + params.mealType + "%"} COLLATE NOCASE`,
    );
  }

  // Filter by season
  if (params.season !== undefined) {
    conditions.push(
      sql`${recipes.seasons} LIKE ${"%" + params.season + "%"} COLLATE NOCASE`,
    );
  }

  // Filter by collection
  if (params.collectionId !== undefined) {
    conditions.push(
      sql`${recipes.id} IN (
        SELECT ${collectionRecipes.recipeId} FROM ${collectionRecipes}
        WHERE ${collectionRecipes.collectionId} = ${params.collectionId}
        AND ${collectionRecipes.creatorId} = ${creatorId}
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
      orderByClause = sortDir(recipes.updatedAt);
      break;
    case "created_at":
    default:
      orderByClause = sortDir(recipes.createdAt);
      break;
  }

  const rows = await db
    .select()
    .from(recipes)
    .where(whereClause)
    .orderBy(orderByClause)
    .limit(perPage)
    .offset(offset);

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
  scopedDb: CreatorScopedDb<DrizzleDb>,
  title: string,
  excludeRecipeId?: string,
): Promise<Result<DuplicateCheckResult, RecipeError>> {
  const { db, creatorId } = scopedDb;

  const allRecipes = await db
    .select({ id: recipes.id, title: recipes.title })
    .from(recipes)
    .where(
      and(
        eq(recipes.creatorId, creatorId),
        sql`${recipes.status} != 'Archived'`,
      ),
    );

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

  return ok({ duplicates });
}

/**
 * Check if creator is on free tier and has reached the recipe limit.
 */
async function checkFreeTierLimit(
  scopedDb: CreatorScopedDb<DrizzleDb>,
): Promise<Result<void, RecipeError>> {
  const { db, creatorId } = scopedDb;

  // Get creator's subscription tier
  const creatorRows = await db
    .select({ tier: creators.subscriptionTier })
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
    .where(
      and(
        eq(recipes.creatorId, creatorId),
        sql`${recipes.status} != 'Archived'`,
      ),
    );

  const count = countResult[0]?.count ?? 0;

  if (count >= FREE_TIER_RECIPE_LIMIT) {
    return err({
      type: "free_tier_limit",
      message: `Free tier is limited to ${FREE_TIER_RECIPE_LIMIT} active recipes. Upgrade to add more.`,
    });
  }

  return ok(undefined);
}
