/**
 * Lightweight Axiom log sink for Cloudflare Workers.
 *
 * Buffers structured log entries during a request and flushes them
 * in a single POST to the Axiom ingest API. No SDK dependency —
 * just a fetch call.
 *
 * Usage:
 *   const sink = createAxiomSink(token, dataset);
 *   sink.push({ level: "info", message: "hello", ... });
 *   ctx.waitUntil(sink.flush());
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AxiomSink {
  /** Buffer a log entry for later ingest. */
  push(entry: Record<string, unknown>): void;
  /** Flush all buffered entries to Axiom. Resolves when done. */
  flush(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const AXIOM_INGEST_URL = "https://api.axiom.co/v1/datasets";

/**
 * Create a sink that batches log entries and flushes to Axiom.
 *
 * @param token  - Axiom API token (Bearer auth).
 * @param dataset - Target Axiom dataset name.
 */
export function createAxiomSink(token: string, dataset: string): AxiomSink {
  const buffer: Record<string, unknown>[] = [];

  return {
    push(entry: Record<string, unknown>): void {
      buffer.push(entry);
    },

    async flush(): Promise<void> {
      if (buffer.length === 0) return;

      const batch = buffer.splice(0);

      try {
        const res = await fetch(`${AXIOM_INGEST_URL}/${dataset}/ingest`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(batch),
        });

        if (!res.ok) {
          // Log to console as fallback — do not throw, this is best-effort
          console.error(`[axiom] ingest failed: ${res.status} ${res.statusText}`);
        }
      } catch (err) {
        // Network failure — swallow so we never break request handling
        console.error("[axiom] ingest error:", err);
      }
    },
  };
}
