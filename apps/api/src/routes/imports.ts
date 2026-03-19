// ---------------------------------------------------------------------------
// Import routes — Hono handlers (SPEC SS7)
// ---------------------------------------------------------------------------

import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth.js";
import { createDb } from "../db/index.js";
import type * as schema from "../db/schema.js";
import { createImportJobId, createUrl, createRecipeId, createCreatorId } from "@dough/shared";
import type {
  ImportJob,
  ImportSource,
  ImportStatus,
  ImportError,
  RecipeExtract,
} from "@dough/shared";
import { createLogger, type Logger } from "../lib/logger.js";
import {
  createImportService,
  createDefaultFetcher,
  createDefaultWordPressClient,
  createDefaultAgentExtractor,
  type RecipeExtractor,
  type AgentExtractor,
  type ImportQueue,
  type ImportServiceError,
} from "../services/import.js";

const imports = new Hono<AppEnv>();

/**
 * Build the import service from Hono context bindings.
 */
function getImportService(c: { env: AppEnv["Bindings"]; executionCtx?: ExecutionContext }) {
  const db = createDb(c.env.DB);

  const importLogger = createLogger("import-routes");

  const queue: ImportQueue = {
    async send(message: { importJobId: string }) {
      try {
        await c.env.IMPORT_QUEUE.send(message);
      } catch (e: unknown) {
        // Queue send failed — process in background via waitUntil
        // so the HTTP response returns immediately.
        const errorMsg = e instanceof Error ? e.message : "Unknown error";
        importLogger.warn("queue_send_fallback", {
          importJobId: message.importJobId,
          reason: errorMsg,
          hint: "Queue unavailable. Processing via waitUntil background task.",
        });

        // Use waitUntil to process in the background without blocking the response
        const ctx = c.executionCtx;
        const fallbackDb = createDb(c.env.DB);
        const fallbackFetcher = createDefaultFetcher();
        const fallbackWordpress = createDefaultWordPressClient(fallbackFetcher);
        const fallbackExtractor: RecipeExtractor = {
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

        let fallbackAgent: AgentExtractor | undefined;
        if (c.env.AI !== undefined || c.env.ANTHROPIC_API_KEY !== undefined) {
          fallbackAgent = createDefaultAgentExtractor(c.env.AI, c.env.ANTHROPIC_API_KEY);
        }

        const fallbackService = createImportService({
          db: fallbackDb,
          queue: { async send() {} },
          extractor: fallbackExtractor,
          fetcher: fallbackFetcher,
          wordpress: fallbackWordpress,
          agentExtractor: fallbackAgent,
        });

        const jobId = createImportJobId(message.importJobId);

        // Process in background — don't block the HTTP response
        const backgroundTask = fallbackService.processImportJob(jobId).then((result) => {
          if (!result.ok) {
            importLogger.warn("queue_fallback_processing_failed", {
              importJobId: message.importJobId,
              error: result.error.type,
            });
          } else {
            importLogger.info("queue_fallback_processing_completed", {
              importJobId: message.importJobId,
            });
          }
        });

        if (ctx && typeof ctx.waitUntil === "function") {
          ctx.waitUntil(backgroundTask);
        } else {
          // In local dev without waitUntil, await synchronously
          await backgroundTask;
        }
      }
    },
  };

  // Legacy AI extractor — falls back to error when agent is not available
  const extractor: RecipeExtractor = {
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

  // Create agent extractor using Workers AI binding
  let agentExtractor: AgentExtractor | undefined;
  if (c.env.AI !== undefined || c.env.ANTHROPIC_API_KEY !== undefined) {
    agentExtractor = createDefaultAgentExtractor(c.env.AI, c.env.ANTHROPIC_API_KEY);
  }

  const fetcher = createDefaultFetcher();
  const wordpress = createDefaultWordPressClient(fetcher);

  return createImportService({
    db,
    queue,
    extractor,
    fetcher,
    wordpress,
    agentExtractor,
  });
}

/**
 * Map service errors to HTTP status codes and response bodies.
 */
function errorResponse(error: ImportServiceError): {
  status: 400 | 404 | 409 | 500;
  body: { error: string; message: string };
} {
  switch (error.type) {
    case "NotFound":
      return {
        status: 404,
        body: { error: "NotFound", message: "Import job not found" },
      };
    case "InvalidTransition":
      return {
        status: 409,
        body: { error: "InvalidTransition", message: error.message },
      };
    case "ImportError":
      return {
        status: 400,
        body: {
          error: error.error.type,
          message: "reason" in error.error ? error.error.reason : error.error.type,
        },
      };
    case "DatabaseError":
      return {
        status: 500,
        body: { error: "DatabaseError", message: error.message },
      };
    case "ValidationError":
      return {
        status: 400,
        body: { error: "ValidationError", message: error.message },
      };
  }
}

// ---------------------------------------------------------------------------
// DB row -> ImportJob transform
// ---------------------------------------------------------------------------

/**
 * Build the ImportSource discriminated union from flat DB fields.
 */
function buildImportSource(
  sourceType: string,
  sourceData: Record<string, unknown> | null,
): ImportSource {
  const data = sourceData ?? {};
  switch (sourceType) {
    case "FromUrl": {
      const raw = typeof data["url"] === "string" ? data["url"] : "";
      const url = createUrl(raw);
      return { type: "FromUrl", url: url ?? (raw as ReturnType<typeof createUrl> & string) };
    }
    case "FromInstagramPost": {
      const raw = typeof data["url"] === "string" ? data["url"] : "";
      const url = createUrl(raw);
      return {
        type: "FromInstagramPost",
        url: url ?? (raw as ReturnType<typeof createUrl> & string),
      };
    }
    case "FromTikTokVideo": {
      const raw = typeof data["url"] === "string" ? data["url"] : "";
      const url = createUrl(raw);
      return {
        type: "FromTikTokVideo",
        url: url ?? (raw as ReturnType<typeof createUrl> & string),
      };
    }
    case "FromYouTubeVideo": {
      const raw = typeof data["url"] === "string" ? data["url"] : "";
      const url = createUrl(raw);
      return {
        type: "FromYouTubeVideo",
        url: url ?? (raw as ReturnType<typeof createUrl> & string),
      };
    }
    case "FromScreenshot": {
      const uploadId = typeof data["upload_id"] === "string" ? data["upload_id"] : "";
      return { type: "FromScreenshot", upload_id: uploadId };
    }
    case "FromInstagramBulk": {
      const handle = typeof data["account_handle"] === "string" ? data["account_handle"] : "";
      return { type: "FromInstagramBulk", account_handle: handle };
    }
    case "FromWordPressSync": {
      const raw = typeof data["site_url"] === "string" ? data["site_url"] : "";
      const url = createUrl(raw);
      return {
        type: "FromWordPressSync",
        site_url: url ?? (raw as ReturnType<typeof createUrl> & string),
      };
    }
    case "FromText": {
      // FromText imports don't have a URL — return as FromUrl with the
      // original text stashed in the URL field so retry / display still works.
      // The frontend's getSourceLabel default case already shows "Pasted text".
      return { type: "FromUrl", url: "" as ReturnType<typeof createUrl> & string };
    }
    default: {
      // Fallback: treat unknown source types as FromUrl with empty url
      const raw = typeof data["url"] === "string" ? data["url"] : "";
      const url = createUrl(raw);
      return { type: "FromUrl", url: url ?? (raw as ReturnType<typeof createUrl> & string) };
    }
  }
}

/**
 * Build the ImportError discriminated union from flat DB fields.
 */
function buildImportError(
  errorType: string | null,
  errorData: Record<string, unknown> | null,
): ImportError {
  const data = errorData ?? {};
  switch (errorType) {
    case "FetchFailed":
      return {
        type: "FetchFailed",
        reason: typeof data["reason"] === "string" ? data["reason"] : "Unknown fetch error",
      };
    case "VideoTooLong":
      return {
        type: "VideoTooLong",
        duration_seconds:
          typeof data["duration_seconds"] === "number" ? data["duration_seconds"] : 0,
      };
    case "FileTooLarge":
      return {
        type: "FileTooLarge",
        size_bytes: typeof data["size_bytes"] === "number" ? data["size_bytes"] : 0,
      };
    case "WordPressAuthFailed":
      return { type: "WordPressAuthFailed" };
    case "Timeout":
      return { type: "Timeout" };
    case "ExtractionFailed":
    default:
      return {
        type: "ExtractionFailed",
        reason: typeof data["reason"] === "string" ? data["reason"] : "Unknown error",
      };
  }
}

/**
 * Transform a flat DB row into the ImportJob discriminated union shape
 * expected by the frontend.
 */
function rowToImportJob(row: typeof schema.importJobs.$inferSelect): ImportJob {
  const source = buildImportSource(row.source_type, row.source_data ?? null);

  let status: ImportStatus;
  switch (row.status) {
    case "Processing":
      status = {
        type: "Processing",
        source,
        started_at: row.processing_started_at
          ? Date.parse(row.processing_started_at)
          : Date.parse(row.created_at),
      };
      break;
    case "NeedsReview":
      status = {
        type: "NeedsReview",
        source,
        extract: (row.extract_data ?? {}) as unknown as RecipeExtract,
      };
      break;
    case "Completed":
      status = {
        type: "Completed",
        source,
        recipe_id: createRecipeId(row.recipe_id ?? ""),
      };
      break;
    case "Failed":
      status = {
        type: "Failed",
        source,
        error: buildImportError(row.error_type ?? null, row.error_data ?? null),
      };
      break;
    case "Pending":
    default:
      status = { type: "Pending", source };
      break;
  }

  return {
    id: createImportJobId(row.id),
    creator_id: createCreatorId(row.creator_id),
    status,
    created_at: Date.parse(row.created_at),
    updated_at: Date.parse(row.updated_at),
  };
}

// ---------------------------------------------------------------------------
// POST /imports — create import job
// ---------------------------------------------------------------------------

imports.post("/", async (c) => {
  const creatorId = c.get("creatorId");
  const routeLogger: Logger =
    (c.get("logger" as never) as Logger | undefined) ?? createLogger("import-routes");
  const body = await c.req.json<{
    source_type?: unknown;
    source_data?: unknown;
    // Convenience fields — auto-maps to FromText / FromScreenshot
    text?: unknown;
    image?: unknown;
  }>();

  let sourceType = body.source_type;
  let sourceData = body.source_data;

  // Convenience: if `text` is provided without source_type, auto-detect
  if (sourceType === undefined && typeof body.text === "string") {
    sourceType = "FromText";
    sourceData = { text: body.text };
  }

  // Convenience: if `image` is provided without source_type, auto-detect
  if (sourceType === undefined && typeof body.image === "string") {
    sourceType = "FromScreenshot";
    sourceData = { image: body.image };
  }

  if (typeof sourceType !== "string") {
    return c.json({ error: "ValidationError", message: "source_type is required" }, 400);
  }

  if (sourceData === null || typeof sourceData !== "object") {
    return c.json({ error: "ValidationError", message: "source_data must be an object" }, 400);
  }

  routeLogger.info("import_create_request", {
    creator: creatorId,
    sourceType,
  });

  const service = getImportService(c);
  const result = await service.createImportJob(
    creatorId,
    sourceType,
    sourceData as Record<string, unknown>,
  );

  if (!result.ok) {
    const resp = errorResponse(result.error);
    routeLogger.error("import_create_failed", {
      creator: creatorId,
      errorType: result.error.type,
    });
    return c.json(resp.body, resp.status);
  }

  // Fetch the created row to return a full ImportJob shape
  const jobResult = await service.getImportJob(createImportJobId(result.value.id), creatorId);

  if (!jobResult.ok) {
    // Fallback: return minimal shape with the id
    return c.json(result.value, 201);
  }

  return c.json(rowToImportJob(jobResult.value), 201);
});

// ---------------------------------------------------------------------------
// GET /imports — list import jobs (paginated)
// ---------------------------------------------------------------------------

imports.get("/", async (c) => {
  const creatorId = c.get("creatorId");
  const limitStr = c.req.query("limit");
  const offsetStr = c.req.query("offset");

  const limit = limitStr !== undefined ? parseInt(limitStr, 10) : 50;
  const offset = offsetStr !== undefined ? parseInt(offsetStr, 10) : 0;

  const service = getImportService(c);
  const result = await service.listImportJobs(
    creatorId,
    isNaN(limit) ? 50 : limit,
    isNaN(offset) ? 0 : offset,
  );

  if (!result.ok) {
    const resp = errorResponse(result.error);
    return c.json(resp.body, resp.status);
  }

  return c.json({ jobs: result.value.map(rowToImportJob) }, 200);
});

// ---------------------------------------------------------------------------
// GET /imports/:id — get import job with extract
// ---------------------------------------------------------------------------

imports.get("/:id", async (c) => {
  const creatorId = c.get("creatorId");
  const jobId = createImportJobId(c.req.param("id"));

  const service = getImportService(c);
  const result = await service.getImportJob(jobId, creatorId);

  if (!result.ok) {
    const resp = errorResponse(result.error);
    return c.json(resp.body, resp.status);
  }

  return c.json(rowToImportJob(result.value), 200);
});

// ---------------------------------------------------------------------------
// POST /imports/:id/confirm — confirm extract, promote to recipe
// ---------------------------------------------------------------------------

imports.post("/:id/confirm", async (c) => {
  const creatorId = c.get("creatorId");
  const jobId = createImportJobId(c.req.param("id"));
  const routeLogger: Logger =
    (c.get("logger" as never) as Logger | undefined) ?? createLogger("import-routes");

  routeLogger.info("import_confirm_request", { jobId, creator: creatorId });

  const service = getImportService(c);
  const result = await service.confirmImport(jobId, creatorId);

  if (!result.ok) {
    const resp = errorResponse(result.error);
    routeLogger.error("import_confirm_failed", { jobId, errorType: result.error.type });
    return c.json(resp.body, resp.status);
  }

  // Fetch the updated row to return a full ImportJob shape
  const jobResult = await service.getImportJob(jobId, creatorId);

  if (!jobResult.ok) {
    // Fallback: return the recipeId
    return c.json(result.value, 200);
  }

  return c.json(rowToImportJob(jobResult.value), 200);
});

// ---------------------------------------------------------------------------
// POST /imports/:id/reject — reject/cancel import
// ---------------------------------------------------------------------------

imports.post("/:id/reject", async (c) => {
  const creatorId = c.get("creatorId");
  const jobId = createImportJobId(c.req.param("id"));
  const routeLogger: Logger =
    (c.get("logger" as never) as Logger | undefined) ?? createLogger("import-routes");

  routeLogger.info("import_reject_request", { jobId, creator: creatorId });

  const service = getImportService(c);
  const result = await service.rejectImport(jobId, creatorId);

  if (!result.ok) {
    const resp = errorResponse(result.error);
    routeLogger.error("import_reject_failed", { jobId, errorType: result.error.type });
    return c.json(resp.body, resp.status);
  }

  return c.json({ status: "rejected" }, 200);
});

// ---------------------------------------------------------------------------
// POST /imports/wordpress/test-connection
// ---------------------------------------------------------------------------

imports.post("/wordpress/test-connection", async (c) => {
  const body = await c.req.json<{
    site_url?: unknown;
    api_key?: unknown;
  }>();

  if (typeof body.site_url !== "string") {
    return c.json({ error: "ValidationError", message: "site_url is required" }, 400);
  }

  if (typeof body.api_key !== "string") {
    return c.json({ error: "ValidationError", message: "api_key is required" }, 400);
  }

  const service = getImportService(c);
  const result = await service.testWordPressConnection(body.site_url, body.api_key);

  if (!result.ok) {
    const resp = errorResponse(result.error);
    return c.json(resp.body, resp.status);
  }

  return c.json(result.value, 200);
});

// ---------------------------------------------------------------------------
// POST /imports/wordpress/sync
// ---------------------------------------------------------------------------

imports.post("/wordpress/sync", async (c) => {
  const creatorId = c.get("creatorId");
  const body = await c.req.json<{
    site_url?: unknown;
    api_key?: unknown;
    plugin?: unknown;
  }>();

  if (typeof body.site_url !== "string") {
    return c.json({ error: "ValidationError", message: "site_url is required" }, 400);
  }

  if (typeof body.api_key !== "string") {
    return c.json({ error: "ValidationError", message: "api_key is required" }, 400);
  }

  if (body.plugin !== "WpRecipeMaker" && body.plugin !== "TastyRecipes") {
    return c.json(
      {
        error: "ValidationError",
        message: "plugin must be 'WpRecipeMaker' or 'TastyRecipes'",
      },
      400,
    );
  }

  const service = getImportService(c);
  const result = await service.syncWordPress(creatorId, body.site_url, body.api_key, body.plugin);

  if (!result.ok) {
    const resp = errorResponse(result.error);
    return c.json(resp.body, resp.status);
  }

  return c.json(result.value, 200);
});

export { imports };
