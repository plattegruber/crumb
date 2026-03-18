/**
 * Tests for team member access middleware.
 *
 * Covers team access check, forbidden actions, stub lookup, and middleware guard.
 */
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { CreatorId } from "../../src/types/auth.js";
import type { TeamMemberAccess } from "../../src/types/auth.js";
import { TeamMemberRole } from "../../src/types/auth.js";
import {
  checkTeamAccess,
  isForbiddenForTeamMember,
  validateTeamAction,
  stubTeamMemberLookup,
  teamAccessGuard,
  type TeamMemberLookup,
} from "../../src/middleware/team.js";
import { clerkAuth } from "../../src/middleware/auth.js";
import type { AppEnv } from "../../src/middleware/auth.js";
import type { Env } from "../../src/env.js";

const OWNER_ID = "owner-1" as CreatorId;
const MEMBER_ID = "member-1" as CreatorId;
const STRANGER_ID = "stranger-1" as CreatorId;

const mockAccess: TeamMemberAccess = {
  memberId: MEMBER_ID,
  ownerId: OWNER_ID,
  role: TeamMemberRole.EDITOR,
};

// ---------------------------------------------------------------------------
// stubTeamMemberLookup
// ---------------------------------------------------------------------------

describe("stubTeamMemberLookup", () => {
  it("always returns null", async () => {
    const result = await stubTeamMemberLookup.findAccess(MEMBER_ID, OWNER_ID);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkTeamAccess
// ---------------------------------------------------------------------------

describe("checkTeamAccess", () => {
  it("grants access when member is the owner", async () => {
    const result = await checkTeamAccess(stubTeamMemberLookup, OWNER_ID, OWNER_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it("returns error when no team membership found", async () => {
    const result = await checkTeamAccess(stubTeamMemberLookup, STRANGER_ID, OWNER_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("not_a_team_member");
    }
  });

  it("returns access when membership exists", async () => {
    const lookup: TeamMemberLookup = {
      findAccess: async (_memberId: CreatorId, _ownerId: CreatorId) => mockAccess,
    };

    const result = await checkTeamAccess(lookup, MEMBER_ID, OWNER_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(mockAccess);
    }
  });
});

// ---------------------------------------------------------------------------
// isForbiddenForTeamMember
// ---------------------------------------------------------------------------

describe("isForbiddenForTeamMember", () => {
  it("returns true for disconnect_kit", () => {
    expect(isForbiddenForTeamMember("disconnect_kit")).toBe(true);
  });

  it("returns true for change_billing", () => {
    expect(isForbiddenForTeamMember("change_billing")).toBe(true);
  });

  it("returns true for delete_account", () => {
    expect(isForbiddenForTeamMember("delete_account")).toBe(true);
  });

  it("returns false for allowed actions", () => {
    expect(isForbiddenForTeamMember("edit_recipe")).toBe(false);
    expect(isForbiddenForTeamMember("view_analytics")).toBe(false);
    expect(isForbiddenForTeamMember("create_product")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateTeamAction
// ---------------------------------------------------------------------------

describe("validateTeamAction", () => {
  it("returns error for forbidden actions", () => {
    const result = validateTeamAction(mockAccess, "disconnect_kit");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("forbidden_action");
    }
  });

  it("returns ok for allowed actions", () => {
    const result = validateTeamAction(mockAccess, "edit_recipe");
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// teamAccessGuard middleware
// ---------------------------------------------------------------------------

describe("teamAccessGuard middleware", () => {
  async function fakeVerify(token: string, _env: Env): Promise<string | null> {
    if (token === "owner-token") return OWNER_ID;
    if (token === "member-token") return MEMBER_ID;
    if (token === "stranger-token") return STRANGER_ID;
    return null;
  }

  it("passes through when no :creatorId param in route", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", clerkAuth({ verifyFn: fakeVerify }));
    app.use("*", teamAccessGuard());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.fetch(
      new Request("http://localhost/test", {
        headers: { Authorization: "Bearer owner-token" },
      }),
      {
        DB: {} as D1Database,
        STORAGE: {} as R2Bucket,
        CACHE: {} as KVNamespace,
        IMPORT_QUEUE: {} as Queue,
        RENDER_QUEUE: {} as Queue,
        CLERK_PUBLISHABLE_KEY: "pk_test",
        CLERK_SECRET_KEY: "sk_test",
        LOG_LEVEL: "info",
      } as Env,
    );

    expect(res.status).toBe(200);
  });

  it("returns 403 when stranger accesses another creator's resources", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", clerkAuth({ verifyFn: fakeVerify }));
    app.use("/creators/:creatorId/*", teamAccessGuard());
    app.get("/creators/:creatorId/recipes", (c) => c.json({ ok: true }));

    const res = await app.fetch(
      new Request(`http://localhost/creators/${OWNER_ID}/recipes`, {
        headers: { Authorization: "Bearer stranger-token" },
      }),
      {
        DB: {} as D1Database,
        STORAGE: {} as R2Bucket,
        CACHE: {} as KVNamespace,
        IMPORT_QUEUE: {} as Queue,
        RENDER_QUEUE: {} as Queue,
        CLERK_PUBLISHABLE_KEY: "pk_test",
        CLERK_SECRET_KEY: "sk_test",
        LOG_LEVEL: "info",
      } as Env,
    );

    expect(res.status).toBe(403);
  });

  it("allows owner to access own resources", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", clerkAuth({ verifyFn: fakeVerify }));
    app.use("/creators/:creatorId/*", teamAccessGuard());
    app.get("/creators/:creatorId/recipes", (c) => c.json({ ok: true }));

    const res = await app.fetch(
      new Request(`http://localhost/creators/${OWNER_ID}/recipes`, {
        headers: { Authorization: "Bearer owner-token" },
      }),
      {
        DB: {} as D1Database,
        STORAGE: {} as R2Bucket,
        CACHE: {} as KVNamespace,
        IMPORT_QUEUE: {} as Queue,
        RENDER_QUEUE: {} as Queue,
        CLERK_PUBLISHABLE_KEY: "pk_test",
        CLERK_SECRET_KEY: "sk_test",
        LOG_LEVEL: "info",
      } as Env,
    );

    expect(res.status).toBe(200);
  });

  it("allows team member when lookup returns access", async () => {
    const lookup: TeamMemberLookup = {
      findAccess: async (memberId: CreatorId, ownerId: CreatorId) => {
        if (memberId === MEMBER_ID && ownerId === OWNER_ID) {
          return mockAccess;
        }
        return null;
      },
    };

    const app = new Hono<AppEnv>();
    app.use("*", clerkAuth({ verifyFn: fakeVerify }));
    app.use("/creators/:creatorId/*", teamAccessGuard(lookup));
    app.get("/creators/:creatorId/recipes", (c) => c.json({ ok: true }));

    const res = await app.fetch(
      new Request(`http://localhost/creators/${OWNER_ID}/recipes`, {
        headers: { Authorization: "Bearer member-token" },
      }),
      {
        DB: {} as D1Database,
        STORAGE: {} as R2Bucket,
        CACHE: {} as KVNamespace,
        IMPORT_QUEUE: {} as Queue,
        RENDER_QUEUE: {} as Queue,
        CLERK_PUBLISHABLE_KEY: "pk_test",
        CLERK_SECRET_KEY: "sk_test",
        LOG_LEVEL: "info",
      } as Env,
    );

    expect(res.status).toBe(200);
  });
});
