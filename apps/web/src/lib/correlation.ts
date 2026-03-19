/**
 * Correlation ID utilities for the frontend.
 *
 * Provides a stable session ID (persisted to sessionStorage for the
 * browser tab lifetime) and a per-call correlation ID.
 *
 * These IDs are sent as X-Session-Id and X-Correlation-Id headers
 * on every API request so backend logs can be correlated to
 * frontend user sessions and actions.
 */

// ---------------------------------------------------------------------------
// Session ID — one per browser tab/session
// ---------------------------------------------------------------------------

const SESSION_STORAGE_KEY = "dough:sessionId";

let cachedSessionId: string | null = null;

/**
 * Return a stable session ID for the current browser tab.
 *
 * Generated once and stored in sessionStorage so it survives
 * soft-navigations but resets when the tab is closed.
 * Falls back to a cached in-memory value when sessionStorage
 * is unavailable (SSR, private browsing).
 */
export function getSessionId(): string {
  if (cachedSessionId !== null) return cachedSessionId;

  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (stored !== null) {
        cachedSessionId = stored;
        return stored;
      }
      const id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_STORAGE_KEY, id);
      cachedSessionId = id;
      return id;
    }
  } catch {
    // sessionStorage can throw in private browsing / storage-full
  }

  // Fallback for SSR or storage failure — generate once per module load
  cachedSessionId = crypto.randomUUID();
  return cachedSessionId;
}

// ---------------------------------------------------------------------------
// Correlation ID — one per API call
// ---------------------------------------------------------------------------

/**
 * Generate a unique correlation ID for a single API call or user action.
 *
 * Each call returns a new UUID so individual requests can be traced.
 * For multi-request user actions (e.g. "save recipe" that hits 2 endpoints),
 * callers can generate one ID and pass it to multiple calls.
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}
