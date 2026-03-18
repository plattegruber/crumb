/**
 * Tests for Kit token lifecycle middleware.
 *
 * Covers token refresh, expiry check, and disconnect on 401.
 */
import { describe, it, expect } from "vitest";
import { resolveAccessToken, type StoredTokenInfo } from "../../../src/lib/kit/token-middleware.js";
import type { KitOAuthTokenResponse } from "../../../src/lib/kit/types.js";

const CLIENT_ID = "test-client-id";
const CLIENT_SECRET = "test-client-secret";

function createTokenInfo(overrides: Partial<StoredTokenInfo> = {}): StoredTokenInfo {
  return {
    accessToken: "access-token-123",
    refreshToken: "refresh-token-456",
    expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour from now
    ...overrides,
  };
}

function createMockFetch(status: number, body: Record<string, unknown>): typeof globalThis.fetch {
  return async (_url: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

// ---------------------------------------------------------------------------
// Token still valid (not close to expiry)
// ---------------------------------------------------------------------------

describe("resolveAccessToken — valid token", () => {
  it("returns the existing access token when far from expiry", async () => {
    const tokens = createTokenInfo({
      expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour from now
    });

    const result = await resolveAccessToken(tokens, CLIENT_ID, CLIENT_SECRET);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.accessToken).toBe("access-token-123");
      expect(result.value.refreshedTokens).toBeNull();
    }
  });

  it("returns existing token when 10 minutes from expiry (above threshold)", async () => {
    const tokens = createTokenInfo({
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes from now
    });

    const result = await resolveAccessToken(tokens, CLIENT_ID, CLIENT_SECRET);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.accessToken).toBe("access-token-123");
      expect(result.value.refreshedTokens).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Token close to expiry — refresh succeeds
// ---------------------------------------------------------------------------

describe("resolveAccessToken — refresh success", () => {
  it("refreshes token when within 5 minutes of expiry", async () => {
    const tokens = createTokenInfo({
      expiresAt: Date.now() + 3 * 60 * 1000, // 3 minutes from now (< 5 min threshold)
    });

    const refreshResponse: KitOAuthTokenResponse = {
      access_token: "new-access-token",
      token_type: "Bearer",
      expires_in: 7200,
      refresh_token: "new-refresh-token",
      scope: "subscribers:read",
      created_at: Math.floor(Date.now() / 1000),
    };

    const mockFetch = createMockFetch(200, refreshResponse as unknown as Record<string, unknown>);

    const result = await resolveAccessToken(
      tokens,
      CLIENT_ID,
      CLIENT_SECRET,
      Date.now(),
      mockFetch,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.accessToken).toBe("new-access-token");
      expect(result.value.refreshedTokens).not.toBeNull();
      expect(result.value.refreshedTokens?.access_token).toBe("new-access-token");
      expect(result.value.refreshedTokens?.refresh_token).toBe("new-refresh-token");
    }
  });

  it("refreshes token when already expired", async () => {
    const tokens = createTokenInfo({
      expiresAt: Date.now() - 60 * 1000, // 1 minute ago
    });

    const refreshResponse: KitOAuthTokenResponse = {
      access_token: "refreshed-token",
      token_type: "Bearer",
      expires_in: 7200,
      refresh_token: "refreshed-refresh",
      scope: "subscribers:read",
      created_at: Math.floor(Date.now() / 1000),
    };

    const mockFetch = createMockFetch(200, refreshResponse as unknown as Record<string, unknown>);

    const result = await resolveAccessToken(
      tokens,
      CLIENT_ID,
      CLIENT_SECRET,
      Date.now(),
      mockFetch,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.accessToken).toBe("refreshed-token");
    }
  });
});

// ---------------------------------------------------------------------------
// Token close to expiry — refresh returns 401 → disconnect
// ---------------------------------------------------------------------------

describe("resolveAccessToken — disconnect on 401", () => {
  it("returns disconnected error when refresh returns 401", async () => {
    const tokens = createTokenInfo({
      expiresAt: Date.now() + 2 * 60 * 1000, // 2 minutes from now
    });

    const mockFetch = createMockFetch(401, { errors: ["Unauthorized"] });

    const result = await resolveAccessToken(
      tokens,
      CLIENT_ID,
      CLIENT_SECRET,
      Date.now(),
      mockFetch,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("disconnected");
      expect(result.error).toHaveProperty("reason");
    }
  });
});

// ---------------------------------------------------------------------------
// Token close to expiry — refresh fails with non-401
// ---------------------------------------------------------------------------

describe("resolveAccessToken — refresh failure (non-401)", () => {
  it("returns refresh_failed error when refresh returns 500", async () => {
    const tokens = createTokenInfo({
      expiresAt: Date.now() + 2 * 60 * 1000,
    });

    const mockFetch = createMockFetch(500, { errors: ["Internal Server Error"] });

    const result = await resolveAccessToken(
      tokens,
      CLIENT_ID,
      CLIENT_SECRET,
      Date.now(),
      mockFetch,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("refresh_failed");
    }
  });

  it("returns refresh_failed error when refresh returns 400", async () => {
    const tokens = createTokenInfo({
      expiresAt: Date.now() - 1000, // expired
    });

    const mockFetch = createMockFetch(400, { errors: ["Bad request"] });

    const result = await resolveAccessToken(
      tokens,
      CLIENT_ID,
      CLIENT_SECRET,
      Date.now(),
      mockFetch,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("refresh_failed");
    }
  });
});

// ---------------------------------------------------------------------------
// Network error during refresh
// ---------------------------------------------------------------------------

describe("resolveAccessToken — network error", () => {
  it("returns refresh_failed error on network failure", async () => {
    const tokens = createTokenInfo({
      expiresAt: Date.now() + 1 * 60 * 1000,
    });

    const mockFetch = async (): Promise<Response> => {
      throw new Error("Network unreachable");
    };

    const result = await resolveAccessToken(
      tokens,
      CLIENT_ID,
      CLIENT_SECRET,
      Date.now(),
      mockFetch as typeof globalThis.fetch,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("refresh_failed");
    }
  });
});

// ---------------------------------------------------------------------------
// Boundary conditions
// ---------------------------------------------------------------------------

describe("resolveAccessToken — boundary conditions", () => {
  it("refreshes when exactly at threshold (5 minutes)", async () => {
    const now = Date.now();
    const tokens = createTokenInfo({
      expiresAt: now + 5 * 60 * 1000, // exactly 5 minutes
    });

    const refreshResponse: KitOAuthTokenResponse = {
      access_token: "boundary-token",
      token_type: "Bearer",
      expires_in: 7200,
      refresh_token: "boundary-refresh",
      scope: "subscribers:read",
      created_at: Math.floor(now / 1000),
    };

    const mockFetch = createMockFetch(200, refreshResponse as unknown as Record<string, unknown>);

    const result = await resolveAccessToken(tokens, CLIENT_ID, CLIENT_SECRET, now, mockFetch);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // At exactly 5 minutes, timeUntilExpiry === REFRESH_THRESHOLD_MS (5*60*1000)
      // The condition is > REFRESH_THRESHOLD_MS, so at exactly 5 min it should refresh
      expect(result.value.accessToken).toBe("boundary-token");
    }
  });

  it("does not refresh when 5 minutes + 1ms from expiry", async () => {
    const now = Date.now();
    const tokens = createTokenInfo({
      expiresAt: now + 5 * 60 * 1000 + 1, // just above threshold
    });

    const result = await resolveAccessToken(tokens, CLIENT_ID, CLIENT_SECRET, now);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.accessToken).toBe("access-token-123");
      expect(result.value.refreshedTokens).toBeNull();
    }
  });
});
