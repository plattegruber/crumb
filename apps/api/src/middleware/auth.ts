/**
 * Clerk JWT verification middleware for Hono.
 *
 * Verifies the `Authorization: Bearer <token>` header using
 * `@clerk/backend`'s `verifyToken`, which fetches JWKS from
 * Clerk's API and validates the RS256 signature, expiry, and nbf
 * claims.
 *
 * On success the Clerk `sub` claim (user ID) is stored in the
 * Hono context as `creatorId`.
 */
import { createMiddleware } from "hono/factory";
import { verifyToken } from "@clerk/backend";
import type { Env } from "../env.js";
import type { CreatorId } from "../types/auth.js";
import { AuthErrorReason } from "../types/auth.js";
import { createLogger, type Logger } from "../lib/logger.js";

import type { AppEnv } from "../types/hono.js";
export type { AppEnv, AppEnvWithLogger } from "../types/hono.js";

/**
 * Options for configuring the auth middleware. Mainly useful for
 * testing, where we may want to swap the token verifier.
 */
export interface AuthMiddlewareOptions {
  /**
   * Custom token verification function.
   * When provided, replaces the default `@clerk/backend` verifyToken call.
   * The function receives the raw Bearer token and must return the Clerk
   * user ID (sub claim) on success, or null on failure.
   */
  readonly verifyFn?: (token: string, env: Env) => Promise<string | null>;
}

/**
 * Extract the Bearer token from an Authorization header value.
 * Returns null if the header is missing or does not use the Bearer
 * scheme.
 */
export function extractBearerToken(headerValue: string | null | undefined): string | null {
  if (headerValue === null || headerValue === undefined) {
    return null;
  }
  const trimmed = headerValue.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = trimmed.slice(7).trim();
  if (token.length === 0) {
    return null;
  }
  return token;
}

/**
 * Creates the Clerk auth middleware for Hono.
 *
 * Usage:
 * ```ts
 * const app = new Hono<AppEnv>();
 * app.use("*", clerkAuth());
 * ```
 */
export function clerkAuth(options?: AuthMiddlewareOptions) {
  return createMiddleware<AppEnv>(async (c, next) => {
    // Attempt to reuse the request-scoped logger if available, otherwise create one
    const logger: Logger = (c.get("logger" as never) as Logger | undefined) ?? createLogger("auth");

    const authHeader = c.req.header("Authorization");
    const token = extractBearerToken(authHeader);

    if (token === null) {
      const reason =
        authHeader === undefined || authHeader === null
          ? AuthErrorReason.MISSING_HEADER
          : AuthErrorReason.MALFORMED_HEADER;
      logger.warn("auth_failed", {
        reason,
        path: c.req.path,
      });
      return c.json(
        {
          error: "Unauthorized",
          reason,
        },
        401,
      );
    }

    const verifyFn = options?.verifyFn ?? defaultVerify;

    const userId = await verifyFn(token, c.env);

    if (userId === null) {
      logger.warn("auth_failed", {
        reason: AuthErrorReason.VERIFICATION_FAILED,
        path: c.req.path,
      });
      return c.json(
        {
          error: "Unauthorized",
          reason: AuthErrorReason.VERIFICATION_FAILED,
        },
        401,
      );
    }

    logger.debug("auth_success", { creatorId: userId });

    c.set("creatorId", userId as CreatorId);

    await next();
  });
}

/**
 * Default verification using @clerk/backend.
 *
 * Returns the `sub` claim (Clerk user ID) on success, null on
 * failure.
 */
async function defaultVerify(token: string, env: Env): Promise<string | null> {
  try {
    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
    });

    const sub: unknown = payload.sub;
    if (typeof sub !== "string" || sub.length === 0) {
      return null;
    }

    return sub;
  } catch {
    return null;
  }
}
