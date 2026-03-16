// ---------------------------------------------------------------------------
// Tests for Kit webhook verification
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { verifyWebhookSignature } from "../../../src/lib/kit/webhooks.js";

// ---------------------------------------------------------------------------
// Helper: compute HMAC-SHA256 hex digest
// ---------------------------------------------------------------------------

async function computeHmacHex(
  payload: string,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  const bytes = new Uint8Array(signature);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += (bytes[i] as number).toString(16).padStart(2, "0");
  }
  return hex;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("verifyWebhookSignature", () => {
  const secret = "webhook-signing-secret-123";

  it("accepts a valid signature", async () => {
    const payload = JSON.stringify({
      event: "subscriber_activate",
      subscriber: { id: 1, email_address: "test@example.com" },
    });

    const signature = await computeHmacHex(payload, secret);
    const result = await verifyWebhookSignature(payload, signature, secret);

    expect(result.ok).toBe(true);
  });

  it("rejects an invalid signature", async () => {
    const payload = JSON.stringify({
      event: "subscriber_activate",
      subscriber: { id: 1, email_address: "test@example.com" },
    });

    const wrongSignature = "a".repeat(64);
    const result = await verifyWebhookSignature(payload, wrongSignature, secret);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("invalid_signature");
    }
  });

  it("rejects a tampered payload", async () => {
    const originalPayload = JSON.stringify({
      event: "subscriber_activate",
      subscriber: { id: 1, email_address: "test@example.com" },
    });

    const signature = await computeHmacHex(originalPayload, secret);

    // Tamper with the payload
    const tamperedPayload = JSON.stringify({
      event: "subscriber_activate",
      subscriber: { id: 999, email_address: "attacker@evil.com" },
    });

    const result = await verifyWebhookSignature(tamperedPayload, signature, secret);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("invalid_signature");
    }
  });

  it("rejects an empty signature", async () => {
    const payload = JSON.stringify({ event: "subscriber_activate" });
    const result = await verifyWebhookSignature(payload, "", secret);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("missing_signature");
    }
  });

  it("rejects signature with wrong length", async () => {
    const payload = JSON.stringify({ event: "subscriber_activate" });
    const result = await verifyWebhookSignature(payload, "tooshort", secret);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("invalid_signature");
    }
  });

  it("handles different secrets correctly", async () => {
    const payload = JSON.stringify({ event: "subscriber_activate" });

    const signatureWithSecret1 = await computeHmacHex(payload, "secret-1");
    const signatureWithSecret2 = await computeHmacHex(payload, "secret-2");

    // Verify with correct secret should pass
    const result1 = await verifyWebhookSignature(payload, signatureWithSecret1, "secret-1");
    expect(result1.ok).toBe(true);

    // Verify with wrong secret should fail
    const result2 = await verifyWebhookSignature(payload, signatureWithSecret2, "secret-1");
    expect(result2.ok).toBe(false);
  });

  it("handles various payload content types", async () => {
    // Large payload
    const largePayload = JSON.stringify({
      event: "purchase_create",
      purchase: {
        id: 12345,
        transaction_id: "txn_abc",
        products: Array.from({ length: 50 }, (_, i) => ({
          name: `Product ${i}`,
          pid: `pid_${i}`,
        })),
      },
    });

    const signature = await computeHmacHex(largePayload, secret);
    const result = await verifyWebhookSignature(largePayload, signature, secret);
    expect(result.ok).toBe(true);
  });
});
