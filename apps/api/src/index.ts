import { Hono } from "hono";
import type { AppEnv } from "./middleware/auth.js";
import { clerkAuth } from "./middleware/auth.js";
import { recipeRoutes } from "./routes/recipes.js";
import { collectionRoutes } from "./routes/collections.js";

export type { AppEnv } from "./middleware/auth.js";
export type { AuthContext, CreatorId } from "./types/auth.js";

/** Paths that do not require authentication. */
const PUBLIC_PATHS = new Set(["/health"]);

const app = new Hono<AppEnv>();

// Apply Clerk JWT auth to every route except public paths.
app.use("*", async (c, next) => {
  if (PUBLIC_PATHS.has(c.req.path)) {
    await next();
    return;
  }
  return clerkAuth()(c, next);
});

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------

app.get("/health", (c) => {
  return c.json({ status: "ok" }, 200);
});

// ---------------------------------------------------------------------------
// Authenticated routes
// ---------------------------------------------------------------------------

app.route("/recipes", recipeRoutes);
app.route("/collections", collectionRoutes);

export default app;
