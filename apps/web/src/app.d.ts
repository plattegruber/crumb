import type { D1Database } from "@cloudflare/workers-types";

declare global {
  namespace App {
    interface Error {
      message: string;
      code?: string;
    }
    interface Locals {
      userId: string | null;
      sessionToken: string | null;
    }
    interface PageData {
      userId: string | null;
    }
    // interface PageState {}
    interface Platform {
      env: {
        DB: D1Database;
      };
      context: {
        waitUntil(promise: Promise<unknown>): void;
      };
      caches: CacheStorage & { default: Cache };
    }
  }
}

export {};
