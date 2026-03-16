// ---------------------------------------------------------------------------
// Tests for Kit OAuth module
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import {
  getAuthorizationUrl,
  exchangeCode,
  refreshToken,
  KIT_OAUTH_SCOPES,
  deriveEncryptionKey,
  encryptToken,
  decryptToken,
} from "../../../src/lib/kit/oauth.js";

// ---------------------------------------------------------------------------
// Mock fetch helper
// ---------------------------------------------------------------------------

function mockFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
): typeof globalThis.fetch {
  return handler as typeof globalThis.fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Authorization URL
// ---------------------------------------------------------------------------

describe("getAuthorizationUrl", () => {
  it("generates correct authorization URL with all parameters", () => {
    const url = getAuthorizationUrl(
      "client123",
      "https://app.example.com/callback",
      KIT_OAUTH_SCOPES,
      "csrf-state",
    );

    expect(url).toContain("https://api.kit.com/v4/oauth/authorize");
    expect(url).toContain("client_id=client123");
    expect(url).toContain("response_type=code");
    expect(url).toContain("redirect_uri=");
    expect(url).toContain("state=csrf-state");
    expect(url).toContain("scope=");
  });

  it("includes all required scopes", () => {
    const url = getAuthorizationUrl(
      "client123",
      "https://app.example.com/callback",
      KIT_OAUTH_SCOPES,
    );

    const parsed = new URL(url);
    const scope = parsed.searchParams.get("scope");
    expect(scope).toBeTruthy();

    for (const s of KIT_OAUTH_SCOPES) {
      expect(scope).toContain(s);
    }
  });

  it("omits state when not provided", () => {
    const url = getAuthorizationUrl(
      "client123",
      "https://app.example.com/callback",
      KIT_OAUTH_SCOPES,
    );

    expect(url).not.toContain("state=");
  });
});

// ---------------------------------------------------------------------------
// Token Exchange
// ---------------------------------------------------------------------------

describe("exchangeCode", () => {
  it("exchanges authorization code for tokens", async () => {
    const tokenResponse = {
      access_token: "new-access-token",
      token_type: "Bearer",
      expires_in: 7200,
      refresh_token: "new-refresh-token",
      scope: "public",
      created_at: 1710271006,
    };

    const fetchFn = mockFetch(async (_url, init) => {
      const body = JSON.parse(init?.body as string) as Record<string, unknown>;
      expect(body.grant_type).toBe("authorization_code");
      expect(body.client_id).toBe("client123");
      expect(body.client_secret).toBe("secret456");
      expect(body.code).toBe("auth-code");
      expect(body.redirect_uri).toBe("https://app.example.com/callback");
      return jsonResponse(tokenResponse);
    });

    const result = await exchangeCode(
      "auth-code",
      "client123",
      "secret456",
      "https://app.example.com/callback",
      fetchFn,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.access_token).toBe("new-access-token");
      expect(result.value.refresh_token).toBe("new-refresh-token");
      expect(result.value.expires_in).toBe(7200);
    }
  });

  it("returns error on failed exchange", async () => {
    const fetchFn = mockFetch(async () => jsonResponse({ errors: ["Invalid code"] }, 422));

    const result = await exchangeCode(
      "bad-code",
      "client123",
      "secret456",
      "https://app.example.com/callback",
      fetchFn,
    );

    expect(result.ok).toBe(false);
  });

  it("returns network error when fetch throws", async () => {
    const fetchFn = mockFetch(async () => {
      throw new Error("Connection refused");
    });

    const result = await exchangeCode(
      "code",
      "client123",
      "secret456",
      "https://app.example.com/callback",
      fetchFn,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("network_error");
    }
  });
});

// ---------------------------------------------------------------------------
// Token Refresh
// ---------------------------------------------------------------------------

describe("refreshToken", () => {
  it("refreshes an expired token", async () => {
    const tokenResponse = {
      access_token: "refreshed-access-token",
      token_type: "Bearer",
      expires_in: 7200,
      refresh_token: "refreshed-refresh-token",
      scope: "public",
      created_at: 1710271006,
    };

    const fetchFn = mockFetch(async (_url, init) => {
      const body = JSON.parse(init?.body as string) as Record<string, unknown>;
      expect(body.grant_type).toBe("refresh_token");
      expect(body.refresh_token).toBe("old-refresh-token");
      return jsonResponse(tokenResponse);
    });

    const result = await refreshToken("old-refresh-token", "client123", "secret456", fetchFn);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.access_token).toBe("refreshed-access-token");
      expect(result.value.refresh_token).toBe("refreshed-refresh-token");
    }
  });

  it("returns unauthorized on 401", async () => {
    const fetchFn = mockFetch(async () =>
      jsonResponse({ errors: ["The access token is invalid"] }, 401),
    );

    const result = await refreshToken("invalid-refresh-token", "client123", "secret456", fetchFn);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unauthorized");
    }
  });
});

// ---------------------------------------------------------------------------
// Token Encryption / Decryption
// ---------------------------------------------------------------------------

describe("Token encryption round-trip", () => {
  it("encrypts and decrypts a token successfully", async () => {
    const masterSecret = new TextEncoder().encode("a".repeat(32));
    const salt = new TextEncoder().encode("creator-123");

    const key = await deriveEncryptionKey(masterSecret, salt);

    const plaintext = "my-secret-access-token";
    const encrypted = await encryptToken(plaintext, key);

    // Encrypted should be different from plaintext
    expect(encrypted).not.toBe(plaintext);

    const decrypted = await decryptToken(encrypted, key);
    expect(decrypted.ok).toBe(true);
    if (decrypted.ok) {
      expect(decrypted.value).toBe(plaintext);
    }
  });

  it("decryption fails with wrong key", async () => {
    const masterSecret1 = new TextEncoder().encode("a".repeat(32));
    const masterSecret2 = new TextEncoder().encode("b".repeat(32));
    const salt = new TextEncoder().encode("creator-123");

    const key1 = await deriveEncryptionKey(masterSecret1, salt);
    const key2 = await deriveEncryptionKey(masterSecret2, salt);

    const encrypted = await encryptToken("secret-token", key1);

    const decrypted = await decryptToken(encrypted, key2);
    expect(decrypted.ok).toBe(false);
  });

  it("decryption fails with invalid base64", async () => {
    const masterSecret = new TextEncoder().encode("a".repeat(32));
    const salt = new TextEncoder().encode("creator-123");
    const key = await deriveEncryptionKey(masterSecret, salt);

    const decrypted = await decryptToken("not-valid-base64!!!", key);
    expect(decrypted.ok).toBe(false);
  });

  it("decryption fails when ciphertext is too short", async () => {
    const masterSecret = new TextEncoder().encode("a".repeat(32));
    const salt = new TextEncoder().encode("creator-123");
    const key = await deriveEncryptionKey(masterSecret, salt);

    // Base64 encoding of a very short byte array (< 13 bytes)
    const shortData = btoa("short");
    const decrypted = await decryptToken(shortData, key);
    expect(decrypted.ok).toBe(false);
  });

  it("different encryptions of the same plaintext produce different ciphertexts", async () => {
    const masterSecret = new TextEncoder().encode("a".repeat(32));
    const salt = new TextEncoder().encode("creator-123");
    const key = await deriveEncryptionKey(masterSecret, salt);

    const plaintext = "same-token";
    const encrypted1 = await encryptToken(plaintext, key);
    const encrypted2 = await encryptToken(plaintext, key);

    // Due to random IV, they should be different
    expect(encrypted1).not.toBe(encrypted2);

    // Both should decrypt to the same value
    const decrypted1 = await decryptToken(encrypted1, key);
    const decrypted2 = await decryptToken(encrypted2, key);
    expect(decrypted1.ok).toBe(true);
    expect(decrypted2.ok).toBe(true);
    if (decrypted1.ok && decrypted2.ok) {
      expect(decrypted1.value).toBe(plaintext);
      expect(decrypted2.value).toBe(plaintext);
    }
  });
});
