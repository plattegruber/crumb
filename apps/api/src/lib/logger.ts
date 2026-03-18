/**
 * Structured logger for Cloudflare Workers.
 *
 * Outputs JSON lines to console.log (Workers runtime captures these).
 * Each log line includes: timestamp, level, message, service, requestId,
 * plus any extra data.
 *
 * Log levels are controlled by the LOG_LEVEL env var (default: "info").
 * No external dependencies -- lightweight for Workers runtime.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
  child(overrides: { service?: string; requestId?: string }): Logger;
}

export const LOG_LEVEL = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

export type LogLevelName = keyof typeof LOG_LEVEL;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a log level string into a numeric level.
 * Returns the numeric level, defaulting to "info" if the input is invalid.
 */
export function parseLogLevel(level: string | undefined): number {
  if (level === undefined || level === null) return LOG_LEVEL.info;
  const lower = level.toLowerCase();
  if (lower in LOG_LEVEL) {
    return LOG_LEVEL[lower as LogLevelName];
  }
  return LOG_LEVEL.info;
}

/**
 * List of keys that must never appear in log output.
 * Values matching these keys are redacted to "[REDACTED]".
 */
const SENSITIVE_KEYS = new Set([
  "token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "password",
  "secret",
  "secretKey",
  "secret_key",
  "apiKey",
  "api_key",
  "authorization",
  "cookie",
  "CLERK_SECRET_KEY",
  "KIT_CLIENT_SECRET",
  "KIT_API_KEY",
]);

/**
 * Recursively redact sensitive keys from a data object.
 * Returns a new object with sensitive values replaced by "[REDACTED]".
 */
export function redactSensitive(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key)) {
      result[key] = "[REDACTED]";
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = redactSensitive(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Truncation helper
// ---------------------------------------------------------------------------

/**
 * Truncate a string to `maxLen` characters, appending "..." if truncated.
 * Safe to call on null/undefined — returns "[null]" or "[undefined]".
 */
export function truncate(value: unknown, maxLen: number = 200): string {
  if (value === null) return "[null]";
  if (value === undefined) return "[undefined]";
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "...";
}

// ---------------------------------------------------------------------------
// Logger implementation
// ---------------------------------------------------------------------------

interface LoggerOptions {
  readonly service: string;
  readonly requestId: string | null;
  readonly minLevel: number;
}

function writeLog(
  options: LoggerOptions,
  level: LogLevelName,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (LOG_LEVEL[level] < options.minLevel) return;

  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    service: options.service,
    message,
  };

  if (options.requestId !== null) {
    entry["requestId"] = options.requestId;
  }

  if (data !== undefined) {
    const safe = redactSensitive(data);
    for (const [key, value] of Object.entries(safe)) {
      entry[key] = value;
    }
  }

  // Workers runtime captures console.log as structured log output
  console.log(JSON.stringify(entry));
}

function createLoggerInternal(options: LoggerOptions): Logger {
  return {
    info(message: string, data?: Record<string, unknown>): void {
      writeLog(options, "info", message, data);
    },
    warn(message: string, data?: Record<string, unknown>): void {
      writeLog(options, "warn", message, data);
    },
    error(message: string, data?: Record<string, unknown>): void {
      writeLog(options, "error", message, data);
    },
    debug(message: string, data?: Record<string, unknown>): void {
      writeLog(options, "debug", message, data);
    },
    child(overrides: { service?: string; requestId?: string }): Logger {
      return createLoggerInternal({
        service: overrides.service ?? options.service,
        requestId: overrides.requestId ?? options.requestId,
        minLevel: options.minLevel,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Create a structured logger.
 *
 * @param service - The service/module name that emits logs (e.g. "recipe", "kit").
 * @param requestId - Optional request ID for correlation.
 * @param logLevel - The minimum log level to output. Defaults to "info".
 */
export function createLogger(service: string, requestId?: string, logLevel?: string): Logger {
  return createLoggerInternal({
    service,
    requestId: requestId ?? null,
    minLevel: parseLogLevel(logLevel),
  });
}

/**
 * A no-op logger that discards all output.
 * Useful in tests where log output is not desired.
 */
export function createNoopLogger(): Logger {
  const noop = (): void => {};
  const logger: Logger = {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    child: () => logger,
  };
  return logger;
}
