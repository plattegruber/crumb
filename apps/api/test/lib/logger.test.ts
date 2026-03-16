/**
 * Tests for the structured logger module.
 *
 * Verifies output format, log level filtering, request ID inclusion,
 * and sensitive data redaction.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createLogger,
  createNoopLogger,
  parseLogLevel,
  redactSensitive,
  LOG_LEVEL,
} from "../../src/lib/logger.js";

// ---------------------------------------------------------------
// parseLogLevel
// ---------------------------------------------------------------

describe("parseLogLevel", () => {
  it("returns correct numeric level for each valid string", () => {
    expect(parseLogLevel("debug")).toBe(LOG_LEVEL.debug);
    expect(parseLogLevel("info")).toBe(LOG_LEVEL.info);
    expect(parseLogLevel("warn")).toBe(LOG_LEVEL.warn);
    expect(parseLogLevel("error")).toBe(LOG_LEVEL.error);
  });

  it("is case-insensitive", () => {
    expect(parseLogLevel("DEBUG")).toBe(LOG_LEVEL.debug);
    expect(parseLogLevel("INFO")).toBe(LOG_LEVEL.info);
    expect(parseLogLevel("Warn")).toBe(LOG_LEVEL.warn);
  });

  it("returns info level for undefined", () => {
    expect(parseLogLevel(undefined)).toBe(LOG_LEVEL.info);
  });

  it("returns info level for invalid string", () => {
    expect(parseLogLevel("verbose")).toBe(LOG_LEVEL.info);
    expect(parseLogLevel("")).toBe(LOG_LEVEL.info);
  });
});

// ---------------------------------------------------------------
// redactSensitive
// ---------------------------------------------------------------

describe("redactSensitive", () => {
  it("redacts known sensitive keys", () => {
    const input = {
      token: "abc123",
      accessToken: "xyz",
      password: "secret",
      normal: "value",
    };
    const result = redactSensitive(input);
    expect(result["token"]).toBe("[REDACTED]");
    expect(result["accessToken"]).toBe("[REDACTED]");
    expect(result["password"]).toBe("[REDACTED]");
    expect(result["normal"]).toBe("value");
  });

  it("redacts nested sensitive keys", () => {
    const input = {
      config: {
        api_key: "should-be-hidden",
        host: "example.com",
      },
    };
    const result = redactSensitive(input);
    const config = result["config"] as Record<string, unknown>;
    expect(config["api_key"]).toBe("[REDACTED]");
    expect(config["host"]).toBe("example.com");
  });

  it("does not modify arrays", () => {
    const input = { items: [1, 2, 3] };
    const result = redactSensitive(input);
    expect(result["items"]).toEqual([1, 2, 3]);
  });

  it("handles null values", () => {
    const input = { secret: null, other: "yes" };
    // null values with sensitive keys should still be redacted
    const result = redactSensitive(input);
    expect(result["secret"]).toBe("[REDACTED]");
  });
});

// ---------------------------------------------------------------
// createLogger
// ---------------------------------------------------------------

describe("createLogger", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("outputs valid JSON lines", () => {
    const logger = createLogger("test-service", "req-123", "debug");
    logger.info("hello world");

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logLine = consoleLogSpy.mock.calls[0]?.[0];
    expect(typeof logLine).toBe("string");

    const parsed = JSON.parse(logLine as string) as Record<string, unknown>;
    expect(parsed["level"]).toBe("info");
    expect(parsed["message"]).toBe("hello world");
    expect(parsed["service"]).toBe("test-service");
    expect(parsed["requestId"]).toBe("req-123");
    expect(typeof parsed["timestamp"]).toBe("string");
  });

  it("includes extra data in log output", () => {
    const logger = createLogger("svc", "req-1", "debug");
    logger.info("with data", { userId: "u1", count: 5 });

    const logLine = consoleLogSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(logLine) as Record<string, unknown>;
    expect(parsed["userId"]).toBe("u1");
    expect(parsed["count"]).toBe(5);
  });

  it("respects log level filtering", () => {
    const logger = createLogger("svc", "req-1", "warn");

    logger.debug("should not appear");
    logger.info("should not appear");
    expect(consoleLogSpy).not.toHaveBeenCalled();

    logger.warn("should appear");
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);

    logger.error("should also appear");
    expect(consoleLogSpy).toHaveBeenCalledTimes(2);
  });

  it("redacts sensitive data in extra fields", () => {
    const logger = createLogger("svc", "req-1", "debug");
    logger.info("auth event", { token: "secret-value", user: "alice" });

    const logLine = consoleLogSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(logLine) as Record<string, unknown>;
    expect(parsed["token"]).toBe("[REDACTED]");
    expect(parsed["user"]).toBe("alice");
  });

  it("does not include requestId when not provided", () => {
    const logger = createLogger("svc");
    logger.info("no request id");

    const logLine = consoleLogSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(logLine) as Record<string, unknown>;
    expect(parsed["requestId"]).toBeUndefined();
  });

  it("child logger inherits parent settings and overrides", () => {
    const parent = createLogger("parent-svc", "req-1", "debug");
    const child = parent.child({ service: "child-svc" });
    child.info("from child");

    const logLine = consoleLogSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(logLine) as Record<string, unknown>;
    expect(parsed["service"]).toBe("child-svc");
    expect(parsed["requestId"]).toBe("req-1");
  });
});

// ---------------------------------------------------------------
// createNoopLogger
// ---------------------------------------------------------------

describe("createNoopLogger", () => {
  it("does not output anything", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createNoopLogger();
    logger.info("test");
    logger.warn("test");
    logger.error("test");
    logger.debug("test");
    expect(spy).not.toHaveBeenCalled();
  });

  it("child returns a no-op logger", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createNoopLogger();
    const child = logger.child({ service: "x" });
    child.info("test");
    expect(spy).not.toHaveBeenCalled();
  });
});
