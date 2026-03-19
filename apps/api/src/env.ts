/**
 * Cloudflare Worker environment bindings.
 *
 * These are declared in wrangler.toml and injected at runtime.
 * Secret values (CLERK_SECRET_KEY, KIT_CLIENT_SECRET) are set via
 * `npx wrangler secret put <NAME>` and never appear in source.
 */
export interface Env {
  // --- Cloudflare Bindings ---
  DB: D1Database;
  STORAGE: R2Bucket;
  CACHE: KVNamespace;
  IMPORT_QUEUE: Queue;
  RENDER_QUEUE: Queue;

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
