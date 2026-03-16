/**
 * Tests for the Clerk JWT auth middleware.
 *
 * These tests exercise the middleware by creating a standalone Hono
 * app with the `clerkAuth` middleware applied, using a custom
 * `verifyFn` for deterministic control over token verification.
 *
 * We do NOT use `SELF.fetch` here because it routes through the
 * real worker entry point where we cannot inject a custom verifier.
 * Instead we call `app.fetch(request, env)` directly, which runs
 * in the same Workers runtime (Vitest pool-workers) and exercises
 * the real middleware code path.
 */
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { clerkAuth, extractBearerToken } from "../../src/middleware/auth.js";
import type { AppEnv } from "../../src/middleware/auth.js";
import type { CreatorId } from "../../src/types/auth.js";
import type { Env } from "../../src/env.js";

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/** A fake Env that satisfies the type. Values are unused in tests. */
const TEST_ENV: Env = {
  DB: {} as D1Database,
  STORAGE: {} as R2Bucket,
  CACHE: {} as KVNamespace,
  IMPORT_QUEUE: {} as Queue,
  RENDER_QUEUE: {} as Queue,
  CLERK_PUBLISHABLE_KEY: "pk_test_xxx",
  CLERK_SECRET_KEY: "sk_test_xxx",
  KIT_CLIENT_ID: "kit_id",
  KIT_CLIENT_SECRET: "kit_secret",
};

const VALID_USER_ID = "user_2abc123def456" as CreatorId;

/**
 * Verification function that succeeds for the token "valid-token"
 * and returns null for everything else.
 */
async function fakeVerify(
  token: string,
  _env: Env,
): Promise<string | null> {
  if (token === "valid-token") {
    return VALID_USER_ID;
  }
  if (token === "expired-token") {
    return null;
  }
  return null;
}

/**
 * Build a test Hono app with the auth middleware and a simple
 * protected route that echoes back the creator ID.
 */
function createTestApp() {
  const app = new Hono<AppEnv>();

  // Public route — no auth.
  app.get("/health", (c) => c.json({ status: "ok" }));

  // Apply auth middleware to everything except /health.
  app.use("*", async (c, next) => {
    if (c.req.path === "/health") {
      await next();
      return;
    }
    return clerkAuth({ verifyFn: fakeVerify })(c, next);
  });

  // Protected route.
  app.get("/me", (c) => {
    const creatorId = c.get("creatorId");
    return c.json({ creatorId });
  });

  return app;
}

// ---------------------------------------------------------------
// extractBearerToken unit tests
// ---------------------------------------------------------------

describe("extractBearerToken", () => {
  it("extracts token from a valid Bearer header", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
  });

  it("is case-insensitive for the Bearer prefix", () => {
    expect(extractBearerToken("bearer abc123")).toBe("abc123");
    expect(extractBearerToken("BEARER abc123")).toBe("abc123");
  });

  it("returns null for missing header", () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it("returns null for non-Bearer scheme", () => {
    expect(extractBearerToken("Basic abc123")).toBeNull();
  });

  it("returns null for empty token after Bearer", () => {
    expect(extractBearerToken("Bearer ")).toBeNull();
    expect(extractBearerToken("Bearer   ")).toBeNull();
  });

  it("trims whitespace around the header and token", () => {
    expect(extractBearerToken("  Bearer   tok  ")).toBe("tok");
  });
});

// ---------------------------------------------------------------
// Middleware integration tests
// ---------------------------------------------------------------

describe("clerkAuth middleware", () => {
  const app = createTestApp();

  it("returns 401 when Authorization header is missing", async () => {
    const res = await app.fetch(
      new Request("http://localhost/me"),
      TEST_ENV,
    );

    expect(res.status).toBe(401);
    const body = await res.json<{ error: string; reason: string }>();
    expect(body.error).toBe("Unauthorized");
    expect(body.reason).toBe("missing_authorization_header");
  });

  it("returns 401 for malformed Authorization header", async () => {
    const res = await app.fetch(
      new Request("http://localhost/me", {
        headers: { Authorization: "Basic abc" },
      }),
      TEST_ENV,
    );

    expect(res.status).toBe(401);
    const body = await res.json<{ error: string; reason: string }>();
    expect(body.reason).toBe("malformed_authorization_header");
  });

  it("returns 401 for an invalid / unrecognised token", async () => {
    const res = await app.fetch(
      new Request("http://localhost/me", {
        headers: { Authorization: "Bearer garbage-token" },
      }),
      TEST_ENV,
    );

    expect(res.status).toBe(401);
    const body = await res.json<{ error: string; reason: string }>();
    expect(body.reason).toBe("verification_failed");
  });

  it("returns 401 for an expired token", async () => {
    const res = await app.fetch(
      new Request("http://localhost/me", {
        headers: { Authorization: "Bearer expired-token" },
      }),
      TEST_ENV,
    );

    expect(res.status).toBe(401);
    const body = await res.json<{ error: string; reason: string }>();
    expect(body.reason).toBe("verification_failed");
  });

  it("passes with a valid token and exposes creatorId", async () => {
    const res = await app.fetch(
      new Request("http://localhost/me", {
        headers: { Authorization: "Bearer valid-token" },
      }),
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json<{ creatorId: string }>();
    expect(body.creatorId).toBe(VALID_USER_ID);
  });

  it("/health works without any Authorization header", async () => {
    const res = await app.fetch(
      new Request("http://localhost/health"),
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json<{ status: string }>();
    expect(body.status).toBe("ok");
  });
});
