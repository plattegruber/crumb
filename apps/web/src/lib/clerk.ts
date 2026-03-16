/**
 * Clerk authentication integration for SvelteKit.
 *
 * Uses @clerk/clerk-js (the vanilla JS SDK) since Clerk does not
 * currently provide an official SvelteKit SDK.
 */
import type Clerk from '@clerk/clerk-js';

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
		const { Clerk: ClerkConstructor } = await import('@clerk/clerk-js');
		const clerk = new ClerkConstructor(publishableKey);
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
