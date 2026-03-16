/**
 * Request logging middleware for Hono.
 *
 * Generates a unique requestId, logs request start/end,
 * sets X-Request-Id response header, and attaches a logger
 * and requestId to the Hono context for downstream use.
 */

import { createMiddleware } from "hono/factory";
import { createLogger } from "../lib/logger.js";
import { createMetrics, METRIC } from "../lib/metrics.js";
import type { AppEnvWithLogger } from "../types/hono.js";

export type { RequestLoggerVariables, AppEnvWithLogger } from "../types/hono.js";

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Request logging middleware.
 *
 * - Generates a unique requestId (crypto.randomUUID())
 * - Logs request start: method, path, user agent
 * - Logs request end: status code, duration (ms)
 * - Sets X-Request-Id response header
 * - Attaches logger, metrics, and requestId to Hono context
 */
export function requestLogger() {
  return createMiddleware<AppEnvWithLogger>(async (c, next) => {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    // Determine log level from env var
    const logLevelStr = c.env.LOG_LEVEL;

    // Create logger scoped to this request
    const logger = createLogger("api", requestId, logLevelStr);
    const metrics = createMetrics(logger);

    // Store in context for downstream use
    c.set("requestId", requestId);
    c.set("logger", logger);
    c.set("metrics", metrics);

    // Log request start
    logger.info("request_start", {
      method: c.req.method,
      path: c.req.path,
      userAgent: c.req.header("User-Agent") ?? null,
    });

    // Execute downstream handlers
    await next();

    // Calculate duration
    const durationMs = Date.now() - startTime;

    // Set response header
    c.header("X-Request-Id", requestId);

    // Log request end
    logger.info("request_end", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs,
    });

    // Record metrics
    metrics.increment(METRIC.HttpRequestsTotal, {
      method: c.req.method,
      path: c.req.path,
      status: String(c.res.status),
    });
    metrics.observe(METRIC.HttpRequestDurationMs, {
      path: c.req.path,
    }, durationMs);
  });
}
