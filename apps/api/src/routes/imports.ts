// ---------------------------------------------------------------------------
// Import routes — Hono handlers (SPEC SS7)
// ---------------------------------------------------------------------------

import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth.js";
import { createDb } from "../db/index.js";
import { createImportJobId } from "@crumb/shared";
import {
  createImportService,
  createDefaultFetcher,
  createDefaultWordPressClient,
  type RecipeExtractor,
  type ImportQueue,
  type ImportServiceError,
} from "../services/import.js";

const imports = new Hono<AppEnv>();

/**
 * Build the import service from Hono context bindings.
 */
function getImportService(c: { env: AppEnv["Bindings"] }) {
  const db = createDb(c.env.DB);

  const queue: ImportQueue = {
    async send(message: { importJobId: string }) {
      await c.env.IMPORT_QUEUE.send(message);
    },
  };

  // Placeholder AI extractor — will be replaced with real implementation
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

  const fetcher = createDefaultFetcher();
  const wordpress = createDefaultWordPressClient(fetcher);

  return createImportService({
    db,
    queue,
    extractor,
    fetcher,
    wordpress,
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
// POST /imports — create import job
// ---------------------------------------------------------------------------

imports.post("/", async (c) => {
  const creatorId = c.get("creatorId");
  const body = await c.req.json<{
    source_type?: unknown;
    source_data?: unknown;
  }>();

  const sourceType = body.source_type;
  const sourceData = body.source_data;

  if (typeof sourceType !== "string") {
    return c.json({ error: "ValidationError", message: "source_type is required" }, 400);
  }

  if (sourceData === null || typeof sourceData !== "object") {
    return c.json({ error: "ValidationError", message: "source_data must be an object" }, 400);
  }

  const service = getImportService(c);
  const result = await service.createImportJob(
    creatorId,
    sourceType,
    sourceData as Record<string, unknown>,
  );

  if (!result.ok) {
    const resp = errorResponse(result.error);
    return c.json(resp.body, resp.status);
  }

  return c.json(result.value, 201);
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

  return c.json({ jobs: result.value }, 200);
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

  return c.json(result.value, 200);
});

// ---------------------------------------------------------------------------
// POST /imports/:id/confirm — confirm extract, promote to recipe
// ---------------------------------------------------------------------------

imports.post("/:id/confirm", async (c) => {
  const creatorId = c.get("creatorId");
  const jobId = createImportJobId(c.req.param("id"));

  const service = getImportService(c);
  const result = await service.confirmImport(jobId, creatorId);

  if (!result.ok) {
    const resp = errorResponse(result.error);
    return c.json(resp.body, resp.status);
  }

  return c.json(result.value, 200);
});

// ---------------------------------------------------------------------------
// POST /imports/:id/reject — reject/cancel import
// ---------------------------------------------------------------------------

imports.post("/:id/reject", async (c) => {
  const creatorId = c.get("creatorId");
  const jobId = createImportJobId(c.req.param("id"));

  const service = getImportService(c);
  const result = await service.rejectImport(jobId, creatorId);

  if (!result.ok) {
    const resp = errorResponse(result.error);
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
