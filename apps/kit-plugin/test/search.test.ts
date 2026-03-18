/**
 * Tests for SearchController state management.
 *
 * Covers search, filter, select, reset, and error handling.
 */
import { describe, it, expect, vi } from "vitest";
import { SearchController } from "@/components/search";
import type { ApiClient } from "@/lib/api-client";
import type { RecipeId, DietaryTag } from "@dough/shared";
import { ok, err, DIETARY_TAG } from "@dough/shared";
import type { SearchResponse, RecipeSummary } from "@/lib/types";
import { pluginRecipe } from "./helpers";

function createMockRecipeSummary(id: string, title: string): RecipeSummary {
  const recipe = pluginRecipe({ id: id as RecipeId, title });
  return {
    id: recipe.id,
    title: recipe.title,
    slug: recipe.slug,
    description: recipe.description,
    primary_photo: recipe.photos[0] ?? null,
    timing: recipe.timing,
    yield: recipe.yield,
    classification: recipe.classification,
  };
}

function createMockSearchResponse(count = 2): SearchResponse {
  const recipes = Array.from({ length: count }, (_, i) =>
    createMockRecipeSummary(`recipe-${i + 1}`, `Recipe ${i + 1}`),
  );
  return {
    recipes,
    total: count,
    page: 1,
    per_page: 20,
  };
}

function createMockClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getBaseUrl: () => "https://api.example.com",
    fetchRecipes: vi.fn().mockResolvedValue(ok(createMockSearchResponse())),
    getRecipe: vi.fn().mockResolvedValue(ok(pluginRecipe())),
    getBrandKit: vi.fn().mockResolvedValue(ok({})),
    ...overrides,
  } as unknown as ApiClient;
}

describe("SearchController", () => {
  describe("initial state", () => {
    it("has empty defaults", () => {
      const client = createMockClient();
      const controller = new SearchController(client);
      const state = controller.getState();

      expect(state.query).toBe("");
      expect(state.filters).toEqual({});
      expect(state.results).toEqual([]);
      expect(state.total).toBe(0);
      expect(state.page).toBe(1);
      expect(state.perPage).toBe(20);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.selectedRecipeId).toBeNull();
    });
  });

  describe("subscribe / unsubscribe", () => {
    it("calls listener on state changes", () => {
      const client = createMockClient();
      const controller = new SearchController(client);
      const listener = vi.fn();

      controller.subscribe(listener);
      controller.selectRecipe("recipe-1" as RecipeId);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("stops calling listener after unsubscribe", () => {
      const client = createMockClient();
      const controller = new SearchController(client);
      const listener = vi.fn();

      const unsubscribe = controller.subscribe(listener);
      unsubscribe();

      controller.selectRecipe("recipe-1" as RecipeId);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("search", () => {
    it("fetches results and updates state", async () => {
      const client = createMockClient();
      const controller = new SearchController(client);

      await controller.search("pasta");

      const state = controller.getState();
      expect(state.query).toBe("pasta");
      expect(state.results).toHaveLength(2);
      expect(state.total).toBe(2);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it("sets isLoading during fetch", async () => {
      const loadingStates: boolean[] = [];
      const client = createMockClient();
      const controller = new SearchController(client);

      controller.subscribe((state) => loadingStates.push(state.isLoading));

      await controller.search("test");

      expect(loadingStates[0]).toBe(true);
      expect(loadingStates[loadingStates.length - 1]).toBe(false);
    });

    it("handles errors", async () => {
      const client = createMockClient({
        fetchRecipes: vi
          .fn()
          .mockResolvedValue(err({ type: "NetworkError" as const, message: "Failed to fetch" })),
      });
      const controller = new SearchController(client);

      await controller.search("test");

      const state = controller.getState();
      expect(state.error).toBe("Failed to fetch");
      expect(state.results).toEqual([]);
      expect(state.total).toBe(0);
    });
  });

  describe("setFilters", () => {
    it("updates filters and re-fetches", async () => {
      const client = createMockClient();
      const controller = new SearchController(client);

      await controller.setFilters({ cuisine: "Italian" });

      const state = controller.getState();
      expect(state.filters).toEqual({ cuisine: "Italian" });
      expect(client.fetchRecipes).toHaveBeenCalled();
    });

    it("handles error on filter change", async () => {
      const client = createMockClient({
        fetchRecipes: vi
          .fn()
          .mockResolvedValue(err({ type: "ServerError" as const, status: 500, message: "Error" })),
      });
      const controller = new SearchController(client);

      await controller.setFilters({ status: "Draft" });

      const state = controller.getState();
      expect(state.error).toBe("Error");
      expect(state.results).toEqual([]);
    });
  });

  describe("filterByDietaryTag", () => {
    it("adds a dietary tag filter", async () => {
      const client = createMockClient();
      const controller = new SearchController(client);

      await controller.filterByDietaryTag(DIETARY_TAG.Vegan as DietaryTag);

      const state = controller.getState();
      expect(state.filters.dietary_tags).toContain(DIETARY_TAG.Vegan);
    });

    it("removes a dietary tag filter when toggled again", async () => {
      const client = createMockClient();
      const controller = new SearchController(client);

      await controller.filterByDietaryTag(DIETARY_TAG.Vegan as DietaryTag);
      await controller.filterByDietaryTag(DIETARY_TAG.Vegan as DietaryTag);

      const state = controller.getState();
      expect(state.filters.dietary_tags).not.toContain(DIETARY_TAG.Vegan);
    });

    it("preserves other tags when toggling", async () => {
      const client = createMockClient();
      const controller = new SearchController(client);

      await controller.filterByDietaryTag(DIETARY_TAG.Vegan as DietaryTag);
      await controller.filterByDietaryTag(DIETARY_TAG.GlutenFree as DietaryTag);

      const state = controller.getState();
      expect(state.filters.dietary_tags).toContain(DIETARY_TAG.Vegan);
      expect(state.filters.dietary_tags).toContain(DIETARY_TAG.GlutenFree);
    });
  });

  describe("selectRecipe / clearSelection", () => {
    it("selects a recipe", () => {
      const client = createMockClient();
      const controller = new SearchController(client);

      controller.selectRecipe("recipe-1" as RecipeId);
      expect(controller.getState().selectedRecipeId).toBe("recipe-1");
    });

    it("clears selection", () => {
      const client = createMockClient();
      const controller = new SearchController(client);

      controller.selectRecipe("recipe-1" as RecipeId);
      controller.clearSelection();

      expect(controller.getState().selectedRecipeId).toBeNull();
    });
  });

  describe("reset", () => {
    it("resets all state to defaults", async () => {
      const client = createMockClient();
      const controller = new SearchController(client);

      await controller.search("pasta");
      controller.selectRecipe("recipe-1" as RecipeId);

      controller.reset();

      const state = controller.getState();
      expect(state.query).toBe("");
      expect(state.filters).toEqual({});
      expect(state.results).toEqual([]);
      expect(state.total).toBe(0);
      expect(state.selectedRecipeId).toBeNull();
    });

    it("notifies listeners on reset", () => {
      const client = createMockClient();
      const controller = new SearchController(client);
      const listener = vi.fn();

      controller.subscribe(listener);
      controller.reset();

      expect(listener).toHaveBeenCalled();
    });
  });
});
