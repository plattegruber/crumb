// ---------------------------------------------------------------------------
// Queue consumer handlers (SPEC SS7)
// ---------------------------------------------------------------------------
// Handles messages from IMPORT_QUEUE by delegating to the import service.
// ---------------------------------------------------------------------------

import type { Database } from "../db/index.js";
import { createImportJobId } from "@dough/shared";
import { createLogger } from "../lib/logger.js";
import {
  createImportService,
  createDefaultFetcher,
  createDefaultWordPressClient,
  type RecipeExtractor,
  type AgentExtractor,
  type ImportQueue,
} from "./import.js";

export interface QueueHandlerDeps {
  readonly db: Database;
  readonly queue: ImportQueue;
  readonly extractor: RecipeExtractor;
  readonly agentExtractor?: AgentExtractor;
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
export async function handleImportQueue(batch: QueueBatch, deps: QueueHandlerDeps): Promise<void> {
  const logger = createLogger("queue-handler");
  const fetcher = createDefaultFetcher();
  const wordpress = createDefaultWordPressClient(fetcher);

  const importService = createImportService({
    db: deps.db,
    queue: deps.queue,
    extractor: deps.extractor,
    agentExtractor: deps.agentExtractor,
    fetcher,
    wordpress,
    logger,
  });

  for (const message of batch.messages) {
    const messageStartTime = Date.now();
    try {
      const body = message.body;
      if (body === null || typeof body !== "object" || !("importJobId" in body)) {
        // Invalid message format — ack to avoid infinite retries
        logger.warn("queue_invalid_message_format", {
          bodySummary: JSON.stringify(body).slice(0, 200),
        });
        message.ack();
        continue;
      }

      const bodyObj = body as Record<string, unknown>;
      const jobIdStr = bodyObj["importJobId"];
      if (typeof jobIdStr !== "string") {
        logger.warn("queue_invalid_job_id", { body: bodyObj });
        message.ack();
        continue;
      }

      const jobId = createImportJobId(jobIdStr);
      logger.info("queue_message_processing_start", { jobId });

      const result = await importService.processImportJob(jobId);
      const durationMs = Date.now() - messageStartTime;

      if (result.ok) {
        logger.info("queue_message_ack", { jobId, durationMs });
        message.ack();
      } else {
        const error = result.error;
        if (error.type === "NotFound") {
          // Job doesn't exist — ack to avoid retries
          logger.warn("queue_message_ack_not_found", { jobId, durationMs });
          message.ack();
        } else if (error.type === "InvalidTransition") {
          // Job is in wrong state (e.g. already processed) — ack
          logger.warn("queue_message_ack_invalid_transition", {
            jobId,
            errorMessage: error.message,
            durationMs,
          });
          message.ack();
        } else {
          // Transient error — retry
          logger.error("queue_message_retry", {
            jobId,
            errorType: error.type,
            durationMs,
          });
          message.retry();
        }
      }
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : "Unknown error";
      logger.error("queue_message_unexpected_error", {
        error: errorMsg,
        durationMs: Date.now() - messageStartTime,
      });
      // Unexpected error — retry the message
      message.retry();
    }
  }
}
