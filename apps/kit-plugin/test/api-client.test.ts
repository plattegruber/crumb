/**
 * Tests for the ApiClient.
 *
 * Mocks fetch to test request formatting, URL construction,
 * authentication, and error handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiClient } from "@/lib/api-client";
import type { RecipeId, CreatorId } from "@dough/shared";
import { DIETARY_TAG } from "@dough/shared";
import { pluginRecipe } from "./helpers";

const BASE_URL = "https://api.example.com";
const AUTH_TOKEN = "test-auth-token";
const CREATOR_ID = "creator-001" as CreatorId;

function createClient(): ApiClient {
  return new ApiClient({
    apiBaseUrl: BASE_URL,
    authToken: AUTH_TOKEN,
    creatorId: CREATOR_ID,
  });
}

// Store original fetch
const originalFetch = globalThis.fetch;

function mockFetchResponse(status: number, body: unknown): void {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function mockFetchError(message: string): void {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error(message));
}

beforeEach(() => {
  // Reset fetch before each test
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("ApiClient — constructor", () => {
  it("strips trailing slashes from base URL", () => {
    const client = new ApiClient({
      apiBaseUrl: "https://api.example.com///",
      authToken: AUTH_TOKEN,
      creatorId: CREATOR_ID,
    });

    expect(client.getBaseUrl()).toBe("https://api.example.com");
  });

  it("preserves base URL without trailing slash", () => {
    const client = createClient();
    expect(client.getBaseUrl()).toBe(BASE_URL);
  });
});

describe("ApiClient — fetchRecipes", () => {
  it("fetches recipes with no query or filters", async () => {
    const searchResponse = {
      recipes: [],
      total: 0,
      page: 1,
      per_page: 20,
    };
    mockFetchResponse(200, searchResponse);

    const client = createClient();
    const result = await client.fetchRecipes();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.total).toBe(0);
    }

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/recipes`,
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: `Bearer ${AUTH_TOKEN}`,
        }),
      }),
    );
  });

  it("includes query parameter", async () => {
    mockFetchResponse(200, { recipes: [], total: 0, page: 1, per_page: 20 });

    const client = createClient();
    await client.fetchRecipes("pasta");

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const url = fetchCall?.[0] as string;
    expect(url).toContain("q=pasta");
  });

  it("includes filter parameters", async () => {
    mockFetchResponse(200, { recipes: [], total: 0, page: 1, per_page: 20 });

    const client = createClient();
    await client.fetchRecipes("", {
      dietary_tags: [DIETARY_TAG.Vegan, DIETARY_TAG.GlutenFree],
      cuisine: "Italian",
      meal_type: "Dinner",
      max_cook_time_minutes: 30,
      status: "Draft",
    });

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const url = fetchCall?.[0] as string;
    expect(url).toContain("dietary_tags=Vegan%2CGlutenFree");
    expect(url).toContain("cuisine=Italian");
    expect(url).toContain("meal_type=Dinner");
    expect(url).toContain("max_cook_time_minutes=30");
    expect(url).toContain("status=Draft");
  });

  it("skips empty filter values", async () => {
    mockFetchResponse(200, { recipes: [], total: 0, page: 1, per_page: 20 });

    const client = createClient();
    await client.fetchRecipes("", {
      dietary_tags: [],
      cuisine: "",
      meal_type: "",
    });

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const url = fetchCall?.[0] as string;
    expect(url).toBe(`${BASE_URL}/recipes`);
  });
});

describe("ApiClient — getRecipe", () => {
  it("fetches a recipe by ID", async () => {
    const recipe = pluginRecipe();
    mockFetchResponse(200, recipe);

    const client = createClient();
    const result = await client.getRecipe("recipe-001" as RecipeId);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe("Lemon Garlic Pasta");
    }

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/recipes/recipe-001`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("returns NotFound error for 404", async () => {
    mockFetchResponse(404, { error: "Not found" });

    const client = createClient();
    const result = await client.getRecipe("nonexistent" as RecipeId);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NotFound");
    }
  });
});

describe("ApiClient — getBrandKit", () => {
  it("fetches the brand kit for the creator", async () => {
    mockFetchResponse(200, { id: "brand-001", name: "My Brand" });

    const client = createClient();
    const result = await client.getBrandKit();

    expect(result.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/creators/${CREATOR_ID}/brand-kit`,
      expect.objectContaining({ method: "GET" }),
    );
  });
});

describe("ApiClient — error handling", () => {
  it("returns AuthError for 401", async () => {
    mockFetchResponse(401, { error: "Unauthorized" });

    const client = createClient();
    const result = await client.fetchRecipes();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("AuthError");
      expect(result.error.message).toContain("401");
    }
  });

  it("returns AuthError for 403", async () => {
    mockFetchResponse(403, { error: "Forbidden" });

    const client = createClient();
    const result = await client.fetchRecipes();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("AuthError");
      expect(result.error.message).toContain("403");
    }
  });

  it("returns ServerError for 500", async () => {
    mockFetchResponse(500, { error: "Internal Server Error" });

    const client = createClient();
    const result = await client.fetchRecipes();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("ServerError");
      expect(result.error).toHaveProperty("status", 500);
    }
  });

  it("returns NetworkError on fetch failure", async () => {
    mockFetchError("Network unreachable");

    const client = createClient();
    const result = await client.fetchRecipes();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
      expect(result.error.message).toBe("Network unreachable");
    }
  });

  it("returns NetworkError for non-Error thrown", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue("string error");

    const client = createClient();
    const result = await client.fetchRecipes();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe("NetworkError");
      expect(result.error.message).toBe("Unknown network error");
    }
  });
});

describe("ApiClient — request headers", () => {
  it("includes Authorization header with Bearer token", async () => {
    mockFetchResponse(200, { recipes: [], total: 0, page: 1, per_page: 20 });

    const client = createClient();
    await client.fetchRecipes();

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const init = fetchCall?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Bearer ${AUTH_TOKEN}`);
  });

  it("includes Content-Type and Accept headers", async () => {
    mockFetchResponse(200, { recipes: [], total: 0, page: 1, per_page: 20 });

    const client = createClient();
    await client.fetchRecipes();

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const init = fetchCall?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Accept"]).toBe("application/json");
  });
});
