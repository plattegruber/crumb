/**
 * Collection service (SPEC §6.2).
 *
 * CRUD for collections with ordered recipe lists.
 * All operations are creator-scoped via CreatorScopedDb.
 */
import { eq, and, sql, asc } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { collections, collectionRecipes } from "../db/schema.js";
import type { CreatorScopedDb } from "../middleware/creator-scope.js";
import type { Result } from "@dough/shared";
import { ok, err } from "@dough/shared";
import { createLogger } from "../lib/logger.js";

const collectionLogger = createLogger("collection");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CollectionRow {
  readonly id: string;
  readonly creator_id: string;
  readonly name: string;
  readonly description: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CollectionWithRecipes {
  readonly collection: CollectionRow;
  readonly recipeIds: readonly string[];
}

export interface CreateCollectionInput {
  readonly id: string;
  readonly name: string;
  readonly description?: string | null;
}

export interface UpdateCollectionInput {
  readonly name?: string;
  readonly description?: string | null;
}

export type CollectionError =
  | { readonly type: "not_found" }
  | { readonly type: "invalid_input"; readonly message: string }
  | { readonly type: "database_error"; readonly message: string };

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

/**
 * Create a new collection.
 */
export async function createCollection(
  scopedDb: CreatorScopedDb<Database>,
  input: CreateCollectionInput,
): Promise<Result<CollectionWithRecipes, CollectionError>> {
  const { db, creatorId } = scopedDb;

  if (!input.name || input.name.trim().length === 0) {
    return err({ type: "invalid_input", message: "Collection name is required" });
  }

  const now = new Date().toISOString();
  await db.insert(collections).values({
    id: input.id,
    creator_id: creatorId,
    name: input.name,
    description: input.description ?? null,
    created_at: now,
    updated_at: now,
  });

  collectionLogger.info("collection_created", {
    collectionId: input.id,
    name: input.name,
    creator: creatorId,
  });

  return getCollection(scopedDb, input.id);
}

/**
 * Get a collection with its ordered recipe IDs.
 */
export async function getCollection(
  scopedDb: CreatorScopedDb<Database>,
  collectionId: string,
): Promise<Result<CollectionWithRecipes, CollectionError>> {
  const { db, creatorId } = scopedDb;

  const rows = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.creator_id, creatorId)))
    .limit(1);

  if (rows.length === 0 || !rows[0]) {
    return err({ type: "not_found" });
  }

  const recipeRows = await db
    .select({ recipe_id: collectionRecipes.recipe_id })
    .from(collectionRecipes)
    .where(eq(collectionRecipes.collection_id, collectionId))
    .orderBy(asc(collectionRecipes.sort_order));

  return ok({
    collection: rows[0],
    recipeIds: recipeRows.map((r) => r.recipe_id),
  });
}

/**
 * List all collections for the creator, including recipe IDs.
 */
export async function listCollections(
  scopedDb: CreatorScopedDb<Database>,
): Promise<Result<readonly CollectionWithRecipes[], CollectionError>> {
  const { db, creatorId } = scopedDb;

  const rows = await db
    .select()
    .from(collections)
    .where(eq(collections.creator_id, creatorId))
    .orderBy(asc(collections.created_at));

  if (rows.length === 0) {
    return ok([]);
  }

  const collectionIds = rows.map((r) => r.id);
  const allRecipeRows = await db
    .select({
      collection_id: collectionRecipes.collection_id,
      recipe_id: collectionRecipes.recipe_id,
    })
    .from(collectionRecipes)
    .where(
      sql`${collectionRecipes.collection_id} IN (${sql.join(
        collectionIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )
    .orderBy(asc(collectionRecipes.sort_order));

  const recipesByCollection = new Map<string, string[]>();
  for (const row of allRecipeRows) {
    const list = recipesByCollection.get(row.collection_id);
    if (list) {
      list.push(row.recipe_id);
    } else {
      recipesByCollection.set(row.collection_id, [row.recipe_id]);
    }
  }

  const result: CollectionWithRecipes[] = rows.map((row) => ({
    collection: row,
    recipeIds: recipesByCollection.get(row.id) ?? [],
  }));

  return ok(result);
}

/**
 * Update a collection.
 */
export async function updateCollection(
  scopedDb: CreatorScopedDb<Database>,
  collectionId: string,
  input: UpdateCollectionInput,
): Promise<Result<CollectionWithRecipes, CollectionError>> {
  const { db, creatorId } = scopedDb;

  const existing = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.creator_id, creatorId)))
    .limit(1);

  if (existing.length === 0) {
    return err({ type: "not_found" });
  }

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) updateData["name"] = input.name;
  if (input.description !== undefined) updateData["description"] = input.description;

  await db
    .update(collections)
    .set(updateData)
    .where(and(eq(collections.id, collectionId), eq(collections.creator_id, creatorId)));

  return getCollection(scopedDb, collectionId);
}

/**
 * Delete a collection and its recipe associations.
 */
export async function deleteCollection(
  scopedDb: CreatorScopedDb<Database>,
  collectionId: string,
): Promise<Result<{ readonly id: string }, CollectionError>> {
  const { db, creatorId } = scopedDb;

  // Check if collection exists
  const existing = await db
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.creator_id, creatorId)))
    .limit(1);

  if (existing.length === 0) {
    return err({ type: "not_found" });
  }

  // Delete collection recipes
  await db.delete(collectionRecipes).where(eq(collectionRecipes.collection_id, collectionId));

  // Delete collection
  await db
    .delete(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.creator_id, creatorId)));

  collectionLogger.info("collection_deleted", { collectionId, creator: creatorId });

  return ok({ id: collectionId });
}

/**
 * Add a recipe to a collection at the end of the ordering.
 */
export async function addRecipeToCollection(
  scopedDb: CreatorScopedDb<Database>,
  collectionId: string,
  recipeId: string,
): Promise<Result<CollectionWithRecipes, CollectionError>> {
  const { db, creatorId } = scopedDb;

  // Check collection exists
  const existing = await db
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.creator_id, creatorId)))
    .limit(1);

  if (existing.length === 0) {
    return err({ type: "not_found" });
  }

  // Find max sort_order
  const maxOrderResult = await db
    .select({ maxOrder: sql<number>`COALESCE(MAX(${collectionRecipes.sort_order}), -1)` })
    .from(collectionRecipes)
    .where(eq(collectionRecipes.collection_id, collectionId));

  const maxOrder = maxOrderResult[0]?.maxOrder ?? -1;

  // Check if recipe is already in collection
  const existingLink = await db
    .select({ recipe_id: collectionRecipes.recipe_id })
    .from(collectionRecipes)
    .where(
      and(
        eq(collectionRecipes.collection_id, collectionId),
        eq(collectionRecipes.recipe_id, recipeId),
      ),
    )
    .limit(1);

  if (existingLink.length === 0) {
    await db.insert(collectionRecipes).values({
      collection_id: collectionId,
      recipe_id: recipeId,
      sort_order: maxOrder + 1,
    });

    // Update collection's updated_at
    await db
      .update(collections)
      .set({ updated_at: new Date().toISOString() })
      .where(and(eq(collections.id, collectionId), eq(collections.creator_id, creatorId)));
  }

  return getCollection(scopedDb, collectionId);
}

/**
 * Remove a recipe from a collection.
 */
export async function removeRecipeFromCollection(
  scopedDb: CreatorScopedDb<Database>,
  collectionId: string,
  recipeId: string,
): Promise<Result<CollectionWithRecipes, CollectionError>> {
  const { db, creatorId } = scopedDb;

  // Check collection exists
  const existing = await db
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.creator_id, creatorId)))
    .limit(1);

  if (existing.length === 0) {
    return err({ type: "not_found" });
  }

  await db
    .delete(collectionRecipes)
    .where(
      and(
        eq(collectionRecipes.collection_id, collectionId),
        eq(collectionRecipes.recipe_id, recipeId),
      ),
    );

  // Update collection's updated_at
  await db
    .update(collections)
    .set({ updated_at: new Date().toISOString() })
    .where(and(eq(collections.id, collectionId), eq(collections.creator_id, creatorId)));

  return getCollection(scopedDb, collectionId);
}
