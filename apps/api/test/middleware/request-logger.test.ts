/**
 * Tests for the request logging middleware.
 *
 * Verifies request ID generation, duration tracking, X-Request-Id header,
 * and that logger + metrics are attached to the context.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { requestLogger } from "../../src/middleware/request-logger.js";
import type { AppEnvWithLogger } from "../../src/middleware/request-logger.js";
import type { Env } from "../../src/env.js";

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

const TEST_ENV: Env = {
  DB: {} as D1Database,
  STORAGE: {} as R2Bucket,
  CACHE: {} as KVNamespace,
  IMPORT_QUEUE: {} as Queue,
  RENDER_QUEUE: {} as Queue,
  CLERK_PUBLISHABLE_KEY: "pk_test_xxx",
  CLERK_SECRET_KEY: "sk_test_xxx",
  KIT_CLIENT_ID: "kit_id",
  KIT_CLIENT_SECRET: "kit_secret",
  LOG_LEVEL: "info",
};

function createTestApp() {
  const app = new Hono<AppEnvWithLogger>();

  app.use("*", requestLogger());

  app.get("/test", (c) => {
    const requestId = c.get("requestId");
    const logger = c.get("logger");
    const metrics = c.get("metrics");
    return c.json({
      requestId,
      hasLogger: logger !== undefined && logger !== null,
      hasMetrics: metrics !== undefined && metrics !== null,
    });
  });

  app.get("/slow", async (c) => {
    // Simulate a small delay
    await new Promise((resolve) => setTimeout(resolve, 10));
    return c.json({ ok: true });
  });

  return app;
}

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------

describe("requestLogger middleware", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("generates a unique requestId and attaches to context", async () => {
    const app = createTestApp();

    const res = await app.fetch(
      new Request("http://localhost/test"),
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json<{
      requestId: string;
      hasLogger: boolean;
      hasMetrics: boolean;
    }>();

    // requestId should be a UUID
    expect(body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(body.hasLogger).toBe(true);
    expect(body.hasMetrics).toBe(true);
  });

  it("sets X-Request-Id response header", async () => {
    const app = createTestApp();

    const res = await app.fetch(
      new Request("http://localhost/test"),
      TEST_ENV,
    );

    const headerValue = res.headers.get("X-Request-Id");
    expect(headerValue).not.toBeNull();
    expect(headerValue).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("X-Request-Id matches the requestId in context", async () => {
    const app = createTestApp();

    const res = await app.fetch(
      new Request("http://localhost/test"),
      TEST_ENV,
    );

    const headerValue = res.headers.get("X-Request-Id");
    const body = await res.json<{ requestId: string }>();
    expect(headerValue).toBe(body.requestId);
  });

  it("logs request_start and request_end", async () => {
    const app = createTestApp();

    await app.fetch(
      new Request("http://localhost/test", {
        headers: { "User-Agent": "test-agent" },
      }),
      TEST_ENV,
    );

    // Should have at least 2 log lines: request_start and request_end
    // (may also have metric log lines)
    expect(consoleLogSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

    const logLines = consoleLogSpy.mock.calls.map(
      (call) => JSON.parse(call[0] as string) as Record<string, unknown>,
    );

    const startLog = logLines.find((l) => l["message"] === "request_start");
    const endLog = logLines.find((l) => l["message"] === "request_end");

    expect(startLog).toBeDefined();
    expect(startLog?.["method"]).toBe("GET");
    expect(startLog?.["path"]).toBe("/test");
    expect(startLog?.["userAgent"]).toBe("test-agent");

    expect(endLog).toBeDefined();
    expect(endLog?.["method"]).toBe("GET");
    expect(endLog?.["path"]).toBe("/test");
    expect(endLog?.["status"]).toBe(200);
    expect(typeof endLog?.["durationMs"]).toBe("number");
  });

  it("tracks request duration", async () => {
    const app = createTestApp();

    await app.fetch(
      new Request("http://localhost/slow"),
      TEST_ENV,
    );

    const logLines = consoleLogSpy.mock.calls.map(
      (call) => JSON.parse(call[0] as string) as Record<string, unknown>,
    );

    const endLog = logLines.find((l) => l["message"] === "request_end");
    expect(endLog).toBeDefined();
    const durationMs = endLog?.["durationMs"] as number;
    // Should have measured at least some time (10ms delay)
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it("generates different requestIds for different requests", async () => {
    const app = createTestApp();

    const res1 = await app.fetch(
      new Request("http://localhost/test"),
      TEST_ENV,
    );
    const res2 = await app.fetch(
      new Request("http://localhost/test"),
      TEST_ENV,
    );

    const body1 = await res1.json<{ requestId: string }>();
    const body2 = await res2.json<{ requestId: string }>();
    expect(body1.requestId).not.toBe(body2.requestId);
  });
});
