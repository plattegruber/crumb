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

  // --- Observability ---
  LOG_LEVEL: string;
}
