// ---------------------------------------------------------------------------
// Kit Webhook Verification
// ---------------------------------------------------------------------------
// Verifies incoming Kit webhook payloads using HMAC-SHA256.
//
// SPEC 4.3: Webhook payloads are verified using HMAC-SHA256 with the Kit
// webhook secret. Unverified payloads are rejected with 403.
// ---------------------------------------------------------------------------

import type { Result } from "@crumb/shared";
import { ok, err } from "@crumb/shared";
import type { KitWebhookEventName } from "./types.js";
import { createLogger } from "../logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebhookVerificationError {
  readonly type: "invalid_signature" | "missing_signature";
  readonly message: string;
}

/**
 * Inbound Kit webhook payload shape.
 * The exact payload varies by event type, but all share these fields.
 */
export interface KitWebhookPayload {
  readonly event: KitWebhookEventName;
  readonly subscriber?: {
    readonly id: number;
    readonly email_address: string;
    readonly first_name: string | null;
    readonly state: string;
    readonly fields: Readonly<Record<string, string | null>>;
  };
  readonly tag?: {
    readonly id: number;
    readonly name: string;
  };
  readonly purchase?: {
    readonly id: number;
    readonly transaction_id: string;
    readonly total: number;
  };
  readonly url?: string;
}

// ---------------------------------------------------------------------------
// HMAC-SHA256 Verification
// ---------------------------------------------------------------------------

/**
 * Verify a Kit webhook signature using HMAC-SHA256.
 *
 * @param payload - The raw request body string.
 * @param signature - The signature from the webhook request header.
 * @param secret - The webhook signing secret.
 * @returns `ok(undefined)` if valid, `err(WebhookVerificationError)` if not.
 */
const webhookLogger = createLogger("kit-webhooks");

export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<Result<void, WebhookVerificationError>> {
  if (!signature) {
    return err({
      type: "missing_signature",
      message: "Webhook signature is missing",
    });
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const expectedSignature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  const expectedHex = arrayBufferToHex(expectedSignature);

  // Constant-time comparison to prevent timing attacks
  if (!constantTimeEqual(signature, expectedHex)) {
    webhookLogger.warn("webhook_signature_rejected");
    return err({
      type: "invalid_signature",
      message: "Webhook signature verification failed",
    });
  }

  webhookLogger.debug("webhook_signature_verified");
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function arrayBufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += (bytes[i] as number).toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Constant-time string comparison.
 *
 * Compares all bytes regardless of where the first mismatch occurs,
 * preventing timing side-channel attacks.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return mismatch === 0;
}
