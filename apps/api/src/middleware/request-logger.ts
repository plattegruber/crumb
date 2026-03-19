/**
 * Request logging middleware for Hono.
 *
 * Generates a unique requestId, reads X-Correlation-Id and X-Session-Id
 * from the incoming request, logs request start/end, sets response
 * headers, and attaches a logger and requestId to the Hono context
 * for downstream use.
 *
 * When AXIOM_TOKEN is configured, logs are also buffered and flushed
 * to Axiom via ctx.waitUntil() at the end of each request.
 */

import { createMiddleware } from "hono/factory";
import type { AppEnv } from "./auth.js";
import { createLogger, type Logger, truncate, redactSensitive } from "../lib/logger.js";
import { createMetrics, METRIC, type MetricsCollector } from "../lib/metrics.js";
import { createAxiomSink, type AxiomSink } from "../lib/axiom.js";

// ---------------------------------------------------------------------------
// Extended AppEnv with logger and request context
// ---------------------------------------------------------------------------

/**
 * Variables added to the Hono context by the request logger middleware.
 */
export interface RequestLoggerVariables {
  readonly requestId: string;
  readonly correlationId: string | null;
  readonly sessionId: string | null;
  readonly logger: Logger;
  readonly metrics: MetricsCollector;
}

/**
 * Extended AppEnv that includes the request logger variables.
 * Routes can use this type to access logger and requestId from context.
 */
export type AppEnvWithLogger = {
  Bindings: AppEnv["Bindings"];
  Variables: AppEnv["Variables"] & RequestLoggerVariables;
};

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Request logging middleware.
 *
 * - Generates a unique requestId (crypto.randomUUID())
 * - Reads X-Correlation-Id and X-Session-Id from request headers
 * - Logs request start: method, path, user agent
 * - Logs request end: status code, duration (ms)
 * - Sets X-Request-Id response header
 * - Attaches logger, metrics, requestId, correlationId, sessionId to Hono context
 * - Flushes Axiom sink via waitUntil when AXIOM_TOKEN is configured
 */
export function requestLogger() {
  return createMiddleware<AppEnvWithLogger>(async (c, next) => {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    // Read correlation headers from the frontend
    const correlationId = c.req.header("X-Correlation-Id") ?? null;
    const sessionId = c.req.header("X-Session-Id") ?? null;

    // Determine log level from env var
    const logLevelStr: string | undefined = c.env.LOG_LEVEL ?? undefined;

    // Create Axiom sink if token is configured (deployed environment only)
    let axiomSink: AxiomSink | null = null;
    const axiomToken: string | undefined = (c.env as unknown as Record<string, string | undefined>)[
      "AXIOM_TOKEN"
    ];
    const axiomDataset: string | undefined = (
      c.env as unknown as Record<string, string | undefined>
    )["AXIOM_DATASET"];

    if (axiomToken && axiomDataset) {
      axiomSink = createAxiomSink(axiomToken, axiomDataset);
    }

    // Create logger scoped to this request with correlation context
    const logger = createLogger(
      "api",
      requestId,
      logLevelStr,
      axiomSink,
      correlationId ?? undefined,
      sessionId ?? undefined,
    );
    const metrics = createMetrics(logger);

    // Store in context for downstream use
    c.set("requestId", requestId);
    c.set("correlationId", correlationId);
    c.set("sessionId", sessionId);
    c.set("logger", logger);
    c.set("metrics", metrics);

    // Gather query params
    const queryParams = c.req.query();
    const hasQuery = Object.keys(queryParams).length > 0;

    // Summarise request body for mutating methods (POST/PUT/PATCH)
    let bodySummary: string | null = null;
    const method = c.req.method;
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      try {
        const cloned = c.req.raw.clone();
        const rawText = await cloned.text();
        if (rawText.length > 0) {
          // Try to parse as JSON so we can redact sensitive fields
          try {
            const parsed = JSON.parse(rawText) as Record<string, unknown>;
            const redacted = redactSensitive(parsed);
            bodySummary = truncate(JSON.stringify(redacted), 200);
          } catch {
            bodySummary = truncate(rawText, 200);
          }
        }
      } catch {
        // Body not readable — skip
      }
    }

    // Log request start
    const startData: Record<string, unknown> = {
      method: c.req.method,
      path: c.req.path,
      userAgent: c.req.header("User-Agent") ?? null,
    };
    if (hasQuery) {
      startData["query"] = queryParams;
    }
    if (bodySummary !== null) {
      startData["bodySummary"] = bodySummary;
    }
    logger.info("request_start", startData);

    // Execute downstream handlers
    await next();

    // Calculate duration
    const durationMs = Date.now() - startTime;

    // Set response headers
    c.header("X-Request-Id", requestId);

    // Retrieve creator ID if set by auth middleware
    const creatorId: string | undefined = c.get("creatorId" as never) as string | undefined;

    // Log request end
    const endData: Record<string, unknown> = {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs,
    };
    if (creatorId !== undefined) {
      endData["creatorId"] = creatorId;
    }
    logger.info("request_end", endData);

    // Record metrics
    metrics.increment(METRIC.HttpRequestsTotal, {
      method: c.req.method,
      path: c.req.path,
      status: String(c.res.status),
    });
    metrics.observe(
      METRIC.HttpRequestDurationMs,
      {
        path: c.req.path,
      },
      durationMs,
    );

    // Flush Axiom sink asynchronously — does not block the response
    if (axiomSink !== null) {
      c.executionCtx.waitUntil(axiomSink.flush());
    }
  });
}
