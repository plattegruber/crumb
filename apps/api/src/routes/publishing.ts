/**
 * Publishing Pipeline HTTP routes (SPEC §12).
 *
 * Wires the publishing service to Hono endpoints.
 */
import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth.js";
import { createDb } from "../db/index.js";
import { withCreatorScope } from "../middleware/creator-scope.js";
import {
  publishToPlatform,
  getProductListings,
  packageForDownload,
  generateShareAssets,
  validatePlatform,
} from "../services/publishing.js";
import type { PublishError } from "../services/publishing.js";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const publishingRoutes = new Hono<AppEnv>();

/**
 * Map a PublishError to an HTTP status code.
 */
function errorToStatus(error: PublishError): ContentfulStatusCode {
  switch (error.type) {
    case "not_found":
      return 404;
    case "not_published_status":
    case "no_pdf":
    case "invalid_platform":
      return 400;
    case "platform_unavailable":
      return 502;
    case "file_upload_rejected":
      return 422;
    case "storage_error":
      return 500;
  }
}

/**
 * POST /products/:id/publish/:platform — Publish to a specific platform.
 *
 * The adapter must be provided by the caller. In production, this would
 * be resolved from the platform parameter and creator's stored credentials.
 * For now, this route returns a 501 since adapter construction requires
 * creator-specific credentials that are not yet wired up.
 */
publishingRoutes.post("/:id/publish/:platform", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const productId = c.req.param("id");
  const platformParam = c.req.param("platform");

  const platformResult = validatePlatform(platformParam);
  if (!platformResult.ok) {
    return c.json({ error: platformResult.error }, errorToStatus(platformResult.error));
  }

  // In production, the adapter would be constructed from the creator's
  // stored credentials for the given platform. For now, we return a
  // descriptive error since credential management is not yet built.
  return c.json(
    {
      error: {
        type: "platform_unavailable",
        platform: platformParam,
        message: "Platform adapter not yet configured. Use the download package fallback.",
      },
    },
    502,
  );
});

/**
 * POST /products/:id/download-package — Generate download package (fallback).
 */
publishingRoutes.post("/:id/download-package", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const productId = c.req.param("id");

  // Adapt R2Bucket to our StorageBucket interface
  const storage = {
    async get(key: string) {
      const obj = await c.env.STORAGE.get(key);
      if (obj === null) return null;
      return { body: obj.body };
    },
    async put(key: string, value: ReadableStream | ArrayBuffer | string) {
      await c.env.STORAGE.put(key, value);
    },
  };

  const result = await packageForDownload(scopedDb, productId, storage);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 200);
});

/**
 * POST /products/:id/share-assets — Generate social share assets.
 */
publishingRoutes.post("/:id/share-assets", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const productId = c.req.param("id");

  const result = await generateShareAssets(scopedDb, productId);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 200);
});

/**
 * GET /products/:id/listings — Get published listings.
 */
publishingRoutes.get("/:id/listings", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const scopedDb = withCreatorScope(db, creatorId);

  const productId = c.req.param("id");

  const result = await getProductListings(scopedDb, productId);

  if (!result.ok) {
    return c.json({ error: result.error }, errorToStatus(result.error));
  }

  return c.json(result.value, 200);
});

export { publishingRoutes };
