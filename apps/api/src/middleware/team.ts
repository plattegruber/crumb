/**
 * Team member access middleware (Studio tier).
 *
 * SPEC §13.3: Studio-tier creators can invite up to 3 team members
 * who share access to the creator's library, products, and analytics.
 * Team members cannot disconnect Kit, change billing, or delete the
 * account.
 *
 * The `team_members` table does not exist yet. This module defines
 * the interface and a placeholder lookup so downstream code can be
 * typed correctly from day one.
 */
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "./auth.js";
import type { CreatorId, ForbiddenTeamAction, TeamMemberAccess } from "../types/auth.js";
import { TEAM_MEMBER_FORBIDDEN_ACTIONS } from "../types/auth.js";
import type { Result } from "@dough/shared";
import { ok, err } from "@dough/shared";

// ---------------------------------------------------------------
// Lookup interface
// ---------------------------------------------------------------

/**
 * Contract for looking up team membership. Implementations will
 * query D1 once the table exists.
 */
export interface TeamMemberLookup {
  /**
   * Check whether `memberId` has access to `ownerId`'s resources.
   * Returns the access grant if found, or null if no relationship
   * exists.
   */
  findAccess(memberId: CreatorId, ownerId: CreatorId): Promise<TeamMemberAccess | null>;
}

// ---------------------------------------------------------------
// Placeholder implementation
// ---------------------------------------------------------------

/**
 * Stub lookup that always returns no access.
 * Replace with a real D1-backed implementation when the
 * `team_members` table is created.
 */
export const stubTeamMemberLookup: TeamMemberLookup = {
  findAccess: async (
    _memberId: CreatorId,
    _ownerId: CreatorId,
  ): Promise<TeamMemberAccess | null> => {
    return null;
  },
};

// ---------------------------------------------------------------
// Access-check helpers
// ---------------------------------------------------------------

export type TeamAccessError = "not_a_team_member" | "forbidden_action";

/**
 * Check whether `memberId` can access `ownerId`'s resources.
 *
 * - If the member IS the owner, access is always granted.
 * - Otherwise the lookup is consulted.
 */
export async function checkTeamAccess(
  lookup: TeamMemberLookup,
  memberId: CreatorId,
  ownerId: CreatorId,
): Promise<Result<TeamMemberAccess | null, TeamAccessError>> {
  // Owner always has full access — no lookup needed.
  if (memberId === ownerId) {
    return ok(null);
  }

  const access = await lookup.findAccess(memberId, ownerId);

  if (access === null) {
    return err("not_a_team_member" as const);
  }

  return ok(access);
}

/**
 * Returns true if the given action is forbidden for team members.
 */
export function isForbiddenForTeamMember(action: string): action is ForbiddenTeamAction {
  return (TEAM_MEMBER_FORBIDDEN_ACTIONS as readonly string[]).includes(action);
}

/**
 * Validate that a team member is allowed to perform `action`.
 *
 * Returns an error result if the action is in the forbidden list.
 * Owners are never restricted — callers must check ownership
 * before calling this function.
 */
export function validateTeamAction(
  _access: TeamMemberAccess,
  action: string,
): Result<void, TeamAccessError> {
  if (isForbiddenForTeamMember(action)) {
    return err("forbidden_action" as const);
  }
  return ok(undefined);
}

// ---------------------------------------------------------------
// Hono middleware (optional per-route guard)
// ---------------------------------------------------------------

/**
 * Middleware that verifies the authenticated user has team access
 * to the `ownerId` extracted from the route parameter `:creatorId`.
 *
 * Mount on routes where one creator accesses another's resources.
 * For routes that only operate on the authenticated creator's own
 * data, this middleware is not needed.
 */
export function teamAccessGuard(lookup?: TeamMemberLookup) {
  const memberLookup = lookup ?? stubTeamMemberLookup;

  return createMiddleware<AppEnv>(async (c, next) => {
    const authenticatedId = c.get("creatorId");
    const targetOwnerId = c.req.param("creatorId") as CreatorId | undefined;

    // If there's no :creatorId param, skip — the route operates on
    // the authenticated user's own data.
    if (targetOwnerId === undefined) {
      await next();
      return;
    }

    const result = await checkTeamAccess(memberLookup, authenticatedId, targetOwnerId);

    if (!result.ok) {
      return c.json({ error: "Forbidden", reason: result.error }, 403);
    }

    await next();
  });
}
