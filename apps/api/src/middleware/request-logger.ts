/**
 * Request logging middleware for Hono.
 *
 * Generates a unique requestId, logs request start/end,
 * sets X-Request-Id response header, and attaches a logger
 * and requestId to the Hono context for downstream use.
 */

import { createMiddleware } from "hono/factory";
import type { AppEnv } from "./auth.js";
import { createLogger, type Logger } from "../lib/logger.js";
import { createMetrics, METRIC, type MetricsCollector } from "../lib/metrics.js";

// ---------------------------------------------------------------------------
// Extended AppEnv with logger and request context
// ---------------------------------------------------------------------------

/**
 * Variables added to the Hono context by the request logger middleware.
 */
export interface RequestLoggerVariables {
  readonly requestId: string;
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
    const logLevel =
      "LOG_LEVEL" in c.env ? (c.env as Record<string, unknown>)["LOG_LEVEL"] : undefined;
    const logLevelStr = typeof logLevel === "string" ? logLevel : undefined;

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
    metrics.observe(
      METRIC.HttpRequestDurationMs,
      {
        path: c.req.path,
      },
      durationMs,
    );
  });
}
