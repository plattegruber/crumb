/**
 * Structured logger for the SvelteKit frontend.
 *
 * Mirrors the backend Logger interface (apps/api/src/lib/logger.ts)
 * but outputs via native console methods so browser DevTools
 * level-filtering works. Each call emits a human-scannable prefix
 * followed by a structured payload object:
 *
 *   [dough:error][api] API request failed  { timestamp, route, ... }
 *
 * Log level is controlled by localStorage key "dough:logLevel"
 * (changeable at runtime in DevTools). Defaults to "debug" in dev,
 * "info" in production.
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
// Sensitive-key redaction (mirrors backend SENSITIVE_KEYS)
// ---------------------------------------------------------------------------

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

export function truncate(value: unknown, maxLen: number = 200): string {
  if (value === null) return "[null]";
  if (value === undefined) return "[undefined]";
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "...";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseLogLevel(level: string | undefined): number {
  if (level === undefined || level === null) return LOG_LEVEL.info;
  const lower = level.toLowerCase();
  if (lower in LOG_LEVEL) {
    return LOG_LEVEL[lower as LogLevelName];
  }
  return LOG_LEVEL.info;
}

function getEffectiveLogLevel(): number {
  try {
    const stored = typeof window !== "undefined" ? localStorage.getItem("dough:logLevel") : null;
    if (stored !== null) return parseLogLevel(stored);
  } catch {
    // localStorage can throw in private browsing / storage-full
  }
  // Default: debug in dev, info in prod
  return import.meta.env.DEV ? LOG_LEVEL.debug : LOG_LEVEL.info;
}

function getRoute(): string {
  return typeof window !== "undefined" ? window.location.pathname : "ssr";
}

// ---------------------------------------------------------------------------
// Console dispatch
// ---------------------------------------------------------------------------

const CONSOLE_FN: Record<LogLevelName, (...args: unknown[]) => void> = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

// ---------------------------------------------------------------------------
// Logger implementation
// ---------------------------------------------------------------------------

interface LoggerOptions {
  readonly service: string;
  readonly requestId: string | null;
}

function writeLog(
  options: LoggerOptions,
  level: LogLevelName,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (LOG_LEVEL[level] < getEffectiveLogLevel()) return;

  const payload: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    service: options.service,
    route: getRoute(),
  };

  if (options.requestId !== null) {
    payload.requestId = options.requestId;
  }

  if (data !== undefined) {
    const safe = redactSensitive(data);
    for (const [key, value] of Object.entries(safe)) {
      payload[key] = value;
    }
  }

  const prefix = `[dough:${level}][${options.service}]`;
  CONSOLE_FN[level](`${prefix} ${message}`, payload);
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
 * @param service - Module name that emits logs (e.g. "api", "layout", "hooks").
 * @param requestId - Optional request ID for correlation.
 */
export function createLogger(service: string, requestId?: string): Logger {
  return createLoggerInternal({
    service,
    requestId: requestId ?? null,
  });
}

/** Default app-level logger for convenience. */
export const log = createLogger("app");
