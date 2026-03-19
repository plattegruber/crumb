/**
 * SvelteKit client-side error hook.
 *
 * Catches all unhandled client errors (uncaught exceptions in load
 * functions, rendering errors, etc.) and logs them with full context
 * via the structured logger. Without this file, these errors vanish
 * silently in the browser.
 */

import type { HandleClientError } from "@sveltejs/kit";
import { createLogger } from "$lib/logger.js";

const logger = createLogger("hooks");

export const handleError: HandleClientError = ({ error, event, status, message }) => {
  const errorId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const errorData: Record<string, unknown> = {
    errorId,
    status,
    message,
    routeId: event.route.id ?? "unknown",
    url: event.url.pathname,
  };

  if (error instanceof Error) {
    errorData.errorName = error.name;
    errorData.errorMessage = error.message;
    errorData.stack = error.stack ?? null;
  } else {
    errorData.rawError = String(error);
  }

  logger.error("Unhandled client error", errorData);

  return {
    message,
    code: errorId,
  };
};
