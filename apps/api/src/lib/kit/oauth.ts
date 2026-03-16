// ---------------------------------------------------------------------------
// Kit OAuth 2.0 — Authorization Code Flow
// ---------------------------------------------------------------------------
// Handles the OAuth 2.0 authorization code flow for Kit's V4 API.
//
// Authorization URL: https://api.kit.com/v4/oauth/authorize
// Token URL:         https://api.kit.com/v4/oauth/token
//
// Docs: https://developers.kit.com/api-reference/oauth-refresh-token-flow
// ---------------------------------------------------------------------------

import type { Result } from "@crumb/shared";
import { ok, err } from "@crumb/shared";
import type { KitApiError, KitOAuthTokenResponse } from "./types.js";
import { KIT_API_ERROR_CODE } from "./types.js";
import type { FetchFn } from "./client.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTHORIZE_URL = "https://api.kit.com/v4/oauth/authorize";
const TOKEN_URL = "https://api.kit.com/v4/oauth/token";

/**
 * All OAuth scopes required by the application per SPEC 4.1.
 * These map to Kit's OAuth scope string values.
 */
export const KIT_OAUTH_SCOPES = [
  "subscribers:read",
  "subscribers:write",
  "broadcasts:read",
  "broadcasts:write",
  "tags:read",
  "tags:write",
  "sequences:read",
  "forms:read",
  "purchases:write",
  "webhooks:write",
] as const;

export type KitOAuthScope = (typeof KIT_OAUTH_SCOPES)[number];

// ---------------------------------------------------------------------------
// Authorization URL
// ---------------------------------------------------------------------------

/**
 * Generates the Kit OAuth authorization URL for the authorization code flow.
 *
 * @param clientId - The app's OAuth client ID.
 * @param redirectUri - The callback URI registered with Kit.
 * @param scopes - The OAuth scopes to request.
 * @param state - Optional CSRF protection state value.
 */
export function getAuthorizationUrl(
  clientId: string,
  redirectUri: string,
  scopes: readonly string[],
  state?: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
  });

  if (state !== undefined) {
    params.set("state", state);
  }

  return `${AUTHORIZE_URL}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Token Exchange
// ---------------------------------------------------------------------------

/**
 * Exchanges an authorization code for access and refresh tokens.
 */
export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<Result<KitOAuthTokenResponse, KitApiError>> {
  return tokenRequest(
    {
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    },
    fetchFn,
  );
}

// ---------------------------------------------------------------------------
// Token Refresh
// ---------------------------------------------------------------------------

/**
 * Refreshes an expired access token using the refresh token.
 */
export async function refreshToken(
  refreshTokenValue: string,
  clientId: string,
  clientSecret: string,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<Result<KitOAuthTokenResponse, KitApiError>> {
  return tokenRequest(
    {
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshTokenValue,
    },
    fetchFn,
  );
}

// ---------------------------------------------------------------------------
// Shared token request helper
// ---------------------------------------------------------------------------

async function tokenRequest(
  body: Record<string, string>,
  fetchFn: FetchFn,
): Promise<Result<KitOAuthTokenResponse, KitApiError>> {
  let response: Response;
  try {
    response = await fetchFn(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Network error";
    return err({
      status: 0,
      code: KIT_API_ERROR_CODE.NetworkError,
      messages: [message],
    });
  }

  if (!response.ok) {
    let messages: readonly string[];
    try {
      const errorBody = (await response.json()) as {
        errors?: readonly string[];
      };
      messages = Array.isArray(errorBody.errors)
        ? errorBody.errors
        : [`HTTP ${response.status}`];
    } catch {
      messages = [`HTTP ${response.status}`];
    }

    return err({
      status: response.status,
      code:
        response.status === 401
          ? KIT_API_ERROR_CODE.Unauthorized
          : KIT_API_ERROR_CODE.Unknown,
      messages,
    });
  }

  try {
    const data = (await response.json()) as KitOAuthTokenResponse;
    return ok(data);
  } catch {
    return err({
      status: response.status,
      code: KIT_API_ERROR_CODE.Unknown,
      messages: ["Failed to parse token response"],
    });
  }
}

// ---------------------------------------------------------------------------
// Token Encryption / Decryption — AES-256-GCM using Web Crypto API
// ---------------------------------------------------------------------------
// Tokens are encrypted at rest in the database. The encryption key is
// derived from a master secret.
// ---------------------------------------------------------------------------

/** Byte length of the AES-256 key (32 bytes = 256 bits). */
const AES_KEY_LENGTH = 256;

/** Byte length of the GCM initialization vector (12 bytes). */
const IV_LENGTH = 12;

/**
 * Derive an AES-256-GCM CryptoKey from a master secret using HKDF.
 *
 * @param masterSecret - The raw secret bytes.
 * @param salt - An optional salt for key derivation (e.g., creator ID).
 */
export async function deriveEncryptionKey(
  masterSecret: BufferSource,
  salt: BufferSource,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    masterSecret,
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: new TextEncoder().encode("kit-token-encryption"),
    },
    baseKey,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * Returns the IV prepended to the ciphertext, base64-encoded.
 */
export async function encryptToken(
  plaintext: string,
  key: CryptoKey,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );

  // Prepend IV to ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return uint8ArrayToBase64(combined);
}

/**
 * Decrypt a base64-encoded ciphertext (IV + ciphertext) using AES-256-GCM.
 */
export async function decryptToken(
  encryptedBase64: string,
  key: CryptoKey,
): Promise<Result<string, string>> {
  let combined: Uint8Array;
  try {
    combined = base64ToUint8Array(encryptedBase64);
  } catch {
    return err("Invalid base64 input");
  }

  if (combined.length < IV_LENGTH + 1) {
    return err("Ciphertext too short");
  }

  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );
    return ok(new TextDecoder().decode(decrypted));
  } catch {
    return err("Decryption failed");
  }
}

// ---------------------------------------------------------------------------
// Base64 helpers — use standard btoa/atob available in Workers
// ---------------------------------------------------------------------------

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
