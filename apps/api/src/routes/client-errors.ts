/**
 * Client error ingest endpoint.
 *
 * Receives structured error reports from the frontend and logs them
 * through the standard logger (which flushes to Axiom when configured).
 * This allows frontend errors to appear alongside backend logs with
 * session/correlation context.
 *
 * POST /client-errors — no auth required (errors can occur before auth).
 */

import { Hono } from "hono";
import type { AppEnvWithLogger } from "../middleware/request-logger.js";

export const clientErrorRoutes = new Hono<AppEnvWithLogger>();

/** Max payload size to prevent abuse (4 KB). */
const MAX_BODY_SIZE = 4096;

const VALID_SOURCES = new Set([
  "svelte-boundary",
  "window-onerror",
  "unhandled-rejection",
  "hooks-client",
]);

clientErrorRoutes.post("/", async (c) => {
  const logger = c.get("logger");

  // Basic size guard
  const contentLength = c.req.header("Content-Length");
  if (contentLength !== undefined && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return c.json({ error: "Payload too large" }, 413);
  }

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  // Validate required fields
  const source = body["source"];
  const message = body["message"];
  const errorName = body["errorName"];

  if (typeof source !== "string" || !VALID_SOURCES.has(source)) {
    return c.json({ error: "Invalid source" }, 400);
  }
  if (typeof message !== "string" || message.length === 0) {
    return c.json({ error: "Missing message" }, 400);
  }
  if (typeof errorName !== "string") {
    return c.json({ error: "Missing errorName" }, 400);
  }

  // Log the client error through the standard pipeline (→ Axiom)
  logger.error("client_error", {
    source,
    errorName,
    message: typeof message === "string" ? message.slice(0, 500) : String(message),
    stack: typeof body["stack"] === "string" ? body["stack"].slice(0, 2000) : null,
    clientRoute: typeof body["route"] === "string" ? body["route"] : null,
    clientSessionId: typeof body["sessionId"] === "string" ? body["sessionId"] : null,
    clientTimestamp: typeof body["timestamp"] === "string" ? body["timestamp"] : null,
    context: body["context"] !== undefined && body["context"] !== null ? body["context"] : null,
  });

  return c.json({ ok: true }, 200);
});
