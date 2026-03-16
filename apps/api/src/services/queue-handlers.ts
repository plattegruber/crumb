// ---------------------------------------------------------------------------
// Queue consumer handlers (SPEC SS7)
// ---------------------------------------------------------------------------
// Handles messages from IMPORT_QUEUE by delegating to the import service.
// ---------------------------------------------------------------------------

import type { Database } from "../db/index.js";
import type { ImportJobId } from "@crumb/shared";
import { createImportJobId } from "@crumb/shared";
import { createLogger } from "../lib/logger.js";
import {
  createImportService,
  createDefaultFetcher,
  createDefaultWordPressClient,
  type RecipeExtractor,
  type ImportQueue,
} from "./import.js";

export interface QueueHandlerDeps {
  readonly db: Database;
  readonly queue: ImportQueue;
  readonly extractor: RecipeExtractor;
}

export interface QueueMessage {
  readonly body: unknown;
  ack(): void;
  retry(): void;
}

export interface QueueBatch {
  readonly messages: readonly QueueMessage[];
}

/**
 * Handle a batch of import queue messages.
 *
 * Each message body is expected to be `{ importJobId: string }`.
 * For each message, we:
 * 1. Parse the import job ID from the message body
 * 2. Call processImportJob on the import service
 * 3. Ack on success, retry on error
 */
export async function handleImportQueue(
  batch: QueueBatch,
  deps: QueueHandlerDeps,
): Promise<void> {
  const logger = createLogger("queue-handler");
  const fetcher = createDefaultFetcher();
  const wordpress = createDefaultWordPressClient(fetcher);

  const importService = createImportService({
    db: deps.db,
    queue: deps.queue,
    extractor: deps.extractor,
    fetcher,
    wordpress,
    logger,
  });

  for (const message of batch.messages) {
    try {
      const body = message.body;
      if (
        body === null ||
        typeof body !== "object" ||
        !("importJobId" in body)
      ) {
        // Invalid message format — ack to avoid infinite retries
        message.ack();
        continue;
      }

      const bodyObj = body as Record<string, unknown>;
      const jobIdStr = bodyObj["importJobId"];
      if (typeof jobIdStr !== "string") {
        message.ack();
        continue;
      }

      const jobId = createImportJobId(jobIdStr);
      const result = await importService.processImportJob(jobId);

      if (result.ok) {
        message.ack();
      } else {
        const error = result.error;
        if (error.type === "NotFound") {
          // Job doesn't exist — ack to avoid retries
          message.ack();
        } else if (error.type === "InvalidTransition") {
          // Job is in wrong state (e.g. already processed) — ack
          message.ack();
        } else {
          // Transient error — retry
          message.retry();
        }
      }
    } catch {
      // Unexpected error — retry the message
      message.retry();
    }
  }
}
