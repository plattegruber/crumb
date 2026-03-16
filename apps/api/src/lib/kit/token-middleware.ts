// ---------------------------------------------------------------------------
// Token Lifecycle Middleware
// ---------------------------------------------------------------------------
// Ensures a valid Kit access token is available before making API calls.
//
// Per SPEC 4.1:
//   - Tokens are refreshed 5 minutes before expiry.
//   - If refresh returns 401, the connection is marked disconnected.
// ---------------------------------------------------------------------------

import type { Result } from "@crumb/shared";
import { ok, err } from "@crumb/shared";
import type { KitApiError, KitOAuthTokenResponse } from "./types.js";
import { KIT_API_ERROR_CODE } from "./types.js";
import { refreshToken } from "./oauth.js";
import type { FetchFn } from "./client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Stored token information for a Kit connection. */
export interface StoredTokenInfo {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Absolute expiry time in milliseconds since epoch. */
  readonly expiresAt: number;
}

/**
 * Result of resolving a valid access token.
 *
 * If the token was refreshed, `refreshedTokens` contains the new tokens
 * that must be persisted.
 */
export interface ResolvedToken {
  readonly accessToken: string;
  readonly refreshedTokens: KitOAuthTokenResponse | null;
}

/** Returned when the Kit connection must be marked disconnected. */
export interface TokenDisconnectedError {
  readonly type: "disconnected";
  readonly reason: string;
}

/** Returned when a non-disconnect error occurs during refresh. */
export interface TokenRefreshError {
  readonly type: "refresh_failed";
  readonly error: KitApiError;
}

export type TokenMiddlewareError = TokenDisconnectedError | TokenRefreshError;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Refresh threshold in milliseconds (5 minutes). */
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolves a valid access token from the stored token info.
 *
 * - If the token has more than 5 minutes until expiry, returns it directly.
 * - If the token is within 5 minutes of expiry or already expired,
 *   attempts a refresh.
 * - If the refresh returns 401, returns a `disconnected` error.
 *
 * @param tokens - The currently stored token information.
 * @param clientId - The OAuth client ID.
 * @param clientSecret - The OAuth client secret.
 * @param now - Current time in milliseconds (injectable for tests).
 * @param fetchFn - Optional injected fetch for testability.
 */
export async function resolveAccessToken(
  tokens: StoredTokenInfo,
  clientId: string,
  clientSecret: string,
  now: number = Date.now(),
  fetchFn: FetchFn = globalThis.fetch,
): Promise<Result<ResolvedToken, TokenMiddlewareError>> {
  const timeUntilExpiry = tokens.expiresAt - now;

  // Token is still valid and not close to expiry
  if (timeUntilExpiry > REFRESH_THRESHOLD_MS) {
    return ok({
      accessToken: tokens.accessToken,
      refreshedTokens: null,
    });
  }

  // Token is close to expiry or already expired — refresh it
  const refreshResult = await refreshToken(tokens.refreshToken, clientId, clientSecret, fetchFn);

  if (!refreshResult.ok) {
    const apiError = refreshResult.error;

    // If Kit returns 401 on refresh, the connection must be disconnected
    if (apiError.code === KIT_API_ERROR_CODE.Unauthorized) {
      return err({
        type: "disconnected" as const,
        reason: "Kit returned 401 on token refresh — connection must be disconnected",
      });
    }

    return err({
      type: "refresh_failed" as const,
      error: apiError,
    });
  }

  const newTokens = refreshResult.value;

  return ok({
    accessToken: newTokens.access_token,
    refreshedTokens: newTokens,
  });
}
