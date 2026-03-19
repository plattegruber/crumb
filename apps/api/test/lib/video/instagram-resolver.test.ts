// ---------------------------------------------------------------------------
// Tests for Instagram video URL resolver via RapidAPI
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { resolveInstagramVideoUrl } from "../../../src/lib/video/instagram-resolver.js";
import type { FetchFn } from "../../../src/lib/ai/tools.js";
import { createNoopLogger } from "../../../src/lib/logger.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const REEL_URL = "https://www.instagram.com/reel/ABC123def/";
const API_KEY = "test-rapidapi-key";
const logger = createNoopLogger();

// ---------------------------------------------------------------------------
// Mock fetch helper
// ---------------------------------------------------------------------------

function createMockFetch(response: {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}): FetchFn {
  return async (_url: string, _init?: RequestInit): Promise<Response> => {
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        ...(response.headers ?? {}),
      },
    });
  };
}

/**
 * Create a mock fetch that throws a network error.
 */
function createThrowingFetch(message: string): FetchFn {
  return async (_url: string, _init?: RequestInit): Promise<Response> => {
    throw new Error(message);
  };
}

/**
 * Create a mock fetch that returns invalid (non-JSON) body.
 */
function createInvalidJsonFetch(): FetchFn {
  return async (_url: string, _init?: RequestInit): Promise<Response> => {
    return new Response("this is not json", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

// ---------------------------------------------------------------------------
// Success cases
// ---------------------------------------------------------------------------

describe("resolveInstagramVideoUrl — success", () => {
  it("returns video URL, caption, and thumbnail from top-level response", async () => {
    const mockFetch = createMockFetch({
      status: 200,
      body: {
        status: "ok",
        video_url: "https://scontent.cdninstagram.com/v/video.mp4",
        thumbnail: "https://scontent.cdninstagram.com/v/thumb.jpg",
        caption: "Amazing pasta recipe!",
        duration: 45,
      },
    });

    const result = await resolveInstagramVideoUrl(REEL_URL, API_KEY, mockFetch, logger);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.videoUrl).toBe("https://scontent.cdninstagram.com/v/video.mp4");
      expect(result.value.thumbnailUrl).toBe("https://scontent.cdninstagram.com/v/thumb.jpg");
      expect(result.value.caption).toBe("Amazing pasta recipe!");
      expect(result.value.durationSeconds).toBe(45);
    }
  });

  it("returns video URL from items array format", async () => {
    const mockFetch = createMockFetch({
      status: 200,
      body: {
        items: [
          {
            video_url: "https://scontent.cdninstagram.com/v/video.mp4",
            thumbnail: "https://scontent.cdninstagram.com/v/thumb.jpg",
            caption: { text: "From items array!" },
            video_duration: 120,
          },
        ],
      },
    });

    const result = await resolveInstagramVideoUrl(REEL_URL, API_KEY, mockFetch, logger);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.videoUrl).toBe("https://scontent.cdninstagram.com/v/video.mp4");
      expect(result.value.thumbnailUrl).toBe("https://scontent.cdninstagram.com/v/thumb.jpg");
      expect(result.value.caption).toBe("From items array!");
      expect(result.value.durationSeconds).toBe(120);
    }
  });

  it("handles null optional fields gracefully", async () => {
    const mockFetch = createMockFetch({
      status: 200,
      body: {
        video_url: "https://scontent.cdninstagram.com/v/video.mp4",
      },
    });

    const result = await resolveInstagramVideoUrl(REEL_URL, API_KEY, mockFetch, logger);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.videoUrl).toBe("https://scontent.cdninstagram.com/v/video.mp4");
      expect(result.value.thumbnailUrl).toBeNull();
      expect(result.value.caption).toBeNull();
      expect(result.value.durationSeconds).toBeNull();
    }
  });

  it("sends correct headers to RapidAPI", async () => {
    let capturedInit: RequestInit | undefined;
    const mockFetch: FetchFn = async (_url: string, init?: RequestInit): Promise<Response> => {
      capturedInit = init;
      return new Response(JSON.stringify({ video_url: "https://example.com/video.mp4" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await resolveInstagramVideoUrl(REEL_URL, API_KEY, mockFetch, logger);

    expect(capturedInit).toBeDefined();
    const headers = capturedInit?.headers as Record<string, string> | undefined;
    expect(headers?.["X-RapidAPI-Key"]).toBe(API_KEY);
    expect(headers?.["X-RapidAPI-Host"]).toBe("instagram-reels-downloader2.p.rapidapi.com");
  });

  it("encodes the reel URL as a query parameter", async () => {
    let capturedUrl = "";
    const mockFetch: FetchFn = async (url: string, _init?: RequestInit): Promise<Response> => {
      capturedUrl = url;
      return new Response(JSON.stringify({ video_url: "https://example.com/video.mp4" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await resolveInstagramVideoUrl(REEL_URL, API_KEY, mockFetch, logger);

    expect(capturedUrl).toContain(`url=${encodeURIComponent(REEL_URL)}`);
    expect(capturedUrl).toContain("instagram-reels-downloader2.p.rapidapi.com/reels");
  });
});

// ---------------------------------------------------------------------------
// API error cases
// ---------------------------------------------------------------------------

describe("resolveInstagramVideoUrl — API errors", () => {
  it("returns FetchFailed for non-200 status", async () => {
    const mockFetch = createMockFetch({
      status: 500,
      body: { error: "Internal server error" },
    });

    const result = await resolveInstagramVideoUrl(REEL_URL, API_KEY, mockFetch, logger);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("FetchFailed");
      if (result.error.type === "FetchFailed") {
        expect(result.error.reason).toContain("500");
      }
    }
  });

  it("returns FetchFailed for rate limiting (429)", async () => {
    const mockFetch = createMockFetch({
      status: 429,
      body: { error: "Rate limit exceeded" },
    });

    const result = await resolveInstagramVideoUrl(REEL_URL, API_KEY, mockFetch, logger);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("FetchFailed");
      if (result.error.type === "FetchFailed") {
        expect(result.error.reason).toContain("rate limited");
      }
    }
  });

  it("returns FetchFailed when fetch throws (network error)", async () => {
    const mockFetch = createThrowingFetch("Network connection refused");

    const result = await resolveInstagramVideoUrl(REEL_URL, API_KEY, mockFetch, logger);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("FetchFailed");
      if (result.error.type === "FetchFailed") {
        expect(result.error.reason).toContain("Network connection refused");
      }
    }
  });

  it("returns ExtractionFailed for invalid JSON response", async () => {
    const mockFetch = createInvalidJsonFetch();

    const result = await resolveInstagramVideoUrl(REEL_URL, API_KEY, mockFetch, logger);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("ExtractionFailed");
      if (result.error.type === "ExtractionFailed") {
        expect(result.error.reason).toContain("invalid JSON");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Invalid response shape
// ---------------------------------------------------------------------------

describe("resolveInstagramVideoUrl — invalid response shape", () => {
  it("returns ExtractionFailed when response has no video URL", async () => {
    const mockFetch = createMockFetch({
      status: 200,
      body: { status: "ok", thumbnail: "thumb.jpg" },
    });

    const result = await resolveInstagramVideoUrl(REEL_URL, API_KEY, mockFetch, logger);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("ExtractionFailed");
      if (result.error.type === "ExtractionFailed") {
        expect(result.error.reason).toContain("does not contain a video URL");
      }
    }
  });

  it("returns ExtractionFailed for empty video_url string", async () => {
    const mockFetch = createMockFetch({
      status: 200,
      body: { video_url: "" },
    });

    const result = await resolveInstagramVideoUrl(REEL_URL, API_KEY, mockFetch, logger);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("ExtractionFailed");
    }
  });

  it("returns ExtractionFailed for null response body", async () => {
    const mockFetch: FetchFn = async (_url: string, _init?: RequestInit): Promise<Response> => {
      return new Response("null", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await resolveInstagramVideoUrl(REEL_URL, API_KEY, mockFetch, logger);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("ExtractionFailed");
    }
  });

  it("returns ExtractionFailed for empty items array", async () => {
    const mockFetch = createMockFetch({
      status: 200,
      body: { items: [] },
    });

    const result = await resolveInstagramVideoUrl(REEL_URL, API_KEY, mockFetch, logger);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("ExtractionFailed");
    }
  });
});

// ---------------------------------------------------------------------------
// Video too long
// ---------------------------------------------------------------------------

describe("resolveInstagramVideoUrl — video too long", () => {
  it("returns VideoTooLong when duration exceeds 600 seconds", async () => {
    const mockFetch = createMockFetch({
      status: 200,
      body: {
        video_url: "https://scontent.cdninstagram.com/v/video.mp4",
        duration: 900,
      },
    });

    const result = await resolveInstagramVideoUrl(REEL_URL, API_KEY, mockFetch, logger);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("VideoTooLong");
      if (result.error.type === "VideoTooLong") {
        expect(result.error.duration_seconds).toBe(900);
      }
    }
  });

  it("returns VideoTooLong for exactly 601 seconds", async () => {
    const mockFetch = createMockFetch({
      status: 200,
      body: {
        video_url: "https://scontent.cdninstagram.com/v/video.mp4",
        duration: 601,
      },
    });

    const result = await resolveInstagramVideoUrl(REEL_URL, API_KEY, mockFetch, logger);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("VideoTooLong");
    }
  });

  it("allows exactly 600 seconds", async () => {
    const mockFetch = createMockFetch({
      status: 200,
      body: {
        video_url: "https://scontent.cdninstagram.com/v/video.mp4",
        duration: 600,
      },
    });

    const result = await resolveInstagramVideoUrl(REEL_URL, API_KEY, mockFetch, logger);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.durationSeconds).toBe(600);
    }
  });

  it("allows video when duration is absent (null)", async () => {
    const mockFetch = createMockFetch({
      status: 200,
      body: {
        video_url: "https://scontent.cdninstagram.com/v/video.mp4",
      },
    });

    const result = await resolveInstagramVideoUrl(REEL_URL, API_KEY, mockFetch, logger);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.durationSeconds).toBeNull();
    }
  });
});
