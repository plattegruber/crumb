/**
 * Creator-scoped data isolation helpers.
 *
 * SPEC §13.2 requires that all database queries are scoped by
 * creator_id with no cross-tenant leakage.  The helpers in this
 * module make it difficult to accidentally forget the creator_id
 * filter.
 *
 * ## Usage
 *
 * ```ts
 * import { withCreatorScope, type CreatorScopedDb } from "./creator-scope.js";
 *
 * function listRecipes(scopedDb: CreatorScopedDb): Promise<Recipe[]> {
 *   return scopedDb.query((db, creatorId) =>
 *     db.select().from(recipes).where(eq(recipes.creatorId, creatorId))
 *   );
 * }
 * ```
 *
 * By accepting `CreatorScopedDb` instead of a raw db handle,
 * callers are forced to go through the scoped interface, which
 * always injects `creatorId`.
 */
import type { CreatorId } from "../types/auth.js";

/**
 * A creator-scoped database wrapper.
 *
 * The generic `TDb` parameter is intentionally left open so this
 * module does not depend on Drizzle directly — Drizzle types will
 * be resolved once the schema and db client are wired up.
 */
export interface CreatorScopedDb<TDb = unknown> {
  /** The raw database handle (escape hatch — prefer `query`). */
  readonly db: TDb;
  /** The creator whose data this scope covers. */
  readonly creatorId: CreatorId;
  /**
   * Run a query that receives the db handle and the scoped
   * creator_id together, ensuring the caller always has the id
   * available for WHERE clauses.
   */
  query: <T>(fn: (db: TDb, creatorId: CreatorId) => T) => T;
}

/**
 * Create a creator-scoped database wrapper.
 *
 * ```ts
 * const scopedDb = withCreatorScope(drizzleInstance, creatorId);
 * const recipes = scopedDb.query((db, cid) =>
 *   db.select().from(recipes).where(eq(recipes.creatorId, cid))
 * );
 * ```
 */
export function withCreatorScope<TDb>(
  db: TDb,
  creatorId: CreatorId,
): CreatorScopedDb<TDb> {
  return {
    db,
    creatorId,
    query: <T>(fn: (db: TDb, creatorId: CreatorId) => T): T =>
      fn(db, creatorId),
  };
}
