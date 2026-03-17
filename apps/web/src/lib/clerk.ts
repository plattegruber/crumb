/**
 * Clerk authentication integration for SvelteKit.
 *
 * Uses @clerk/clerk-js (the vanilla JS SDK) since Clerk does not
 * currently provide an official SvelteKit SDK.
 */
import type Clerk from "@clerk/clerk-js";

let clerkInstance: Clerk | null = null;
let clerkPromise: Promise<Clerk> | null = null;

/**
 * Initialize and return the Clerk singleton.
 *
 * Safe to call multiple times -- only the first call creates an instance.
 * Returns the same promise on concurrent calls.
 */
export async function getClerk(publishableKey: string): Promise<Clerk> {
  if (clerkInstance) {
    return clerkInstance;
  }

  if (clerkPromise) {
    return clerkPromise;
  }

  clerkPromise = (async () => {
    // Use the Clerk browser bundle via a script tag for full UI support.
    // The NPM ESM import strips UI components in Vite's bundler.
    const clerkFapiHost = "genuine-panda-65.clerk.accounts.dev";
    const scriptUrl = `https://${clerkFapiHost}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;

    await new Promise<void>((resolve, reject) => {
      // Check if already loaded
      if ((window as Record<string, unknown>).Clerk) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = scriptUrl;
      script.crossOrigin = "anonymous";
      script.dataset.clerkPublishableKey = publishableKey;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Clerk script"));
      document.head.appendChild(script);
    });

    // Wait for Clerk global to be ready
    const win = window as Record<string, unknown>;
    let attempts = 0;
    while (!win.Clerk && attempts < 50) {
      await new Promise((r) => setTimeout(r, 100));
      attempts++;
    }

    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    const clerk = win.Clerk as import("@clerk/clerk-js").default;
    if (!clerk) {
      throw new Error("Clerk failed to initialize");
    }

    await clerk.load();
    clerkInstance = clerk;
    return clerk;
  })();

  return clerkPromise;
}

/**
 * Get the current session token for API calls, or null if not signed in.
 */
export async function getSessionToken(): Promise<string | null> {
  if (!clerkInstance) {
    return null;
  }

  const session = clerkInstance.session;
  if (!session) {
    return null;
  }

  const token = await session.getToken();
  return token;
}

/**
 * Check if the user is currently signed in.
 */
export function isSignedIn(): boolean {
  if (!clerkInstance) {
    return false;
  }
  return clerkInstance.user !== null && clerkInstance.user !== undefined;
}

/**
 * Get the raw Clerk instance (may be null if not yet initialized).
 */
export function getClerkInstance(): Clerk | null {
  return clerkInstance;
}
