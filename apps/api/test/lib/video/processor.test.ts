// ---------------------------------------------------------------------------
// Tests for the video processor
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  processVideo,
  computeTimestamps,
  type VideoProcessorDeps,
} from "../../../src/lib/video/processor.js";
import { createNoopLogger } from "../../../src/lib/logger.js";
import type { FetchFn, AiRunFn } from "../../../src/lib/ai/tools.js";
import type {
  MediaTransformations,
  MediaTransformPipeline,
  MediaTransformResult,
} from "../../../src/env.js";

// ---------------------------------------------------------------------------
// Helpers — mock factories
// ---------------------------------------------------------------------------

const logger = createNoopLogger();

/**
 * Create a minimal R2Bucket mock.
 */
function createMockBucket(overrides?: {
  put?: (key: string, value: unknown, options?: unknown) => Promise<unknown>;
  get?: (key: string) => Promise<{ body: ReadableStream<Uint8Array> } | null>;
}): R2Bucket {
  const defaultGet = vi.fn().mockResolvedValue({
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([0x00, 0x01, 0x02]));
        controller.close();
      },
    }),
  });

  return {
    put: overrides?.put ?? vi.fn().mockResolvedValue(null),
    get: overrides?.get ?? defaultGet,
    head: vi.fn(),
    list: vi.fn().mockResolvedValue({ objects: [], truncated: false, cursor: "" }),
    delete: vi.fn().mockResolvedValue(undefined),
    createMultipartUpload: vi.fn(),
    resumeMultipartUpload: vi.fn(),
  } as unknown as R2Bucket;
}

/**
 * Create a mock FetchFn that returns a video response.
 */
function createMockVideoFetch(options?: {
  status?: number;
  contentLength?: number | null;
  body?: ArrayBuffer | null;
  throwError?: string;
}): FetchFn {
  if (options?.throwError !== undefined) {
    return async (): Promise<Response> => {
      throw new Error(options.throwError);
    };
  }

  const status = options?.status ?? 200;
  const bodyData = options?.body ?? new ArrayBuffer(1024);

  return async (): Promise<Response> => {
    const headers: Record<string, string> = {
      "Content-Type": "video/mp4",
    };
    if (options?.contentLength !== null) {
      const cl = options?.contentLength ?? 1024;
      headers["Content-Length"] = String(cl);
    }

    return new Response(bodyData, { status, headers });
  };
}

/**
 * Create a mock MEDIA binding.
 * Returns configurable audio response and frame response.
 */
function createMockMedia(options?: {
  audioBody?: ArrayBuffer;
  audioStatus?: number;
  frameBody?: ArrayBuffer;
  frameStatus?: number;
  throwOnAudio?: boolean;
  throwOnFrame?: boolean;
}): MediaTransformations {
  const audioBody = options?.audioBody ?? new ArrayBuffer(512);
  const audioStatus = options?.audioStatus ?? 200;
  const frameBody = options?.frameBody ?? new ArrayBuffer(256);
  const frameStatus = options?.frameStatus ?? 200;

  return {
    input(_source: ReadableStream<Uint8Array>): MediaTransformPipeline {
      const pipeline: MediaTransformPipeline = {
        transform(): MediaTransformPipeline {
          return pipeline;
        },
        output(opts): MediaTransformResult {
          if (opts.mode === "audio") {
            if (options?.throwOnAudio === true) {
              return {
                response: () => Promise.reject(new Error("Audio extraction failed")),
                media: () => Promise.reject(new Error("Audio extraction failed")),
                contentType: () => Promise.resolve("audio/mp4"),
              };
            }
            return {
              response: () => Promise.resolve(new Response(audioBody, { status: audioStatus })),
              media: () =>
                Promise.resolve(
                  new ReadableStream({
                    start(controller) {
                      controller.enqueue(new Uint8Array(audioBody));
                      controller.close();
                    },
                  }),
                ),
              contentType: () => Promise.resolve("audio/mp4"),
            };
          }

          // frame mode
          if (options?.throwOnFrame === true) {
            return {
              response: () => Promise.reject(new Error("Frame extraction failed")),
              media: () => Promise.reject(new Error("Frame extraction failed")),
              contentType: () => Promise.resolve("image/jpeg"),
            };
          }
          return {
            response: () => Promise.resolve(new Response(frameBody, { status: frameStatus })),
            media: () =>
              Promise.resolve(
                new ReadableStream({
                  start(controller) {
                    controller.enqueue(new Uint8Array(frameBody));
                    controller.close();
                  },
                }),
              ),
            contentType: () => Promise.resolve("image/jpeg"),
          };
        },
      };
      return pipeline;
    },
  };
}

/**
 * Create a mock AiRunFn (Whisper).
 */
function createMockAiRun(transcript?: string): AiRunFn {
  return vi
    .fn()
    .mockResolvedValue({ text: transcript ?? "This is a test transcript from the video." });
}

/**
 * Create a mock Anthropic fetch that returns a vision response.
 */
function createMockAnthropicFetch(frameText?: string): Anthropic["_options"]["fetch"] {
  const text = frameText ?? "Recipe: 2 cups flour, 1 cup sugar";
  return async (): Promise<Response> => {
    return new Response(
      JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text }],
        model: "claude-sonnet-4-0",
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };
}

// Need the Anthropic import for the custom fetch type
import type Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// computeTimestamps (pure function)
// ---------------------------------------------------------------------------

describe("computeTimestamps", () => {
  it("returns evenly-spaced timestamps within the inner 80%", () => {
    const ts = computeTimestamps(100, 5);
    // 10% = 10s, 90% = 90s, step = 20s
    expect(ts).toEqual([10, 30, 50, 70, 90]);
  });

  it("returns a single midpoint for count=1", () => {
    const ts = computeTimestamps(60, 1);
    // 10% = 6, 90% = 54, mid = 30
    expect(ts).toEqual([30]);
  });

  it("returns empty array for count=0", () => {
    expect(computeTimestamps(60, 0)).toEqual([]);
  });

  it("returns empty array for zero duration", () => {
    expect(computeTimestamps(0, 5)).toEqual([]);
  });

  it("handles short videos gracefully", () => {
    const ts = computeTimestamps(10, 5);
    // 10% = 1, 90% = 9, step = 2
    expect(ts).toEqual([1, 3, 5, 7, 9]);
  });
});

// ---------------------------------------------------------------------------
// processVideo — success case
// ---------------------------------------------------------------------------

describe("processVideo", () => {
  let deps: VideoProcessorDeps;

  beforeEach(() => {
    deps = {
      fetchFn: createMockVideoFetch(),
      bucket: createMockBucket(),
      media: createMockMedia(),
      aiRunFn: createMockAiRun(),
      anthropicApiKey: "test-key",
      anthropicFetch: createMockAnthropicFetch(),
      logger,
    };
  });

  it("returns transcript and frame texts on full success", async () => {
    const result = await processVideo(
      deps,
      "job-1",
      "https://cdn.example.com/video.mp4",
      "My recipe video",
      30,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.transcript).toBe("This is a test transcript from the video.");
      expect(result.value.frameTexts.length).toBeGreaterThan(0);
      expect(result.value.caption).toBe("My recipe video");
      expect(result.value.tempR2Keys.length).toBeGreaterThan(0);
    }
  });

  it("includes source video key in tempR2Keys", async () => {
    const result = await processVideo(deps, "job-2", "https://cdn.example.com/video.mp4", null, 30);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tempR2Keys).toContain("tmp/video-import/job-2/source.mp4");
    }
  });

  // -------------------------------------------------------------------------
  // Partial success: audio fails but frames work
  // -------------------------------------------------------------------------

  it("returns frame results when audio extraction fails", async () => {
    deps = {
      ...deps,
      media: createMockMedia({ throwOnAudio: true }),
    };

    const result = await processVideo(deps, "job-3", "https://cdn.example.com/video.mp4", null, 30);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.transcript).toBeNull();
      expect(result.value.frameTexts.length).toBeGreaterThan(0);
    }
  });

  // -------------------------------------------------------------------------
  // Partial success: frames fail but audio works
  // -------------------------------------------------------------------------

  it("returns transcript when frame extraction fails", async () => {
    deps = {
      ...deps,
      media: createMockMedia({ throwOnFrame: true }),
    };

    const result = await processVideo(deps, "job-4", "https://cdn.example.com/video.mp4", null, 30);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.transcript).toBe("This is a test transcript from the video.");
      expect(result.value.frameTexts).toEqual([]);
    }
  });

  // -------------------------------------------------------------------------
  // Video too large (>100MB)
  // -------------------------------------------------------------------------

  it("returns FileTooLarge error when Content-Length exceeds 100MB", async () => {
    deps = {
      ...deps,
      fetchFn: createMockVideoFetch({
        contentLength: 150 * 1024 * 1024, // 150 MB
      }),
    };

    const result = await processVideo(deps, "job-5", "https://cdn.example.com/huge.mp4", null, 30);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("FileTooLarge");
      if (result.error.type === "FileTooLarge") {
        expect(result.error.size_bytes).toBe(150 * 1024 * 1024);
      }
    }
  });

  // -------------------------------------------------------------------------
  // MEDIA binding unavailable (graceful degradation)
  // -------------------------------------------------------------------------

  it("returns null transcript and empty frameTexts when MEDIA is null", async () => {
    deps = {
      ...deps,
      media: null,
    };

    const result = await processVideo(
      deps,
      "job-6",
      "https://cdn.example.com/video.mp4",
      "Some caption",
      30,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.transcript).toBeNull();
      expect(result.value.frameTexts).toEqual([]);
      expect(result.value.caption).toBe("Some caption");
      // Should still have the source key from the download
      expect(result.value.tempR2Keys).toContain("tmp/video-import/job-6/source.mp4");
    }
  });

  // -------------------------------------------------------------------------
  // Download failure
  // -------------------------------------------------------------------------

  it("returns FetchFailed when the video URL returns a non-OK status", async () => {
    deps = {
      ...deps,
      fetchFn: createMockVideoFetch({ status: 404 }),
    };

    const result = await processVideo(
      deps,
      "job-7",
      "https://cdn.example.com/missing.mp4",
      null,
      30,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("FetchFailed");
      if (result.error.type === "FetchFailed") {
        expect(result.error.reason).toContain("404");
      }
    }
  });

  it("returns FetchFailed when the fetch throws a network error", async () => {
    deps = {
      ...deps,
      fetchFn: createMockVideoFetch({ throwError: "Network timeout" }),
    };

    const result = await processVideo(deps, "job-8", "https://cdn.example.com/video.mp4", null, 30);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("FetchFailed");
      if (result.error.type === "FetchFailed") {
        expect(result.error.reason).toContain("Network timeout");
      }
    }
  });

  // -------------------------------------------------------------------------
  // Video too long
  // -------------------------------------------------------------------------

  it("returns VideoTooLong when estimated duration exceeds 600s", async () => {
    const result = await processVideo(
      deps,
      "job-9",
      "https://cdn.example.com/video.mp4",
      null,
      700,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("VideoTooLong");
      if (result.error.type === "VideoTooLong") {
        expect(result.error.duration_seconds).toBe(700);
      }
    }
  });

  // -------------------------------------------------------------------------
  // No AI run function or Anthropic key
  // -------------------------------------------------------------------------

  it("returns null transcript when aiRunFn is not provided", async () => {
    deps = {
      ...deps,
      aiRunFn: undefined,
    };

    const result = await processVideo(
      deps,
      "job-10",
      "https://cdn.example.com/video.mp4",
      null,
      30,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.transcript).toBeNull();
    }
  });

  it("returns empty frameTexts when anthropicApiKey is not provided", async () => {
    deps = {
      ...deps,
      anthropicApiKey: undefined,
    };

    const result = await processVideo(
      deps,
      "job-11",
      "https://cdn.example.com/video.mp4",
      null,
      30,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.frameTexts).toEqual([]);
    }
  });

  // -------------------------------------------------------------------------
  // Default duration when null
  // -------------------------------------------------------------------------

  it("uses default 30s duration when estimatedDurationSeconds is null", async () => {
    const result = await processVideo(
      deps,
      "job-12",
      "https://cdn.example.com/video.mp4",
      null,
      null,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should still produce frames — timestamps based on default 30s
      expect(result.value.tempR2Keys.length).toBeGreaterThanOrEqual(1);
    }
  });

  // -------------------------------------------------------------------------
  // Deduplication of frame texts
  // -------------------------------------------------------------------------

  it("deduplicates identical frame texts", async () => {
    // All frames return the same text
    deps = {
      ...deps,
      anthropicFetch: createMockAnthropicFetch("Same text on every frame"),
    };

    const result = await processVideo(
      deps,
      "job-13",
      "https://cdn.example.com/video.mp4",
      null,
      30,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should be deduplicated to just one entry
      expect(result.value.frameTexts).toEqual(["Same text on every frame"]);
    }
  });

  // -------------------------------------------------------------------------
  // NONE frame text is filtered out
  // -------------------------------------------------------------------------

  it("filters out NONE responses from frame vision", async () => {
    deps = {
      ...deps,
      anthropicFetch: createMockAnthropicFetch("NONE"),
    };

    const result = await processVideo(
      deps,
      "job-14",
      "https://cdn.example.com/video.mp4",
      null,
      30,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.frameTexts).toEqual([]);
    }
  });

  // -------------------------------------------------------------------------
  // Whisper returns empty text
  // -------------------------------------------------------------------------

  it("returns null transcript when Whisper returns empty text", async () => {
    deps = {
      ...deps,
      aiRunFn: createMockAiRun(""),
    };

    const result = await processVideo(
      deps,
      "job-15",
      "https://cdn.example.com/video.mp4",
      null,
      30,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.transcript).toBeNull();
    }
  });
});
