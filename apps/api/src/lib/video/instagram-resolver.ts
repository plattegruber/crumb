// ---------------------------------------------------------------------------
// Instagram video URL resolver via RapidAPI (instagram-reels-downloader2)
// ---------------------------------------------------------------------------
// Resolves an Instagram reel URL into a direct MP4 video CDN URL by calling
// a RapidAPI endpoint. The returned CDN URLs are ephemeral — they expire
// after roughly 1–3 hours, so the caller must consume them promptly.
// ---------------------------------------------------------------------------

import type { Result, ImportError } from "@dough/shared";
import { ok, err } from "@dough/shared";
import type { FetchFn } from "../ai/tools.js";
import type { Logger } from "../logger.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface InstagramVideoInfo {
  readonly videoUrl: string;
  readonly thumbnailUrl: string | null;
  readonly caption: string | null;
  readonly durationSeconds: number | null;
}

// ---------------------------------------------------------------------------
// RapidAPI response shape (reference only — parsed defensively from unknown)
// ---------------------------------------------------------------------------
// Top-level format:
//   { status?: string, video_url?: string, thumbnail?: string,
//     caption?: string, duration?: number,
//     items?: [{ video_url, thumbnail, caption: string | { text }, video_duration }] }
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RAPIDAPI_HOST = "instagram-reels-downloader2.p.rapidapi.com";
const RAPIDAPI_ENDPOINT = `https://${RAPIDAPI_HOST}/reels`;
const MAX_DURATION_SECONDS = 600;
const REQUEST_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Resolve an Instagram reel URL into a direct MP4 video CDN URL.
 *
 * NOTE: The returned CDN URLs expire in approximately 1–3 hours.
 * Callers should download the video promptly after resolution.
 */
export async function resolveInstagramVideoUrl(
  reelUrl: string,
  apiKey: string,
  fetchFn: FetchFn,
  logger?: Logger,
): Promise<Result<InstagramVideoInfo, ImportError>> {
  const startMs = Date.now();
  logger?.info("instagram-resolver: starting API call", { reelUrl });

  let response: Response;
  try {
    const url = `${RAPIDAPI_ENDPOINT}?url=${encodeURIComponent(reelUrl)}`;
    response = await fetchFn(url, {
      method: "GET",
      headers: {
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e: unknown) {
    const durationMs = Date.now() - startMs;
    const reason = e instanceof Error ? e.message : "Unknown fetch error";
    logger?.error("instagram-resolver: fetch failed", { reelUrl, reason, durationMs });
    return err({ type: "FetchFailed" as const, reason: `Instagram API request failed: ${reason}` });
  }

  const durationMs = Date.now() - startMs;

  // Handle rate limiting
  if (response.status === 429) {
    logger?.warn("instagram-resolver: rate limited", { reelUrl, durationMs });
    return err({
      type: "FetchFailed" as const,
      reason: "Instagram API rate limited (429). Try again later.",
    });
  }

  // Handle non-success status codes
  if (!response.ok) {
    let body = "";
    try {
      body = await response.text();
    } catch {
      // Ignore body read errors
    }
    logger?.error("instagram-resolver: API error", {
      reelUrl,
      status: response.status,
      body: body.slice(0, 500),
      durationMs,
    });
    return err({
      type: "FetchFailed" as const,
      reason: `Instagram API returned status ${String(response.status)}`,
    });
  }

  // Parse the JSON response
  let data: unknown;
  try {
    data = await response.json();
  } catch (e: unknown) {
    const reason = e instanceof Error ? e.message : "Unknown JSON parse error";
    logger?.error("instagram-resolver: invalid JSON response", { reelUrl, reason, durationMs });
    return err({
      type: "ExtractionFailed" as const,
      reason: `Instagram API returned invalid JSON: ${reason}`,
    });
  }

  // Narrow the response shape defensively
  const parsed = narrowResponse(data);

  if (parsed === null) {
    logger?.error("instagram-resolver: no video URL in response", {
      reelUrl,
      durationMs,
      responseKeys: data !== null && typeof data === "object" ? Object.keys(data) : [],
    });
    return err({
      type: "ExtractionFailed" as const,
      reason: "Instagram API response does not contain a video URL",
    });
  }

  // Validate duration if available
  if (parsed.durationSeconds !== null && parsed.durationSeconds > MAX_DURATION_SECONDS) {
    logger?.warn("instagram-resolver: video too long", {
      reelUrl,
      durationSeconds: parsed.durationSeconds,
      maxDurationSeconds: MAX_DURATION_SECONDS,
      durationMs,
    });
    return err({
      type: "VideoTooLong" as const,
      duration_seconds: parsed.durationSeconds,
    });
  }

  logger?.info("instagram-resolver: resolved successfully", {
    reelUrl,
    hasCaption: parsed.caption !== null,
    hasThumbnail: parsed.thumbnailUrl !== null,
    durationSeconds: parsed.durationSeconds,
    durationMs,
  });

  return ok(parsed);
}

// ---------------------------------------------------------------------------
// Response narrowing
// ---------------------------------------------------------------------------

/**
 * Defensively narrow an unknown API response into InstagramVideoInfo.
 * Returns null if no video URL can be extracted.
 */
function narrowResponse(data: unknown): InstagramVideoInfo | null {
  if (data === null || typeof data !== "object") {
    return null;
  }

  const obj = data as Record<string, unknown>;

  // Strategy 1: Top-level video_url field
  if (typeof obj["video_url"] === "string" && obj["video_url"].length > 0) {
    return {
      videoUrl: obj["video_url"],
      thumbnailUrl: typeof obj["thumbnail"] === "string" ? obj["thumbnail"] : null,
      caption: extractCaption(obj["caption"]),
      durationSeconds: typeof obj["duration"] === "number" ? obj["duration"] : null,
    };
  }

  // Strategy 2: Items array (some providers nest data this way)
  if (Array.isArray(obj["items"]) && obj["items"].length > 0) {
    const firstItem = obj["items"][0] as Record<string, unknown> | undefined;
    if (
      firstItem !== undefined &&
      typeof firstItem["video_url"] === "string" &&
      firstItem["video_url"].length > 0
    ) {
      return {
        videoUrl: firstItem["video_url"],
        thumbnailUrl: typeof firstItem["thumbnail"] === "string" ? firstItem["thumbnail"] : null,
        caption: extractCaption(firstItem["caption"]),
        durationSeconds:
          typeof firstItem["video_duration"] === "number" ? firstItem["video_duration"] : null,
      };
    }
  }

  return null;
}

/**
 * Extract caption from various shapes: string or { text: string }.
 */
function extractCaption(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj["text"] === "string") {
      return obj["text"];
    }
  }
  return null;
}
