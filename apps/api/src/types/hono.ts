/**
 * Hono environment type definitions.
 *
 * Shared by auth and request-logger middleware to avoid circular imports.
 */
import type { Env } from "../env.js";
import type { AuthContext } from "./auth.js";
import type { Logger } from "../lib/logger.js";
import type { MetricsCollector } from "../lib/metrics.js";

/**
 * Variables added to the Hono context by the request logger middleware.
 */
export interface RequestLoggerVariables {
  readonly requestId: string;
  readonly logger: Logger;
  readonly metrics: MetricsCollector;
}

/**
 * Base Hono env with Worker bindings and auth context variables.
 */
export type AppEnv = {
  Bindings: Env;
  Variables: AuthContext;
};

/**
 * Extended AppEnv that includes the request logger variables.
 * Routes can use this type to access logger and requestId from context.
 */
export type AppEnvWithLogger = {
  Bindings: Env;
  Variables: AuthContext & RequestLoggerVariables;
};
