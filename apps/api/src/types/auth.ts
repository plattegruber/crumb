/**
 * Auth-related types for Clerk JWT verification and creator scoping.
 */

/** Branded type for creator (Clerk user) IDs. */
export type CreatorId = string & { readonly __brand: "CreatorId" };

/**
 * The subset of Clerk JWT claims we rely on.
 *
 * Clerk session tokens are RS256 JWTs whose `sub` claim contains
 * the Clerk user ID, which we use as the creator_id throughout the
 * system.
 */
export interface ClerkJwtClaims {
  /** Clerk user ID — maps to creator_id. */
  readonly sub: string;
  /** Issued-at timestamp (seconds since epoch). */
  readonly iat: number;
  /** Expiration timestamp (seconds since epoch). */
  readonly exp: number;
  /** Not-before timestamp (seconds since epoch). */
  readonly nbf: number;
  /** Authorized party — the origin that obtained the token. */
  readonly azp: string | null;
}

/**
 * Context values set by the auth middleware and consumed by route
 * handlers.
 */
export interface AuthContext {
  /** The authenticated creator's ID (Clerk `sub` claim). */
  readonly creatorId: CreatorId;
}

/**
 * Enum-like object describing why authentication failed.
 */
export const AuthErrorReason = {
  MISSING_HEADER: "missing_authorization_header",
  MALFORMED_HEADER: "malformed_authorization_header",
  TOKEN_EXPIRED: "token_expired",
  TOKEN_INVALID: "token_invalid",
  VERIFICATION_FAILED: "verification_failed",
} as const;

export type AuthErrorReason =
  (typeof AuthErrorReason)[keyof typeof AuthErrorReason];

/**
 * Represents a team member's access grant to a creator's resources.
 * The backing table does not exist yet — this interface defines the
 * contract so downstream code can type-check against it.
 */
export interface TeamMemberAccess {
  /** The team member's own Clerk user ID. */
  readonly memberId: CreatorId;
  /** The creator account whose resources the member may access. */
  readonly ownerId: CreatorId;
  /** Role within the team. */
  readonly role: TeamMemberRole;
}

/**
 * Roles available to team members on a Studio-tier account.
 */
export const TeamMemberRole = {
  EDITOR: "editor",
  VIEWER: "viewer",
} as const;

export type TeamMemberRole =
  (typeof TeamMemberRole)[keyof typeof TeamMemberRole];

/**
 * Actions that team members are forbidden from performing regardless
 * of role.
 */
export const TEAM_MEMBER_FORBIDDEN_ACTIONS = [
  "disconnect_kit",
  "change_billing",
  "delete_account",
] as const;

export type ForbiddenTeamAction =
  (typeof TEAM_MEMBER_FORBIDDEN_ACTIONS)[number];
