// ---------------------------------------------------------------------------
// Temporary R2 storage helpers for the video import pipeline
// ---------------------------------------------------------------------------
// Video import jobs store intermediate artifacts (downloaded video, extracted
// frame, extracted audio) under a per-job prefix in R2. These helpers manage
// the key namespace and provide best-effort cleanup after processing.
// ---------------------------------------------------------------------------

import type { Result, ImportError } from "@dough/shared";
import { ok, err } from "@dough/shared";
import type { Logger } from "../logger.js";

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

/**
 * Generate a namespaced R2 key for a temporary video import artifact.
 *
 * All temp keys live under `tmp/video-import/{jobId}/` so they can be listed
 * and bulk-deleted during cleanup.
 *
 * @param jobId  The import job ID (used as the namespace).
 * @param suffix The artifact name, e.g. "source.mp4", "frame.jpg", "audio.m4a".
 * @returns      The full R2 object key.
 */
export function generateTempKey(jobId: string, suffix: string): string {
  return `tmp/video-import/${jobId}/${suffix}`;
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/**
 * Upload data to a temporary R2 key with error handling.
 *
 * Wraps `R2Bucket.put` and returns a `Result` so callers can handle failures
 * without try/catch.
 *
 * @param bucket      The R2 bucket binding.
 * @param key         The full R2 object key (use `generateTempKey`).
 * @param data        The data to upload (ReadableStream or ArrayBuffer).
 * @param contentType The MIME type for the stored object.
 */
export async function uploadToTempR2(
  bucket: R2Bucket,
  key: string,
  data: ReadableStream | ArrayBuffer,
  contentType: string,
): Promise<Result<void, ImportError>> {
  try {
    await bucket.put(key, data, {
      httpMetadata: { contentType },
    });
    return ok(undefined);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown R2 upload error";
    return err({ type: "ExtractionFailed", reason: `R2 upload failed: ${message}` });
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Delete all temporary R2 objects for a given job.
 *
 * Lists every key under `tmp/video-import/{jobId}/` and deletes them.
 * This is best-effort: errors are logged but never thrown, so cleanup
 * failures do not block the import pipeline.
 *
 * @param bucket  The R2 bucket binding.
 * @param jobId   The import job ID whose temp artifacts should be removed.
 * @param logger  Logger instance for error reporting.
 */
export async function cleanupTempR2(
  bucket: R2Bucket,
  jobId: string,
  logger: Logger,
): Promise<void> {
  const prefix = `tmp/video-import/${jobId}/`;

  try {
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const listed = await bucket.list({ prefix, cursor });
      const keys = listed.objects.map((obj) => obj.key);

      if (keys.length > 0) {
        await bucket.delete(keys);
        logger.info("temp_r2_cleanup_deleted", {
          jobId,
          count: keys.length,
        });
      }

      hasMore = listed.truncated;
      cursor = listed.truncated ? listed.cursor : undefined;
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown R2 cleanup error";
    logger.error("temp_r2_cleanup_failed", { jobId, error: message });
  }
}
