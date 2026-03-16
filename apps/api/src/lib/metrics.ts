/**
 * Telemetry / metrics collector for Cloudflare Workers.
 *
 * Tracks counters and histograms via structured log lines with a
 * `metric` field. This approach allows log-based metric extraction
 * in any observability tool. The interface is designed so a real
 * metrics backend (e.g. Cloudflare Analytics Engine) can be swapped
 * in later.
 *
 * No external dependencies -- lightweight for Workers runtime.
 */

import type { Logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetricsCollector {
  /** Increment a counter metric. */
  increment(
    name: string,
    labels: Record<string, string>,
    value?: number,
  ): void;

  /** Record a histogram observation (e.g. latency in ms). */
  observe(
    name: string,
    labels: Record<string, string>,
    value: number,
  ): void;

  /** Record a gauge value (point-in-time measurement). */
  gauge(
    name: string,
    labels: Record<string, string>,
    value: number,
  ): void;
}

// ---------------------------------------------------------------------------
// Metric names — centralized so callers use consistent names
// ---------------------------------------------------------------------------

export const METRIC = {
  /** HTTP request counter — labels: method, path, status */
  HttpRequestsTotal: "http_requests_total",
  /** HTTP request duration — labels: path */
  HttpRequestDurationMs: "http_request_duration_ms",
  /** Kit API call counter — labels: method, status */
  KitApiCallsTotal: "kit_api_calls_total",
  /** Kit API call latency — labels: method */
  KitApiLatencyMs: "kit_api_latency_ms",
  /** Import job counter — labels: source, status */
  ImportJobsTotal: "import_jobs_total",
  /** Import job duration — labels: source */
  ImportJobDurationMs: "import_job_duration_ms",
  /** Recipe count gauge — labels: creator */
  RecipeCount: "recipe_count",
  /** Product render counter — labels: type, status */
  ProductRendersTotal: "product_renders_total",
  /** Webhook event counter — labels: event_type */
  WebhookEventsTotal: "webhook_events_total",
  /** Engagement event counter — labels: type */
  EngagementEventsTotal: "engagement_events_total",
} as const;

// ---------------------------------------------------------------------------
// Log-based metrics implementation
// ---------------------------------------------------------------------------

/**
 * Create a metrics collector that outputs metrics as structured log lines.
 *
 * Each metric is written as a JSON log line with:
 * - `metric`: the metric name
 * - `metricType`: "counter" | "histogram" | "gauge"
 * - `labels`: the label key-value pairs
 * - `value`: the numeric value
 */
export function createMetrics(logger: Logger): MetricsCollector {
  return {
    increment(
      name: string,
      labels: Record<string, string>,
      value?: number,
    ): void {
      logger.info("metric", {
        metric: name,
        metricType: "counter",
        labels,
        value: value ?? 1,
      });
    },

    observe(
      name: string,
      labels: Record<string, string>,
      value: number,
    ): void {
      logger.info("metric", {
        metric: name,
        metricType: "histogram",
        labels,
        value,
      });
    },

    gauge(
      name: string,
      labels: Record<string, string>,
      value: number,
    ): void {
      logger.info("metric", {
        metric: name,
        metricType: "gauge",
        labels,
        value,
      });
    },
  };
}

/**
 * Create a no-op metrics collector that discards all data.
 * Useful in tests.
 */
export function createNoopMetrics(): MetricsCollector {
  const noop = (): void => {};
  return {
    increment: noop,
    observe: noop,
    gauge: noop,
  };
}
