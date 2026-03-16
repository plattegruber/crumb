// ---------------------------------------------------------------------------
// Tests for Kit rate limiter
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  InMemoryRateLimiter,
  withRateLimitRetry,
} from "../../../src/lib/kit/rate-limiter.js";
import { ok, err } from "@crumb/shared";

// ---------------------------------------------------------------------------
// InMemoryRateLimiter
// ---------------------------------------------------------------------------

describe("InMemoryRateLimiter", () => {
  let limiter: InMemoryRateLimiter;

  beforeEach(() => {
    limiter = new InMemoryRateLimiter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit", () => {
    const accountId = "acct-1";

    // Record 119 requests (under 120 limit)
    const now = Date.now();
    for (let i = 0; i < 119; i++) {
      limiter.recordRequest(accountId, now);
    }

    const result = limiter.tryAcquire(accountId);
    expect(result.ok).toBe(true);
  });

  it("blocks requests at the limit", () => {
    const accountId = "acct-1";

    // Record exactly 120 requests within the window
    const now = Date.now();
    for (let i = 0; i < 120; i++) {
      limiter.recordRequest(accountId, now);
    }

    const result = limiter.tryAcquire(accountId);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("rate_limited");
      expect(result.error.retryAfterMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("allows requests after old ones expire from the window", () => {
    const accountId = "acct-1";

    // Record 120 requests at time 0
    const startTime = Date.now();
    for (let i = 0; i < 120; i++) {
      limiter.recordRequest(accountId, startTime);
    }

    // Should be blocked
    let result = limiter.tryAcquire(accountId);
    expect(result.ok).toBe(false);

    // Advance time past the 60-second window
    vi.advanceTimersByTime(61_000);

    // Should now be allowed
    result = limiter.tryAcquire(accountId);
    expect(result.ok).toBe(true);
  });

  it("tracks different accounts independently", () => {
    const now = Date.now();

    // Fill up account 1
    for (let i = 0; i < 120; i++) {
      limiter.recordRequest("acct-1", now);
    }

    // Account 1 should be blocked
    const result1 = limiter.tryAcquire("acct-1");
    expect(result1.ok).toBe(false);

    // Account 2 should still be allowed
    const result2 = limiter.tryAcquire("acct-2");
    expect(result2.ok).toBe(true);
  });

  it("reset clears state for an account", () => {
    const accountId = "acct-1";
    const now = Date.now();

    for (let i = 0; i < 120; i++) {
      limiter.recordRequest(accountId, now);
    }

    // Should be blocked
    let result = limiter.tryAcquire(accountId);
    expect(result.ok).toBe(false);

    // Reset
    limiter.reset(accountId);

    // Should now be allowed
    result = limiter.tryAcquire(accountId);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// withRateLimitRetry
// ---------------------------------------------------------------------------

describe("withRateLimitRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("executes function when under limit", async () => {
    const limiter = new InMemoryRateLimiter();
    let called = false;

    const promise = withRateLimitRetry(limiter, "acct-1", async () => {
      called = true;
      return ok("success");
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(called).toBe(true);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("success");
    }
  });

  it("passes through function errors", async () => {
    const limiter = new InMemoryRateLimiter();

    const promise = withRateLimitRetry(limiter, "acct-1", async () => {
      return err("something went wrong");
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("something went wrong");
    }
  });

  it("retries with backoff when rate limited", async () => {
    const limiter = new InMemoryRateLimiter();
    const now = Date.now();

    // Fill the rate limit
    for (let i = 0; i < 120; i++) {
      limiter.recordRequest("acct-1", now);
    }

    let callCount = 0;
    const promise = withRateLimitRetry(limiter, "acct-1", async () => {
      callCount++;
      return ok("done");
    });

    // Advance time enough for the window to expire and retries to happen
    // First retry: 500ms backoff, second: 1000ms, etc.
    // After 61 seconds the rate limit window resets
    await vi.advanceTimersByTimeAsync(500); // first backoff
    await vi.advanceTimersByTimeAsync(1000); // second backoff
    await vi.advanceTimersByTimeAsync(60_000); // window expires

    await vi.runAllTimersAsync();
    const result = await promise;

    // Should eventually succeed
    expect(result.ok).toBe(true);
    expect(callCount).toBeGreaterThanOrEqual(1);
  });

  it("fails after max retries", async () => {
    const limiter = new InMemoryRateLimiter();

    // Override tryAcquire to always return rate_limited
    const originalTryAcquire = limiter.tryAcquire.bind(limiter);
    let attempts = 0;
    limiter.tryAcquire = (_accountId: string) => {
      attempts++;
      // Always block by pretending the window is full
      const now = Date.now();
      limiter.reset("acct-1");
      for (let i = 0; i < 120; i++) {
        limiter.recordRequest("acct-1", now);
      }
      return originalTryAcquire("acct-1");
    };

    const promise = withRateLimitRetry(limiter, "acct-1", async () => {
      return ok("should not reach here");
    });

    // Run all timers to exhaust retries
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const error = result.error as { type: string };
      expect(error.type).toBe("rate_limited");
    }
    // Should have attempted 11 times (initial + 10 retries)
    expect(attempts).toBe(11);
  });
});
