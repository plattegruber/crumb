/**
 * SvelteKit client-side error hook.
 *
 * Catches unhandled client errors (uncaught exceptions in load
 * functions, rendering errors, etc.) and reports them via the
 * error reporter (→ Axiom). Also installs global window.onerror
 * and unhandledrejection handlers to catch everything else.
 */

import type { HandleClientError } from "@sveltejs/kit";
import { reportError, installGlobalErrorHandlers } from "$lib/error-reporter.js";

// Install global handlers on module load — catches errors from
// onMount callbacks, setTimeout, async event handlers, etc.
installGlobalErrorHandlers();

export const handleError: HandleClientError = ({ error, event, status, message }) => {
  const errorId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  reportError("hooks-client", error, {
    errorId,
    status,
    message,
    routeId: event.route.id ?? "unknown",
    url: event.url.pathname,
  });

  return {
    message,
    code: errorId,
  };
};
