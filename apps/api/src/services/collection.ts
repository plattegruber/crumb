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
import type { Result } from "@crumb/shared";
import { ok, err } from "@crumb/shared";

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
 * List all collections for the creator.
 */
export async function listCollections(
  scopedDb: CreatorScopedDb<Database>,
): Promise<Result<readonly CollectionRow[], CollectionError>> {
  const { db, creatorId } = scopedDb;

  const rows = await db
    .select()
    .from(collections)
    .where(eq(collections.creator_id, creatorId))
    .orderBy(asc(collections.created_at));

  return ok(rows);
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
  await db
    .delete(collectionRecipes)
    .where(eq(collectionRecipes.collection_id, collectionId));

  // Delete collection
  await db
    .delete(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.creator_id, creatorId)));

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
