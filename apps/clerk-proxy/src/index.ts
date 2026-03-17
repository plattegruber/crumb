/**
 * Clerk Frontend API Proxy Worker
 *
 * Proxies requests from clerk.makedough.app to Clerk's Frontend API.
 * Required because Cloudflare blocks CNAME records pointing to other
 * Cloudflare-proxied domains (Error 1000).
 *
 * See: https://clerk.com/docs/advanced-usage/using-proxies
 */

interface Env {
  CLERK_PROXY_URL: string;
  CLERK_FRONTEND_API: string;
  CLERK_SECRET_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Strip the /__clerk prefix before forwarding to Clerk
    const path = url.pathname.replace(/^\/__clerk/, "") || "/";
    const clerkUrl = new URL(path + url.search, env.CLERK_FRONTEND_API);

    // Build clean headers for the upstream request
    const headers = new Headers();
    // Forward essential headers
    for (const key of ["Accept", "Accept-Language", "Content-Type", "Cookie", "Authorization"]) {
      const val = request.headers.get(key);
      if (val) headers.set(key, val);
    }
    // Set the Host to Clerk's domain
    const clerkHost = new URL(env.CLERK_FRONTEND_API).host;
    headers.set("Host", clerkHost);
    // Add required Clerk proxy headers
    headers.set("Clerk-Proxy-Url", env.CLERK_PROXY_URL);
    headers.set("Clerk-Secret-Key", env.CLERK_SECRET_KEY);
    headers.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") ?? "");
    // Forward Origin/Referer for CORS
    const origin = request.headers.get("Origin");
    if (origin) headers.set("Origin", origin);
    const referer = request.headers.get("Referer");
    if (referer) headers.set("Referer", referer);

    // Forward the request to Clerk
    const response = await fetch(clerkUrl.toString(), {
      method: request.method,
      headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
      redirect: "manual",
    });

    // Return the response with CORS headers for the dashboard origin
    const responseHeaders = new Headers(response.headers);
    if (origin) {
      responseHeaders.set("Access-Control-Allow-Origin", origin);
      responseHeaders.set("Access-Control-Allow-Credentials", "true");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  },
};
