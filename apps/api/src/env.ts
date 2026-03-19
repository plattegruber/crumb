/**
 * Cloudflare Worker environment bindings.
 *
 * These are declared in wrangler.toml and injected at runtime.
 * Secret values (CLERK_SECRET_KEY, KIT_CLIENT_SECRET) are set via
 * `npx wrangler secret put <NAME>` and never appear in source.
 */

// ---------------------------------------------------------------------------
// Media Transformations binding type
// ---------------------------------------------------------------------------
// The Media Transformations binding was announced 2026-03-18 and is not yet
// included in @cloudflare/workers-types. We declare the type manually based
// on the official documentation:
// https://developers.cloudflare.com/stream/transform-videos/bindings/
// ---------------------------------------------------------------------------

/** Options for the `.transform()` step (resize / crop). */
export interface MediaTransformOptions {
  readonly width?: number;
  readonly height?: number;
  readonly fit?: "contain" | "cover" | "scale-down";
}

/** Options for the `.output()` step. */
export interface MediaOutputOptions {
  readonly mode: "video" | "frame" | "spritesheet" | "audio";
  /** Start timestamp, e.g. "2s", "1m". */
  readonly time?: string;
  /** Duration for video/audio/spritesheet modes, e.g. "5s". */
  readonly duration?: string;
  /** Number of frames (spritesheet mode only). */
  readonly imageCount?: number;
  /** Output format: "jpg" | "png" for frame, "m4a" for audio. */
  readonly format?: string;
  /** Include audio track in video mode (default: true). */
  readonly audio?: boolean;
}

/** The result of a media transformation pipeline. */
export interface MediaTransformResult {
  /** Return the result as an HTTP Response. */
  response(): Promise<Response>;
  /** Return the result as a ReadableStream. */
  media(): Promise<ReadableStream<Uint8Array>>;
  /** Return the MIME content-type of the result. */
  contentType(): Promise<string>;
}

/** Intermediate builder after `.input()`, before `.output()`. */
export interface MediaTransformPipeline {
  transform(options: MediaTransformOptions): MediaTransformPipeline;
  output(options: MediaOutputOptions): MediaTransformResult;
}

/** Cloudflare Media Transformations binding (env.MEDIA). */
export interface MediaTransformations {
  input(source: ReadableStream<Uint8Array>): MediaTransformPipeline;
}

export interface Env {
  // --- Cloudflare Bindings ---
  DB: D1Database;
  STORAGE: R2Bucket;
  CACHE: KVNamespace;
  IMPORT_QUEUE: Queue;
  RENDER_QUEUE: Queue;

  // --- Media Transformations ---
  /** Media Transformations binding for video processing (frame/audio extraction). */
  MEDIA?: MediaTransformations;

  // --- Clerk ---
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_SECRET_KEY: string;

  // --- Kit (ConvertKit) ---
  /** Kit v4 API key — used for local dev / testing (X-Kit-Api-Key header). */
  KIT_API_KEY?: string;
  /** Kit OAuth client ID — required for production OAuth flow. */
  KIT_CLIENT_ID?: string;
  /** Kit OAuth client secret — required for production OAuth flow. */
  KIT_CLIENT_SECRET?: string;

  // --- Workers AI ---
  /** Workers AI binding. Present when [ai] is configured in wrangler.toml. */
  AI?: Ai;

  // --- Anthropic ---
  /** Anthropic API key for Claude-powered recipe extraction. */
  ANTHROPIC_API_KEY?: string;

  // --- Observability ---
  LOG_LEVEL: string;
  /** Axiom API token — set via `npx wrangler secret put AXIOM_TOKEN`. */
  AXIOM_TOKEN?: string;
  /** Axiom dataset name for log ingest. */
  AXIOM_DATASET?: string;
}
