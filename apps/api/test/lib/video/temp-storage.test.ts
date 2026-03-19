// ---------------------------------------------------------------------------
// Tests for temporary R2 storage helpers
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateTempKey,
  uploadToTempR2,
  cleanupTempR2,
} from "../../../src/lib/video/temp-storage.js";
import { createNoopLogger, type Logger } from "../../../src/lib/logger.js";

// ---------------------------------------------------------------------------
// Helpers — minimal R2Bucket mock
// ---------------------------------------------------------------------------

interface MockR2Object {
  key: string;
}

interface MockR2ListResult {
  objects: MockR2Object[];
  truncated: boolean;
  cursor: string;
}

function createMockBucket(overrides?: {
  put?: (key: string, value: unknown, options?: unknown) => Promise<unknown>;
  list?: (options?: unknown) => Promise<MockR2ListResult>;
  delete?: (keys: string | string[]) => Promise<void>;
}): R2Bucket {
  return {
    put: overrides?.put ?? vi.fn().mockResolvedValue(null),
    get: vi.fn(),
    head: vi.fn(),
    list:
      overrides?.list ?? vi.fn().mockResolvedValue({ objects: [], truncated: false, cursor: "" }),
    delete: overrides?.delete ?? vi.fn().mockResolvedValue(undefined),
    createMultipartUpload: vi.fn(),
    resumeMultipartUpload: vi.fn(),
  } as unknown as R2Bucket;
}

// ---------------------------------------------------------------------------
// generateTempKey
// ---------------------------------------------------------------------------

describe("generateTempKey", () => {
  it("returns the expected prefix structure", () => {
    const key = generateTempKey("job-123", "source.mp4");
    expect(key).toBe("tmp/video-import/job-123/source.mp4");
  });

  it("handles different suffixes", () => {
    expect(generateTempKey("abc", "frame.jpg")).toBe("tmp/video-import/abc/frame.jpg");
    expect(generateTempKey("abc", "audio.m4a")).toBe("tmp/video-import/abc/audio.m4a");
  });

  it("preserves job IDs with special characters", () => {
    const key = generateTempKey("job-with-dashes-123", "out.mp4");
    expect(key).toBe("tmp/video-import/job-with-dashes-123/out.mp4");
  });
});

// ---------------------------------------------------------------------------
// uploadToTempR2
// ---------------------------------------------------------------------------

describe("uploadToTempR2", () => {
  it("calls bucket.put with correct key and content type", async () => {
    const putFn = vi.fn().mockResolvedValue(null);
    const bucket = createMockBucket({ put: putFn });
    const data = new ArrayBuffer(8);

    const result = await uploadToTempR2(
      bucket,
      "tmp/video-import/j1/source.mp4",
      data,
      "video/mp4",
    );

    expect(result.ok).toBe(true);
    expect(putFn).toHaveBeenCalledTimes(1);
    expect(putFn).toHaveBeenCalledWith("tmp/video-import/j1/source.mp4", data, {
      httpMetadata: { contentType: "video/mp4" },
    });
  });

  it("accepts a ReadableStream as data", async () => {
    const putFn = vi.fn().mockResolvedValue(null);
    const bucket = createMockBucket({ put: putFn });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });

    const result = await uploadToTempR2(
      bucket,
      "tmp/video-import/j1/audio.m4a",
      stream,
      "audio/mp4",
    );

    expect(result.ok).toBe(true);
    expect(putFn).toHaveBeenCalledTimes(1);
  });

  it("returns an error Result when bucket.put throws", async () => {
    const putFn = vi.fn().mockRejectedValue(new Error("R2 write timeout"));
    const bucket = createMockBucket({ put: putFn });

    const result = await uploadToTempR2(
      bucket,
      "tmp/video-import/j1/source.mp4",
      new ArrayBuffer(0),
      "video/mp4",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("ExtractionFailed");
      expect(result.error).toHaveProperty("reason");
      if ("reason" in result.error) {
        expect(result.error.reason).toContain("R2 upload failed");
        expect(result.error.reason).toContain("R2 write timeout");
      }
    }
  });

  it("handles non-Error throws gracefully", async () => {
    const putFn = vi.fn().mockRejectedValue("string-error");
    const bucket = createMockBucket({ put: putFn });

    const result = await uploadToTempR2(
      bucket,
      "tmp/video-import/j1/source.mp4",
      new ArrayBuffer(0),
      "video/mp4",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("ExtractionFailed");
      if ("reason" in result.error) {
        expect(result.error.reason).toContain("Unknown R2 upload error");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// cleanupTempR2
// ---------------------------------------------------------------------------

describe("cleanupTempR2", () => {
  let logger: Logger;

  beforeEach(() => {
    logger = createNoopLogger();
  });

  it("lists and deletes all keys under the job prefix", async () => {
    const deleteFn = vi.fn().mockResolvedValue(undefined);
    const listFn = vi.fn().mockResolvedValue({
      objects: [
        { key: "tmp/video-import/j1/source.mp4" },
        { key: "tmp/video-import/j1/frame.jpg" },
        { key: "tmp/video-import/j1/audio.m4a" },
      ],
      truncated: false,
      cursor: "",
    });
    const bucket = createMockBucket({ list: listFn, delete: deleteFn });

    await cleanupTempR2(bucket, "j1", logger);

    expect(listFn).toHaveBeenCalledTimes(1);
    expect(listFn).toHaveBeenCalledWith({
      prefix: "tmp/video-import/j1/",
      cursor: undefined,
    });
    expect(deleteFn).toHaveBeenCalledTimes(1);
    expect(deleteFn).toHaveBeenCalledWith([
      "tmp/video-import/j1/source.mp4",
      "tmp/video-import/j1/frame.jpg",
      "tmp/video-import/j1/audio.m4a",
    ]);
  });

  it("does nothing when no keys exist", async () => {
    const deleteFn = vi.fn().mockResolvedValue(undefined);
    const listFn = vi.fn().mockResolvedValue({
      objects: [],
      truncated: false,
      cursor: "",
    });
    const bucket = createMockBucket({ list: listFn, delete: deleteFn });

    await cleanupTempR2(bucket, "empty-job", logger);

    expect(listFn).toHaveBeenCalledTimes(1);
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it("handles paginated listing (truncated = true)", async () => {
    const deleteFn = vi.fn().mockResolvedValue(undefined);
    const listFn = vi
      .fn()
      .mockResolvedValueOnce({
        objects: [{ key: "tmp/video-import/j1/page1.mp4" }],
        truncated: true,
        cursor: "cursor-1",
      })
      .mockResolvedValueOnce({
        objects: [{ key: "tmp/video-import/j1/page2.mp4" }],
        truncated: false,
        cursor: "",
      });
    const bucket = createMockBucket({ list: listFn, delete: deleteFn });

    await cleanupTempR2(bucket, "j1", logger);

    expect(listFn).toHaveBeenCalledTimes(2);
    expect(listFn).toHaveBeenNthCalledWith(1, {
      prefix: "tmp/video-import/j1/",
      cursor: undefined,
    });
    expect(listFn).toHaveBeenNthCalledWith(2, {
      prefix: "tmp/video-import/j1/",
      cursor: "cursor-1",
    });
    expect(deleteFn).toHaveBeenCalledTimes(2);
  });

  it("logs errors but does not throw when list fails", async () => {
    const errorSpy = vi.fn();
    const testLogger: Logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: errorSpy,
      debug: vi.fn(),
      child: () => testLogger,
    };
    const listFn = vi.fn().mockRejectedValue(new Error("R2 list timeout"));
    const bucket = createMockBucket({ list: listFn });

    // Should not throw
    await cleanupTempR2(bucket, "j1", testLogger);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith("temp_r2_cleanup_failed", {
      jobId: "j1",
      error: "R2 list timeout",
    });
  });

  it("logs errors but does not throw when delete fails", async () => {
    const errorSpy = vi.fn();
    const testLogger: Logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: errorSpy,
      debug: vi.fn(),
      child: () => testLogger,
    };
    const listFn = vi.fn().mockResolvedValue({
      objects: [{ key: "tmp/video-import/j1/source.mp4" }],
      truncated: false,
      cursor: "",
    });
    const deleteFn = vi.fn().mockRejectedValue(new Error("R2 delete error"));
    const bucket = createMockBucket({ list: listFn, delete: deleteFn });

    // Should not throw
    await cleanupTempR2(bucket, "j1", testLogger);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith("temp_r2_cleanup_failed", {
      jobId: "j1",
      error: "R2 delete error",
    });
  });
});
