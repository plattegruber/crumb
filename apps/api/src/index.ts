import { Hono } from "hono";
import type { AppEnv } from "./middleware/auth.js";
import { clerkAuth } from "./middleware/auth.js";
import { recipeRoutes } from "./routes/recipes.js";
import { collectionRoutes } from "./routes/collections.js";
import { segmentationRoutes } from "./routes/segmentation.js";
import { imports } from "./routes/imports.js";
import { analyticsRoutes, webhookRoutes } from "./routes/analytics.js";
import { automationRoutes, createSaveRedirectRoutes } from "./routes/automation.js";
import { productRoutes } from "./routes/products.js";
import { publishingRoutes } from "./routes/publishing.js";
import { createDb } from "./db/index.js";
import { handleImportQueue } from "./services/queue-handlers.js";
import type { Env } from "./env.js";

export type { AppEnv } from "./middleware/auth.js";
export type { AuthContext, CreatorId } from "./types/auth.js";

/** Paths that do not require authentication. */
const PUBLIC_PATHS = new Set(["/health"]);

/** Paths/prefixes that are public (webhook HMAC or save redirect). */
const PUBLIC_PATH_PREFIXES = ["/webhooks/", "/save/"];

const app = new Hono<AppEnv>();

// Apply Clerk JWT auth to every route except public paths.
app.use("*", async (c, next) => {
  if (PUBLIC_PATHS.has(c.req.path)) {
    await next();
    return;
  }
  for (const prefix of PUBLIC_PATH_PREFIXES) {
    if (c.req.path.startsWith(prefix)) {
      await next();
      return;
    }
  }
  return clerkAuth()(c, next);
});

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------

app.get("/health", (c) => {
  return c.json({ status: "ok" }, 200);
});

// Webhook routes (public, HMAC-verified)
app.route("/webhooks", webhookRoutes);

// Save This Recipe redirect endpoint (public, no auth required)
app.route("/save", createSaveRedirectRoutes());

// ---------------------------------------------------------------------------
// Authenticated routes
// ---------------------------------------------------------------------------

app.route("/recipes", recipeRoutes);
app.route("/collections", collectionRoutes);
app.route("/analytics", analyticsRoutes);
app.route("/automation", automationRoutes);
app.route("/products", productRoutes);

// ---------------------------------------------------------------------------
// Publishing Pipeline routes (SPEC §12)
// ---------------------------------------------------------------------------

app.route("/products", publishingRoutes);

// ---------------------------------------------------------------------------
// Segmentation Engine routes (SPEC §9)
// ---------------------------------------------------------------------------

app.route("/", segmentationRoutes);

// ---------------------------------------------------------------------------
// Import pipeline routes (SPEC §7)
// ---------------------------------------------------------------------------

app.route("/imports", imports);

// ---------------------------------------------------------------------------
// Worker export with queue handler
// ---------------------------------------------------------------------------

export default {
  fetch: app.fetch,
  async queue(
    batch: MessageBatch<Record<string, unknown>>,
    env: Env,
  ): Promise<void> {
    const db = createDb(env.DB);

    const queue = {
      async send(message: { importJobId: string }) {
        await env.IMPORT_QUEUE.send(message);
      },
    };

    // Placeholder extractor — will be replaced with real AI implementation
    const extractor = {
      async extract(_text: string) {
        return {
          ok: false as const,
          error: {
            type: "ExtractionFailed" as const,
            reason: "AI extraction not yet configured",
          },
        };
      },
    };

    await handleImportQueue(
      {
        messages: batch.messages.map((msg) => ({
          body: msg.body,
          ack: () => msg.ack(),
          retry: () => msg.retry(),
        })),
      },
      { db, queue, extractor },
    );
  },
};
