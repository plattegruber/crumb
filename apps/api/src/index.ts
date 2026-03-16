import { Hono } from "hono";
import { cors } from "hono/cors";
import { clerkAuth } from "./middleware/auth.js";
import { requestLogger } from "./middleware/request-logger.js";
import type { AppEnvWithLogger } from "./middleware/request-logger.js";
import { recipeRoutes } from "./routes/recipes.js";
import { collectionRoutes } from "./routes/collections.js";
import { segmentationRoutes } from "./routes/segmentation.js";
import { imports } from "./routes/imports.js";
import { analyticsRoutes, webhookRoutes } from "./routes/analytics.js";
import { automationRoutes, createSaveRedirectRoutes } from "./routes/automation.js";
import { productRoutes } from "./routes/products.js";
import { publishingRoutes } from "./routes/publishing.js";
import { createDb } from "./db/index.js";
import { creators } from "./db/schema.js";
import { eq } from "drizzle-orm";
import { handleImportQueue } from "./services/queue-handlers.js";
import { createLogger } from "./lib/logger.js";
import type { Env } from "./env.js";

export type { AppEnv } from "./middleware/auth.js";
export type { AppEnvWithLogger } from "./middleware/request-logger.js";
export type { AuthContext, CreatorId } from "./types/auth.js";

/** Paths that do not require authentication. */
const PUBLIC_PATHS = new Set(["/health"]);

/** Paths/prefixes that are public (webhook HMAC or save redirect). */
const PUBLIC_PATH_PREFIXES = ["/webhooks/", "/save/"];

const app = new Hono<AppEnvWithLogger>();

// CORS — allow the SvelteKit dev server (localhost:5173) to call the API.
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

// Apply request logging middleware to all routes (first in chain).
app.use("*", requestLogger());

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
  return clerkAuth()(c as unknown as Parameters<ReturnType<typeof clerkAuth>>[0], next);
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

// Ensure a creator record exists for the authenticated user.
// Auto-creates on first request so Clerk users don't need a separate signup.
app.use("*", async (c, next) => {
  const creatorId = c.get("creatorId" as never) as string | undefined;
  if (!creatorId) {
    await next();
    return;
  }
  const db = createDb(c.env.DB);
  const existing = await db
    .select({ id: creators.id })
    .from(creators)
    .where(eq(creators.id, creatorId))
    .limit(1);
  if (existing.length === 0) {
    const now = new Date().toISOString();
    await db.insert(creators).values({
      id: creatorId,
      email: "",
      name: "Creator",
      password_hash: "",
      subscription_tier: "Free",
      subscription_started_at: now,
      created_at: now,
      updated_at: now,
    });
  }
  await next();
});

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
  async queue(batch: MessageBatch<Record<string, unknown>>, env: Env): Promise<void> {
    const logger = createLogger("queue-handler", undefined, env.LOG_LEVEL);
    logger.info("queue_batch_received", {
      queueName: "import-pipeline",
      messageCount: batch.messages.length,
    });

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

    logger.info("queue_batch_completed", {
      queueName: "import-pipeline",
      messageCount: batch.messages.length,
    });
  },
};
