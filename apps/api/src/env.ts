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
  KIT_CLIENT_ID: string;
  KIT_CLIENT_SECRET: string;

  // --- Observability ---
  LOG_LEVEL: string;
}
