/**
 * SvelteKit server hooks.
 *
 * Since there is no official Clerk SvelteKit SDK, we extract the session
 * token from the __session cookie (same-origin) or Authorization header
 * (cross-origin) and make it available via locals.
 *
 * Full JWT verification happens on the API Worker side. The frontend
 * only passes the token through to API calls and uses the cookie
 * presence as a hint for route protection.
 */
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	// Extract session token from cookie (set by Clerk JS on the client)
	const sessionCookie = event.cookies.get('__session');
	const authHeader = event.request.headers.get('Authorization');

	let sessionToken: string | null = null;

	if (sessionCookie) {
		sessionToken = sessionCookie;
	} else if (authHeader?.startsWith('Bearer ')) {
		sessionToken = authHeader.slice(7);
	}

	// Decode user ID from JWT payload (no verification -- that is the
	// API Worker's responsibility). We only use this for route guarding.
	let userId: string | null = null;
	if (sessionToken) {
		try {
			const parts = sessionToken.split('.');
			if (parts.length === 3 && parts[1]) {
				const payload = JSON.parse(atob(parts[1]));
				userId = (payload.sub as string) ?? null;
			}
		} catch {
			// Invalid token format -- treat as unauthenticated
		}
	}

	event.locals.userId = userId;
	event.locals.sessionToken = sessionToken;

	return resolve(event);
};
