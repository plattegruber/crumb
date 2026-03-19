/**
 * Frontend error reporter.
 *
 * Captures errors from any source (svelte:boundary, window.onerror,
 * unhandledrejection, hooks.client.ts) and POSTs them to the backend
 * `/client-errors` endpoint so they appear in Axiom alongside backend
 * logs with full correlation context.
 *
 * Falls back to structured console logging if the POST fails.
 */

import { getSessionId } from "$lib/correlation.js";
import { createLogger } from "$lib/logger.js";

const logger = createLogger("error-reporter");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClientErrorReport {
  /** Where the error was caught. */
  readonly source: "svelte-boundary" | "window-onerror" | "unhandled-rejection" | "hooks-client";
  /** Error class name (e.g. "TypeError"). */
  readonly errorName: string;
  /** Human-readable error message. */
  readonly message: string;
  /** Stack trace, if available. */
  readonly stack: string | null;
  /** Frontend route where the error occurred. */
  readonly route: string;
  /** Browser session ID (from sessionStorage). */
  readonly sessionId: string;
  /** ISO 8601 timestamp. */
  readonly timestamp: string;
  /** Additional context from the error source. */
  readonly context?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Error serialisation
// ---------------------------------------------------------------------------

function serialiseError(
  error: unknown,
): Pick<ClientErrorReport, "errorName" | "message" | "stack"> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }
  return {
    errorName: "Unknown",
    message: String(error),
    stack: null,
  };
}

// ---------------------------------------------------------------------------
// Deduplication — avoid flooding with repeated errors
// ---------------------------------------------------------------------------

const recentErrors = new Map<string, number>();
const DEDUP_WINDOW_MS = 5_000;
const MAX_RECENT = 50;

function isDuplicate(key: string): boolean {
  const now = Date.now();

  // Prune stale entries
  if (recentErrors.size > MAX_RECENT) {
    for (const [k, ts] of recentErrors) {
      if (now - ts > DEDUP_WINDOW_MS) recentErrors.delete(k);
    }
  }

  const lastSeen = recentErrors.get(key);
  if (lastSeen !== undefined && now - lastSeen < DEDUP_WINDOW_MS) {
    return true;
  }
  recentErrors.set(key, now);
  return false;
}

// ---------------------------------------------------------------------------
// Reporter
// ---------------------------------------------------------------------------

let apiBaseUrl: string | null = null;

/**
 * Set the API base URL for error reporting.
 * Called once from +layout.svelte after setApiBaseUrl.
 */
export function setErrorReporterBaseUrl(url: string): void {
  apiBaseUrl = url;
}

/**
 * Report a frontend error. Sends it to the backend for Axiom ingest
 * and logs it locally via the structured logger.
 */
export function reportError(
  source: ClientErrorReport["source"],
  error: unknown,
  context?: Record<string, unknown>,
): void {
  const { errorName, message, stack } = serialiseError(error);

  // Deduplicate by source + message
  const dedupKey = `${source}:${errorName}:${message}`;
  if (isDuplicate(dedupKey)) return;

  const report: ClientErrorReport = {
    source,
    errorName,
    message,
    stack,
    route: typeof window !== "undefined" ? window.location.pathname : "unknown",
    sessionId: getSessionId(),
    timestamp: new Date().toISOString(),
    context,
  };

  // Always log locally
  logger.error(`[${source}] ${errorName}: ${message}`, {
    ...report,
    // Truncate stack for console readability
    stack: stack !== null ? stack.slice(0, 500) : null,
  });

  // Best-effort POST to backend — fire and forget
  if (apiBaseUrl !== null) {
    sendToBackend(report).catch(() => {
      // Swallow — the console log above is our fallback
    });
  }
}

async function sendToBackend(report: ClientErrorReport): Promise<void> {
  try {
    await fetch(`${apiBaseUrl}/client-errors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": report.sessionId,
      },
      body: JSON.stringify(report),
      // Use keepalive so the request survives page unload
      keepalive: true,
    });
  } catch {
    // Network failure — already logged to console, nothing more to do
  }
}

// ---------------------------------------------------------------------------
// Global handler installers
// ---------------------------------------------------------------------------

let globalHandlersInstalled = false;

/**
 * Install window.onerror and onunhandledrejection handlers.
 * Safe to call multiple times — only installs once.
 */
export function installGlobalErrorHandlers(): void {
  if (globalHandlersInstalled) return;
  if (typeof window === "undefined") return;

  globalHandlersInstalled = true;

  window.addEventListener("error", (event: ErrorEvent) => {
    reportError("window-onerror", event.error ?? event.message, {
      filename: event.filename ?? null,
      lineno: event.lineno ?? null,
      colno: event.colno ?? null,
    });
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    reportError("unhandled-rejection", event.reason);
  });
}
