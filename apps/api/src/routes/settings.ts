/**
 * Settings HTTP routes.
 *
 * Provides endpoints for:
 * - Kit OAuth connection management
 * - Brand Kit CRUD
 * - Team member management
 * - WordPress connection management
 */
import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth.js";
import { createDb } from "../db/index.js";
import { creators, brandKits, teamMembers } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { getAuthorizationUrl, exchangeCode, KIT_OAUTH_SCOPES } from "../lib/kit/oauth.js";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const settingsRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Kit Connection
// ---------------------------------------------------------------------------

/**
 * GET /settings/kit/status — Get current Kit connection status.
 */
settingsRoutes.get("/kit/status", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);

  const [creator] = await db
    .select({
      kit_account_id: creators.kit_account_id,
      kit_connected_at: creators.kit_connected_at,
      kit_scopes: creators.kit_scopes,
      kit_token_expires_at: creators.kit_token_expires_at,
    })
    .from(creators)
    .where(eq(creators.id, creatorId))
    .limit(1);

  if (!creator) {
    return c.json({ error: "Creator not found" }, 404 as ContentfulStatusCode);
  }

  const connected = creator.kit_account_id !== null && creator.kit_connected_at !== null;

  return c.json({
    connected,
    account_id: creator.kit_account_id,
    connected_at: creator.kit_connected_at,
    scopes: creator.kit_scopes,
    token_expires_at: creator.kit_token_expires_at,
  });
});

/**
 * GET /settings/kit/auth-url — Generate Kit OAuth authorization URL.
 */
settingsRoutes.get("/kit/auth-url", async (c) => {
  const clientId = c.env.KIT_CLIENT_ID;
  if (!clientId) {
    return c.json({ error: "Kit OAuth not configured" }, 500 as ContentfulStatusCode);
  }

  // The redirect URI should point back to our API callback endpoint
  const redirectUri =
    c.req.query("redirect_uri") ?? `${new URL(c.req.url).origin}/settings/kit/callback`;
  const state = crypto.randomUUID();

  const url = getAuthorizationUrl(clientId, redirectUri, KIT_OAUTH_SCOPES, state);

  return c.json({ url, state });
});

/**
 * POST /settings/kit/callback — Exchange authorization code for tokens.
 */
settingsRoutes.post("/kit/callback", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);

  const clientId = c.env.KIT_CLIENT_ID;
  const clientSecret = c.env.KIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return c.json({ error: "Kit OAuth not configured" }, 500 as ContentfulStatusCode);
  }

  const body = await c.req.json<{ code: string; redirect_uri: string }>();
  const { code, redirect_uri } = body;

  if (!code) {
    return c.json({ error: "Authorization code is required" }, 400 as ContentfulStatusCode);
  }

  const result = await exchangeCode(code, clientId, clientSecret, redirect_uri);

  if (!result.ok) {
    return c.json(
      { error: "Token exchange failed", details: result.error.messages },
      400 as ContentfulStatusCode,
    );
  }

  const tokens = result.value;
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await db
    .update(creators)
    .set({
      kit_access_token: tokens.access_token,
      kit_refresh_token: tokens.refresh_token,
      kit_token_expires_at: expiresAt,
      kit_scopes: [...KIT_OAUTH_SCOPES],
      kit_connected_at: now,
      kit_account_id: `kit_${creatorId}`,
      updated_at: now,
    })
    .where(eq(creators.id, creatorId));

  return c.json({ connected: true, connected_at: now });
});

/**
 * POST /settings/kit/disconnect — Remove Kit connection.
 */
settingsRoutes.post("/kit/disconnect", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const now = new Date().toISOString();

  await db
    .update(creators)
    .set({
      kit_account_id: null,
      kit_access_token: null,
      kit_refresh_token: null,
      kit_token_expires_at: null,
      kit_scopes: null,
      kit_connected_at: null,
      updated_at: now,
    })
    .where(eq(creators.id, creatorId));

  return c.json({ connected: false });
});

// ---------------------------------------------------------------------------
// Brand Kit
// ---------------------------------------------------------------------------

/**
 * GET /settings/brand — Get the creator's brand kit.
 */
settingsRoutes.get("/brand", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);

  const [brandKit] = await db
    .select()
    .from(brandKits)
    .where(eq(brandKits.creator_id, creatorId))
    .limit(1);

  return c.json({ brand_kit: brandKit ?? null });
});

/**
 * PUT /settings/brand — Create or update the creator's brand kit.
 */
settingsRoutes.put("/brand", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const now = new Date().toISOString();

  const body = await c.req.json<{
    name?: string;
    logo_url?: string | null;
    primary_color?: string;
    secondary_color?: string | null;
    accent_color?: string | null;
    heading_font_family?: string;
    heading_font_fallback?: readonly string[];
    body_font_family?: string;
    body_font_fallback?: readonly string[];
  }>();

  // Check if brand kit exists
  const [existing] = await db
    .select({ id: brandKits.id })
    .from(brandKits)
    .where(eq(brandKits.creator_id, creatorId))
    .limit(1);

  if (existing) {
    // Update existing
    await db
      .update(brandKits)
      .set({
        name: body.name,
        logo_url: body.logo_url,
        primary_color: body.primary_color,
        secondary_color: body.secondary_color,
        accent_color: body.accent_color,
        heading_font_family: body.heading_font_family,
        heading_font_fallback: body.heading_font_fallback as string[],
        body_font_family: body.body_font_family,
        body_font_fallback: body.body_font_fallback as string[],
        updated_at: now,
      })
      .where(eq(brandKits.id, existing.id));

    const [updated] = await db
      .select()
      .from(brandKits)
      .where(eq(brandKits.id, existing.id))
      .limit(1);

    return c.json({ brand_kit: updated });
  } else {
    // Create new
    const id = crypto.randomUUID();
    const newBrandKit = {
      id,
      creator_id: creatorId,
      name: body.name ?? "My Brand",
      logo_url: body.logo_url ?? null,
      primary_color: body.primary_color ?? "#e85d04",
      secondary_color: body.secondary_color ?? null,
      accent_color: body.accent_color ?? null,
      heading_font_family: body.heading_font_family ?? "Georgia",
      heading_font_fallback: (body.heading_font_fallback as string[]) ?? ["serif"],
      body_font_family: body.body_font_family ?? "system-ui",
      body_font_fallback: (body.body_font_fallback as string[]) ?? ["sans-serif"],
      created_at: now,
      updated_at: now,
    };

    await db.insert(brandKits).values(newBrandKit);

    const [created] = await db.select().from(brandKits).where(eq(brandKits.id, id)).limit(1);

    return c.json({ brand_kit: created }, 201 as ContentfulStatusCode);
  }
});

// ---------------------------------------------------------------------------
// Team Management
// ---------------------------------------------------------------------------

/**
 * GET /settings/team — List team members.
 */
settingsRoutes.get("/team", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);

  // Check subscription tier
  const [creator] = await db
    .select({ subscription_tier: creators.subscription_tier })
    .from(creators)
    .where(eq(creators.id, creatorId))
    .limit(1);

  if (!creator) {
    return c.json({ error: "Creator not found" }, 404 as ContentfulStatusCode);
  }

  const members = await db.select().from(teamMembers).where(eq(teamMembers.creator_id, creatorId));

  return c.json({
    members,
    subscription_tier: creator.subscription_tier,
  });
});

/**
 * POST /settings/team/invite — Invite a team member.
 */
settingsRoutes.post("/team/invite", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);

  // Check subscription tier
  const [creator] = await db
    .select({ subscription_tier: creators.subscription_tier })
    .from(creators)
    .where(eq(creators.id, creatorId))
    .limit(1);

  if (!creator) {
    return c.json({ error: "Creator not found" }, 404 as ContentfulStatusCode);
  }

  if (creator.subscription_tier !== "Studio") {
    return c.json(
      { error: "Team management requires the Studio subscription tier" },
      403 as ContentfulStatusCode,
    );
  }

  const body = await c.req.json<{ email: string; role?: string }>();

  if (!body.email) {
    return c.json({ error: "Email is required" }, 400 as ContentfulStatusCode);
  }

  // Check for duplicate invite
  const [existingMember] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(and(eq(teamMembers.creator_id, creatorId), eq(teamMembers.email, body.email)))
    .limit(1);

  if (existingMember) {
    return c.json({ error: "This email has already been invited" }, 409 as ContentfulStatusCode);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(teamMembers).values({
    id,
    creator_id: creatorId,
    email: body.email,
    role: body.role ?? "Member",
    invited_at: now,
    accepted_at: null,
  });

  const [member] = await db.select().from(teamMembers).where(eq(teamMembers.id, id)).limit(1);

  return c.json({ member }, 201 as ContentfulStatusCode);
});

/**
 * DELETE /settings/team/:id — Remove a team member.
 */
settingsRoutes.delete("/team/:id", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const memberId = c.req.param("id");

  // Verify the member belongs to this creator
  const [member] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(and(eq(teamMembers.id, memberId), eq(teamMembers.creator_id, creatorId)))
    .limit(1);

  if (!member) {
    return c.json({ error: "Team member not found" }, 404 as ContentfulStatusCode);
  }

  await db.delete(teamMembers).where(eq(teamMembers.id, memberId));

  return c.json({ deleted: true });
});

// ---------------------------------------------------------------------------
// WordPress Connection
// ---------------------------------------------------------------------------

/**
 * GET /settings/wordpress — Get WordPress connection status.
 */
settingsRoutes.get("/wordpress", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);

  const [creator] = await db
    .select({
      wordpress_site_url: creators.wordpress_site_url,
      wordpress_plugin: creators.wordpress_plugin,
      wordpress_connected_at: creators.wordpress_connected_at,
    })
    .from(creators)
    .where(eq(creators.id, creatorId))
    .limit(1);

  if (!creator) {
    return c.json({ error: "Creator not found" }, 404 as ContentfulStatusCode);
  }

  const connected = creator.wordpress_site_url !== null && creator.wordpress_connected_at !== null;

  return c.json({
    connected,
    site_url: creator.wordpress_site_url,
    plugin: creator.wordpress_plugin,
    connected_at: creator.wordpress_connected_at,
  });
});

/**
 * POST /settings/wordpress — Connect or update WordPress settings.
 */
settingsRoutes.post("/wordpress", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const now = new Date().toISOString();

  const body = await c.req.json<{
    site_url: string;
    api_key: string;
    plugin?: string;
  }>();

  if (!body.site_url || !body.api_key) {
    return c.json(
      { error: "Site URL and application password are required" },
      400 as ContentfulStatusCode,
    );
  }

  await db
    .update(creators)
    .set({
      wordpress_site_url: body.site_url,
      wordpress_api_key: body.api_key,
      wordpress_plugin: body.plugin ?? "WpRecipeMaker",
      wordpress_connected_at: now,
      updated_at: now,
    })
    .where(eq(creators.id, creatorId));

  return c.json({
    connected: true,
    site_url: body.site_url,
    plugin: body.plugin ?? "WpRecipeMaker",
    connected_at: now,
  });
});

/**
 * POST /settings/wordpress/test — Test WordPress connection.
 */
settingsRoutes.post("/wordpress/test", async (c) => {
  const body = await c.req.json<{
    site_url: string;
    api_key: string;
  }>();

  if (!body.site_url || !body.api_key) {
    return c.json(
      { error: "Site URL and application password are required" },
      400 as ContentfulStatusCode,
    );
  }

  // Attempt to reach the WordPress REST API
  try {
    const wpUrl = body.site_url.replace(/\/$/, "");
    const response = await fetch(`${wpUrl}/wp-json/wp/v2/posts?per_page=1`, {
      headers: {
        Authorization: `Basic ${btoa(`admin:${body.api_key}`)}`,
      },
    });

    if (response.ok) {
      return c.json({ success: true, message: "Connection successful" });
    } else {
      return c.json(
        { success: false, message: `WordPress returned HTTP ${response.status}` },
        400 as ContentfulStatusCode,
      );
    }
  } catch {
    return c.json(
      { success: false, message: "Could not reach WordPress site" },
      400 as ContentfulStatusCode,
    );
  }
});

/**
 * POST /settings/wordpress/disconnect — Remove WordPress connection.
 */
settingsRoutes.post("/wordpress/disconnect", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);
  const now = new Date().toISOString();

  await db
    .update(creators)
    .set({
      wordpress_site_url: null,
      wordpress_api_key: null,
      wordpress_plugin: null,
      wordpress_connected_at: null,
      updated_at: now,
    })
    .where(eq(creators.id, creatorId));

  return c.json({ connected: false });
});

/**
 * GET /settings/account — Get creator account info.
 */
settingsRoutes.get("/account", async (c) => {
  const creatorId = c.get("creatorId");
  const db = createDb(c.env.DB);

  const [creator] = await db
    .select({
      id: creators.id,
      email: creators.email,
      name: creators.name,
      subscription_tier: creators.subscription_tier,
      subscription_started_at: creators.subscription_started_at,
      subscription_renews_at: creators.subscription_renews_at,
      kit_connected_at: creators.kit_connected_at,
      wordpress_connected_at: creators.wordpress_connected_at,
      created_at: creators.created_at,
    })
    .from(creators)
    .where(eq(creators.id, creatorId))
    .limit(1);

  if (!creator) {
    return c.json({ error: "Creator not found" }, 404 as ContentfulStatusCode);
  }

  return c.json({ creator });
});

export { settingsRoutes };
