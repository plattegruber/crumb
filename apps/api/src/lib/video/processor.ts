// ---------------------------------------------------------------------------
// Video processor — downloads video, extracts audio + frames, transcribes,
// and analyzes frames with Claude vision.
// ---------------------------------------------------------------------------
// Orchestrates the Cloudflare Media Transformations binding, Workers AI
// Whisper, and the Anthropic Claude SDK to produce structured text output
// from a video URL. Designed for the import pipeline (SPEC SS7).
// ---------------------------------------------------------------------------

import Anthropic from "@anthropic-ai/sdk";
import type { Result, ImportError } from "@dough/shared";
import { ok, err } from "@dough/shared";
import type { FetchFn, AiRunFn } from "../ai/tools.js";
import type { Logger } from "../logger.js";
import type { MediaTransformations } from "../../env.js";
import { generateTempKey, uploadToTempR2 } from "./temp-storage.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum video file size in bytes (100 MB). */
const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024;

/** Maximum video duration in seconds (10 minutes). */
const MAX_DURATION_SECONDS = 600;

/** Default assumed duration when the real value is unknown (30 s). */
const DEFAULT_DURATION_SECONDS = 30;

/** Number of evenly-spaced keyframes to extract. */
const KEYFRAME_COUNT = 5;

/** Whisper model used for audio transcription. */
const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";

/** Claude model used for frame OCR / vision. */
const CLAUDE_VISION_MODEL = "claude-sonnet-4-0";

/** Timeout for downloading the source video (60 s). */
const DOWNLOAD_TIMEOUT_MS = 60_000;

/** Frame width for the MEDIA transform step. */
const FRAME_WIDTH = 1280;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface VideoProcessorDeps {
  readonly fetchFn: FetchFn;
  readonly bucket: R2Bucket;
  readonly media: MediaTransformations | null;
  readonly aiRunFn?: AiRunFn;
  readonly anthropicApiKey?: string;
  readonly logger?: Logger;
  /** Custom fetch for the Anthropic SDK — used in tests to mock API calls. */
  readonly anthropicFetch?: Anthropic["_options"]["fetch"];
}

export interface VideoProcessResult {
  readonly transcript: string | null;
  readonly frameTexts: readonly string[];
  readonly caption: string | null;
  readonly tempR2Keys: readonly string[];
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Download a video, extract audio + keyframes, transcribe, and read
 * on-screen text from each frame.
 *
 * Audio extraction + transcription and frame extraction + vision analysis
 * run in parallel. Either path may fail independently — partial results
 * are returned so the caller can still use whatever was extracted.
 */
export async function processVideo(
  deps: VideoProcessorDeps,
  jobId: string,
  videoUrl: string,
  caption: string | null,
  estimatedDurationSeconds: number | null,
): Promise<Result<VideoProcessResult, ImportError>> {
  const log = deps.logger;
  const startMs = Date.now();
  const tempKeys: string[] = [];

  log?.info("video_processor_start", { jobId, videoUrl, caption: caption ?? "[none]" });

  // -----------------------------------------------------------------------
  // 0. Validate duration
  // -----------------------------------------------------------------------
  if (estimatedDurationSeconds !== null && estimatedDurationSeconds > MAX_DURATION_SECONDS) {
    log?.warn("video_processor_too_long", {
      jobId,
      durationSeconds: estimatedDurationSeconds,
    });
    return err({ type: "VideoTooLong", duration_seconds: estimatedDurationSeconds });
  }

  // -----------------------------------------------------------------------
  // 1. Download the video to R2
  // -----------------------------------------------------------------------
  const downloadResult = await downloadVideoToR2(deps, jobId, videoUrl);
  if (!downloadResult.ok) {
    return downloadResult;
  }
  tempKeys.push(downloadResult.value.key);

  log?.info("video_processor_downloaded", {
    jobId,
    sizeBytes: downloadResult.value.sizeBytes,
    durationMs: Date.now() - startMs,
  });

  // -----------------------------------------------------------------------
  // 2. Graceful degradation: if MEDIA binding is unavailable, bail early
  // -----------------------------------------------------------------------
  if (deps.media === null) {
    log?.warn("video_processor_no_media_binding", { jobId });
    return ok({
      transcript: null,
      frameTexts: [],
      caption,
      tempR2Keys: tempKeys,
    });
  }

  // -----------------------------------------------------------------------
  // 3. Run audio and frame paths in parallel
  // -----------------------------------------------------------------------
  const duration = estimatedDurationSeconds ?? DEFAULT_DURATION_SECONDS;

  const [audioResult, framesResult] = await Promise.allSettled([
    extractAndTranscribeAudio(deps, jobId, tempKeys, downloadResult.value.key),
    extractAndAnalyzeFrames(deps, jobId, tempKeys, downloadResult.value.key, duration),
  ]);

  const transcript = audioResult.status === "fulfilled" ? audioResult.value : null;
  const frameTexts = framesResult.status === "fulfilled" ? framesResult.value : [];

  if (audioResult.status === "rejected") {
    const reason =
      audioResult.reason instanceof Error ? audioResult.reason.message : "Unknown audio error";
    log?.error("video_processor_audio_failed", { jobId, reason });
  }

  if (framesResult.status === "rejected") {
    const reason =
      framesResult.reason instanceof Error ? framesResult.reason.message : "Unknown frames error";
    log?.error("video_processor_frames_failed", { jobId, reason });
  }

  log?.info("video_processor_complete", {
    jobId,
    hasTranscript: transcript !== null,
    frameTextCount: frameTexts.length,
    totalDurationMs: Date.now() - startMs,
  });

  return ok({
    transcript,
    frameTexts,
    caption,
    tempR2Keys: tempKeys,
  });
}

// ---------------------------------------------------------------------------
// Step 1 — Download video to R2
// ---------------------------------------------------------------------------

interface DownloadedVideo {
  readonly key: string;
  readonly sizeBytes: number;
}

async function downloadVideoToR2(
  deps: VideoProcessorDeps,
  jobId: string,
  videoUrl: string,
): Promise<Result<DownloadedVideo, ImportError>> {
  const log = deps.logger;

  let response: Response;
  try {
    response = await deps.fetchFn(videoUrl, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DoughBot/1.0; +https://makedough.app)",
      },
    });
  } catch (e: unknown) {
    const reason = e instanceof Error ? e.message : "Unknown fetch error";
    log?.error("video_processor_download_failed", { jobId, reason });
    return err({ type: "FetchFailed", reason: `Video download failed: ${reason}` });
  }

  if (!response.ok) {
    log?.error("video_processor_download_http_error", {
      jobId,
      status: response.status,
    });
    return err({
      type: "FetchFailed",
      reason: `Video download returned HTTP ${String(response.status)}`,
    });
  }

  // Check Content-Length before consuming the body
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const size = parseInt(contentLength, 10);
    if (!Number.isNaN(size) && size > MAX_VIDEO_SIZE_BYTES) {
      log?.warn("video_processor_too_large", { jobId, sizeBytes: size });
      return err({ type: "FileTooLarge", size_bytes: size });
    }
  }

  const body = response.body;
  if (body === null) {
    return err({ type: "FetchFailed", reason: "Video response has no body" });
  }

  const key = generateTempKey(jobId, "source.mp4");

  const uploadResult = await uploadToTempR2(deps.bucket, key, body, "video/mp4");
  if (!uploadResult.ok) {
    return uploadResult;
  }

  // Determine the actual size: prefer Content-Length, fall back to R2 head.
  let sizeBytes = 0;
  if (contentLength !== null) {
    const parsed = parseInt(contentLength, 10);
    if (!Number.isNaN(parsed)) {
      sizeBytes = parsed;
    }
  }

  return ok({ key, sizeBytes });
}

// ---------------------------------------------------------------------------
// Step 2 — Extract audio and transcribe with Whisper
// ---------------------------------------------------------------------------

async function extractAndTranscribeAudio(
  deps: VideoProcessorDeps,
  jobId: string,
  tempKeys: string[],
  sourceKey: string,
): Promise<string | null> {
  const log = deps.logger;
  const media = deps.media;

  if (media === null || deps.aiRunFn === undefined) {
    return null;
  }

  const audioStartMs = Date.now();

  // Get the video from R2 as a ReadableStream
  const r2Object = await deps.bucket.get(sourceKey);
  if (r2Object === null) {
    log?.error("video_processor_audio_r2_missing", { jobId, sourceKey });
    return null;
  }

  // Extract audio via Media Transformations
  log?.info("video_processor_audio_extract_start", { jobId });

  const audioResult = media.input(r2Object.body).output({
    mode: "audio",
    format: "m4a",
  });

  const audioResponse = await audioResult.response();
  if (!audioResponse.ok) {
    log?.error("video_processor_audio_extract_failed", {
      jobId,
      status: audioResponse.status,
    });
    return null;
  }

  const audioBuffer = await audioResponse.arrayBuffer();

  // Store audio in R2 for debugging/audit (best-effort)
  const audioKey = generateTempKey(jobId, "audio.m4a");
  tempKeys.push(audioKey);
  await uploadToTempR2(deps.bucket, audioKey, audioBuffer, "audio/mp4");

  log?.info("video_processor_audio_extract_complete", {
    jobId,
    audioSizeBytes: audioBuffer.byteLength,
    durationMs: Date.now() - audioStartMs,
  });

  // Transcribe with Workers AI Whisper
  const transcribeStartMs = Date.now();
  log?.info("video_processor_whisper_start", { jobId });

  try {
    const whisperResult = await deps.aiRunFn(WHISPER_MODEL, {
      audio: [...new Uint8Array(audioBuffer)],
    });

    const transcription = whisperResult as { text?: string } | undefined;
    const text = transcription?.text ?? null;

    log?.info("video_processor_whisper_complete", {
      jobId,
      transcriptLength: text?.length ?? 0,
      durationMs: Date.now() - transcribeStartMs,
    });

    return text !== null && text.length > 0 ? text : null;
  } catch (e: unknown) {
    const reason = e instanceof Error ? e.message : "Unknown Whisper error";
    log?.error("video_processor_whisper_failed", { jobId, reason });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Step 3 — Extract keyframes and analyze with Claude vision
// ---------------------------------------------------------------------------

async function extractAndAnalyzeFrames(
  deps: VideoProcessorDeps,
  jobId: string,
  tempKeys: string[],
  sourceKey: string,
  durationSeconds: number,
): Promise<readonly string[]> {
  const log = deps.logger;
  const media = deps.media;

  if (media === null) {
    return [];
  }

  // Calculate evenly-spaced timestamps
  const timestamps = computeTimestamps(durationSeconds, KEYFRAME_COUNT);
  log?.info("video_processor_frames_start", {
    jobId,
    timestamps,
    durationSeconds,
  });

  // Extract each frame
  const frameBuffers: { timestamp: number; buffer: ArrayBuffer }[] = [];

  for (const ts of timestamps) {
    try {
      // Each frame extraction needs a fresh ReadableStream from R2
      const r2Object = await deps.bucket.get(sourceKey);
      if (r2Object === null) {
        log?.warn("video_processor_frame_r2_missing", { jobId, sourceKey, timestamp: ts });
        continue;
      }

      const frameResult = media
        .input(r2Object.body)
        .transform({ width: FRAME_WIDTH })
        .output({ mode: "frame", time: `${String(ts)}s`, format: "jpg" });

      const frameResponse = await frameResult.response();
      if (!frameResponse.ok) {
        log?.warn("video_processor_frame_extract_failed", {
          jobId,
          timestamp: ts,
          status: frameResponse.status,
        });
        continue;
      }

      const buffer = await frameResponse.arrayBuffer();

      // Store frame in R2 (best-effort)
      const frameKey = generateTempKey(jobId, `frame-${String(ts)}s.jpg`);
      tempKeys.push(frameKey);
      await uploadToTempR2(deps.bucket, frameKey, buffer, "image/jpeg");

      frameBuffers.push({ timestamp: ts, buffer });
    } catch (e: unknown) {
      const reason = e instanceof Error ? e.message : "Unknown frame extraction error";
      log?.warn("video_processor_frame_error", { jobId, timestamp: ts, reason });
    }
  }

  log?.info("video_processor_frames_extracted", {
    jobId,
    extractedCount: frameBuffers.length,
    totalCount: timestamps.length,
  });

  if (frameBuffers.length === 0 || deps.anthropicApiKey === undefined) {
    return [];
  }

  // Analyze each frame with Claude vision
  const frameTexts: string[] = [];
  const client = new Anthropic({
    apiKey: deps.anthropicApiKey,
    ...(deps.anthropicFetch !== undefined ? { fetch: deps.anthropicFetch } : {}),
  });

  for (const frame of frameBuffers) {
    try {
      const visionStartMs = Date.now();
      const base64Data = arrayBufferToBase64(frame.buffer);

      const message = await client.messages.create({
        model: CLAUDE_VISION_MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: base64Data,
                },
              },
              {
                type: "text",
                text: "Read ALL text visible in this video frame. Return the text exactly as written. If no text is visible, respond with NONE.",
              },
            ],
          },
        ],
      });

      const textBlocks = message.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
      const text = textBlocks
        .map((b) => b.text)
        .join("\n")
        .trim();

      log?.info("video_processor_frame_vision_complete", {
        jobId,
        timestamp: frame.timestamp,
        textLength: text.length,
        durationMs: Date.now() - visionStartMs,
      });

      if (text.length > 0 && text.toUpperCase() !== "NONE") {
        frameTexts.push(text);
      }
    } catch (e: unknown) {
      const reason = e instanceof Error ? e.message : "Unknown vision error";
      log?.warn("video_processor_frame_vision_failed", {
        jobId,
        timestamp: frame.timestamp,
        reason,
      });
    }
  }

  // Deduplicate identical frame texts
  return deduplicateTexts(frameTexts);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute evenly-spaced timestamps for frame extraction.
 * Avoids the very start (0s) and very end by placing frames within the
 * inner 80% of the video.
 */
export function computeTimestamps(durationSeconds: number, count: number): readonly number[] {
  if (count <= 0 || durationSeconds <= 0) {
    return [];
  }

  // Place frames between 10% and 90% of the duration
  const start = durationSeconds * 0.1;
  const end = durationSeconds * 0.9;

  if (count === 1) {
    return [Math.round(start + (end - start) / 2)];
  }

  const step = (end - start) / (count - 1);
  const timestamps: number[] = [];
  for (let i = 0; i < count; i++) {
    timestamps.push(Math.round(start + step * i));
  }
  return timestamps;
}

/**
 * Convert an ArrayBuffer to a base64-encoded string.
 * Works in the Cloudflare Workers runtime (no Node Buffer needed).
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- index checked
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/**
 * Remove exact duplicate texts from the frame analysis results.
 * Preserves order; keeps the first occurrence of each unique text.
 */
function deduplicateTexts(texts: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const text of texts) {
    const normalized = text.trim();
    if (normalized.length > 0 && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}
