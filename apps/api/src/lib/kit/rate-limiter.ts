// ---------------------------------------------------------------------------
// Kit API Rate Limiter
// ---------------------------------------------------------------------------
// SPEC 4.2: 120 requests per 60-second rolling window per Kit account.
//
// This module implements an in-memory rate limiter with the same interface
// that a Durable Objects-backed implementation will use later.
// ---------------------------------------------------------------------------

import type { Result } from "@crumb/shared";
import { ok, err } from "@crumb/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitError {
  readonly type: "rate_limited";
  readonly retryAfterMs: number;
}

/**
 * Abstract rate limiter interface. The in-memory implementation below
 * can be swapped for a Durable Objects implementation later without
 * changing calling code.
 */
export interface RateLimiter {
  /**
   * Attempt to acquire a request slot. Returns `ok(undefined)` if the
   * request is allowed, or `err(RateLimitError)` if the caller must wait.
   *
   * @param accountId - The Kit account ID to rate-limit against.
   */
  tryAcquire(accountId: string): Result<void, RateLimitError>;

  /**
   * Record a completed request timestamp for the given account.
   *
   * @param accountId - The Kit account ID.
   * @param timestampMs - The time the request was made (ms since epoch).
   */
  recordRequest(accountId: string, timestampMs: number): void;

  /**
   * Reset rate limit state for a given account (for testing).
   */
  reset(accountId: string): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum requests per rolling window. */
const MAX_REQUESTS = 120;

/** Rolling window size in milliseconds (60 seconds). */
const WINDOW_MS = 60_000;

/** Initial backoff delay in milliseconds. */
const INITIAL_BACKOFF_MS = 500;

/** Maximum number of retries before failing. */
const MAX_RETRIES = 10;

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------

export class InMemoryRateLimiter implements RateLimiter {
  private readonly windows: Map<string, number[]> = new Map();

  tryAcquire(accountId: string): Result<void, RateLimitError> {
    const now = Date.now();
    const timestamps = this.getTimestamps(accountId);
    const windowStart = now - WINDOW_MS;

    // Remove timestamps outside the rolling window
    const activeTimestamps = timestamps.filter((t) => t > windowStart);
    this.windows.set(accountId, activeTimestamps);

    if (activeTimestamps.length >= MAX_REQUESTS) {
      // Calculate how long until the oldest request falls out of the window
      const oldestInWindow = activeTimestamps[0];
      const retryAfterMs =
        oldestInWindow !== undefined ? oldestInWindow + WINDOW_MS - now : WINDOW_MS;

      return err({
        type: "rate_limited" as const,
        retryAfterMs: Math.max(retryAfterMs, 0),
      });
    }

    return ok(undefined);
  }

  recordRequest(accountId: string, timestampMs: number): void {
    const timestamps = this.getTimestamps(accountId);
    timestamps.push(timestampMs);
    this.windows.set(accountId, timestamps);
  }

  reset(accountId: string): void {
    this.windows.delete(accountId);
  }

  private getTimestamps(accountId: string): number[] {
    const existing = this.windows.get(accountId);
    if (existing) {
      return existing;
    }
    const fresh: number[] = [];
    this.windows.set(accountId, fresh);
    return fresh;
  }
}

// ---------------------------------------------------------------------------
// Retry with backoff
// ---------------------------------------------------------------------------

/**
 * Execute a function with rate-limit-aware retry and exponential backoff.
 *
 * @param rateLimiter - The rate limiter to check before each attempt.
 * @param accountId - The Kit account ID.
 * @param fn - The async function to execute.
 * @returns The result of the function, or a rate limit error after max retries.
 */
export async function withRateLimitRetry<T, E>(
  rateLimiter: RateLimiter,
  accountId: string,
  fn: () => Promise<Result<T, E>>,
): Promise<Result<T, E | RateLimitError>> {
  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    const acquireResult = rateLimiter.tryAcquire(accountId);

    if (!acquireResult.ok) {
      if (attempt >= MAX_RETRIES) {
        return err(acquireResult.error);
      }

      // Exponential backoff: 500ms, 1000ms, 2000ms, ...
      const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      await sleep(backoffMs);
      attempt++;
      continue;
    }

    // Record the request before executing
    rateLimiter.recordRequest(accountId, Date.now());

    const result = await fn();
    return result;
  }

  // This should not be reached, but TypeScript needs it
  return err({
    type: "rate_limited" as const,
    retryAfterMs: 0,
  });
}

// ---------------------------------------------------------------------------
// Sleep helper
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
