/**
 * Collection service (SPEC §6.2).
 *
 * CRUD for collections with ordered recipe lists.
 * All operations are creator-scoped via CreatorScopedDb.
 */
import { eq, and, sql, asc } from "drizzle-orm";
import type { DrizzleDb } from "../db/index.js";
import { collections, collectionRecipes, products } from "../db/schema.js";
import type { CreatorScopedDb } from "../middleware/creator-scope.js";
import type { Result } from "@crumb/shared";
import { ok, err } from "@crumb/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CollectionRow {
  readonly id: string;
  readonly creatorId: string;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
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
  | { readonly type: "has_published_product"; readonly message: string }
  | { readonly type: "invalid_input"; readonly message: string }
  | { readonly type: "database_error"; readonly message: string };

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

/**
 * Create a new collection.
 */
export async function createCollection(
  scopedDb: CreatorScopedDb<DrizzleDb>,
  input: CreateCollectionInput,
): Promise<Result<CollectionWithRecipes, CollectionError>> {
  const { db, creatorId } = scopedDb;

  if (!input.name || input.name.trim().length === 0) {
    return err({ type: "invalid_input", message: "Collection name is required" });
  }

  const now = new Date();
  await db.insert(collections).values({
    id: input.id,
    creatorId,
    name: input.name,
    description: input.description ?? null,
    createdAt: now,
    updatedAt: now,
  });

  return getCollection(scopedDb, input.id);
}

/**
 * Get a collection with its ordered recipe IDs.
 */
export async function getCollection(
  scopedDb: CreatorScopedDb<DrizzleDb>,
  collectionId: string,
): Promise<Result<CollectionWithRecipes, CollectionError>> {
  const { db, creatorId } = scopedDb;

  const rows = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.creatorId, creatorId)))
    .limit(1);

  if (rows.length === 0 || !rows[0]) {
    return err({ type: "not_found" });
  }

  const recipeRows = await db
    .select({ recipeId: collectionRecipes.recipeId })
    .from(collectionRecipes)
    .where(
      and(
        eq(collectionRecipes.collectionId, collectionId),
        eq(collectionRecipes.creatorId, creatorId),
      ),
    )
    .orderBy(asc(collectionRecipes.sortOrder));

  return ok({
    collection: rows[0],
    recipeIds: recipeRows.map((r) => r.recipeId),
  });
}

/**
 * List all collections for the creator.
 */
export async function listCollections(
  scopedDb: CreatorScopedDb<DrizzleDb>,
): Promise<Result<readonly CollectionRow[], CollectionError>> {
  const { db, creatorId } = scopedDb;

  const rows = await db
    .select()
    .from(collections)
    .where(eq(collections.creatorId, creatorId))
    .orderBy(asc(collections.createdAt));

  return ok(rows);
}

/**
 * Update a collection.
 */
export async function updateCollection(
  scopedDb: CreatorScopedDb<DrizzleDb>,
  collectionId: string,
  input: UpdateCollectionInput,
): Promise<Result<CollectionWithRecipes, CollectionError>> {
  const { db, creatorId } = scopedDb;

  const existing = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.creatorId, creatorId)))
    .limit(1);

  if (existing.length === 0) {
    return err({ type: "not_found" });
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updateData["name"] = input.name;
  if (input.description !== undefined) updateData["description"] = input.description;

  await db
    .update(collections)
    .set(updateData)
    .where(and(eq(collections.id, collectionId), eq(collections.creatorId, creatorId)));

  return getCollection(scopedDb, collectionId);
}

/**
 * Delete a collection.
 * Returns an error if the collection is referenced by a published product.
 */
export async function deleteCollection(
  scopedDb: CreatorScopedDb<DrizzleDb>,
  collectionId: string,
): Promise<Result<{ readonly id: string }, CollectionError>> {
  const { db, creatorId } = scopedDb;

  // Check if collection exists
  const existing = await db
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.creatorId, creatorId)))
    .limit(1);

  if (existing.length === 0) {
    return err({ type: "not_found" });
  }

  // Check if referenced by a published product
  const publishedProducts = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.collectionId, collectionId),
        eq(products.creatorId, creatorId),
        eq(products.status, "Published"),
      ),
    )
    .limit(1);

  if (publishedProducts.length > 0) {
    return err({
      type: "has_published_product",
      message: "Cannot delete a collection referenced by a published product",
    });
  }

  // Delete collection recipes
  await db
    .delete(collectionRecipes)
    .where(
      and(
        eq(collectionRecipes.collectionId, collectionId),
        eq(collectionRecipes.creatorId, creatorId),
      ),
    );

  // Delete collection
  await db
    .delete(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.creatorId, creatorId)));

  return ok({ id: collectionId });
}

/**
 * Add a recipe to a collection at the end of the ordering.
 */
export async function addRecipeToCollection(
  scopedDb: CreatorScopedDb<DrizzleDb>,
  collectionId: string,
  recipeId: string,
): Promise<Result<CollectionWithRecipes, CollectionError>> {
  const { db, creatorId } = scopedDb;

  // Check collection exists
  const existing = await db
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.creatorId, creatorId)))
    .limit(1);

  if (existing.length === 0) {
    return err({ type: "not_found" });
  }

  // Find max sort_order
  const maxOrderResult = await db
    .select({ maxOrder: sql<number>`COALESCE(MAX(${collectionRecipes.sortOrder}), -1)` })
    .from(collectionRecipes)
    .where(
      and(
        eq(collectionRecipes.collectionId, collectionId),
        eq(collectionRecipes.creatorId, creatorId),
      ),
    );

  const maxOrder = maxOrderResult[0]?.maxOrder ?? -1;

  // Check if recipe is already in collection
  const existingLink = await db
    .select({ recipeId: collectionRecipes.recipeId })
    .from(collectionRecipes)
    .where(
      and(
        eq(collectionRecipes.collectionId, collectionId),
        eq(collectionRecipes.recipeId, recipeId),
        eq(collectionRecipes.creatorId, creatorId),
      ),
    )
    .limit(1);

  if (existingLink.length === 0) {
    await db.insert(collectionRecipes).values({
      collectionId,
      recipeId,
      creatorId,
      sortOrder: maxOrder + 1,
    });

    // Update collection's updatedAt
    await db
      .update(collections)
      .set({ updatedAt: new Date() })
      .where(and(eq(collections.id, collectionId), eq(collections.creatorId, creatorId)));
  }

  return getCollection(scopedDb, collectionId);
}

/**
 * Remove a recipe from a collection.
 */
export async function removeRecipeFromCollection(
  scopedDb: CreatorScopedDb<DrizzleDb>,
  collectionId: string,
  recipeId: string,
): Promise<Result<CollectionWithRecipes, CollectionError>> {
  const { db, creatorId } = scopedDb;

  // Check collection exists
  const existing = await db
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.creatorId, creatorId)))
    .limit(1);

  if (existing.length === 0) {
    return err({ type: "not_found" });
  }

  await db
    .delete(collectionRecipes)
    .where(
      and(
        eq(collectionRecipes.collectionId, collectionId),
        eq(collectionRecipes.recipeId, recipeId),
        eq(collectionRecipes.creatorId, creatorId),
      ),
    );

  // Update collection's updatedAt
  await db
    .update(collections)
    .set({ updatedAt: new Date() })
    .where(and(eq(collections.id, collectionId), eq(collections.creatorId, creatorId)));

  return getCollection(scopedDb, collectionId);
}
