/**
 * Tests for PreviewController state management.
 *
 * Covers mode toggle, nutrition toggle, loading, error states, and reset.
 */
import { describe, it, expect, vi } from "vitest";
import { PreviewController } from "@/components/preview";
import type { ApiClient } from "@/lib/api-client";
import { DISPLAY_MODE } from "@/lib/types";
import type { RecipeId } from "@dough/shared";
import { ok, err } from "@dough/shared";
import { pluginRecipe, brandKit } from "./helpers";

function createMockClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getBaseUrl: () => "https://api.example.com",
    fetchRecipes: vi.fn().mockResolvedValue(ok({ recipes: [], total: 0, page: 1, per_page: 20 })),
    getRecipe: vi.fn().mockResolvedValue(ok(pluginRecipe())),
    getBrandKit: vi.fn().mockResolvedValue(ok(brandKit())),
    ...overrides,
  } as unknown as ApiClient;
}

describe("PreviewController", () => {
  describe("initial state", () => {
    it("has sensible defaults", () => {
      const client = createMockClient();
      const controller = new PreviewController(client, "example.com");
      const state = controller.getState();

      expect(state.recipeId).toBeNull();
      expect(state.recipe).toBeNull();
      expect(state.brand).toBeNull();
      expect(state.displayMode).toBe(DISPLAY_MODE.Standard);
      expect(state.showNutrition).toBe(false);
      expect(state.cardHtml).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.appDomain).toBe("example.com");
    });
  });

  describe("subscribe / notify", () => {
    it("calls listener on state changes", () => {
      const client = createMockClient();
      const controller = new PreviewController(client, "example.com");
      const listener = vi.fn();

      controller.subscribe(listener);
      controller.setDisplayMode(DISPLAY_MODE.Compact);

      // setDisplayMode triggers setState (mode) + rerender -> setState (cardHtml), so 2 calls
      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener.mock.calls[0]?.[0]?.displayMode).toBe(DISPLAY_MODE.Compact);
    });

    it("returns unsubscribe function", () => {
      const client = createMockClient();
      const controller = new PreviewController(client, "example.com");
      const listener = vi.fn();

      const unsubscribe = controller.subscribe(listener);
      unsubscribe();

      controller.setDisplayMode(DISPLAY_MODE.Full);
      expect(listener).not.toHaveBeenCalled();
    });

    it("handles multiple listeners", () => {
      const client = createMockClient();
      const controller = new PreviewController(client, "example.com");
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      controller.subscribe(listener1);
      controller.subscribe(listener2);
      controller.setDisplayMode(DISPLAY_MODE.Full);

      // setDisplayMode triggers 2 notifications (mode + rerender)
      expect(listener1).toHaveBeenCalledTimes(2);
      expect(listener2).toHaveBeenCalledTimes(2);
    });
  });

  describe("loadRecipe", () => {
    it("sets isLoading while fetching", async () => {
      const states: boolean[] = [];
      const client = createMockClient();
      const controller = new PreviewController(client, "example.com");

      controller.subscribe((state) => states.push(state.isLoading));

      await controller.loadRecipe("recipe-1" as RecipeId);

      // Should have been true during loading, then false
      expect(states[0]).toBe(true);
      expect(states[states.length - 1]).toBe(false);
    });

    it("sets recipe and brand on success", async () => {
      const client = createMockClient();
      const controller = new PreviewController(client, "example.com");

      await controller.loadRecipe("recipe-1" as RecipeId);

      const state = controller.getState();
      expect(state.recipe).not.toBeNull();
      expect(state.brand).not.toBeNull();
      expect(state.error).toBeNull();
      expect(state.cardHtml).not.toBeNull();
    });

    it("sets error on recipe fetch failure", async () => {
      const client = createMockClient({
        getRecipe: vi
          .fn()
          .mockResolvedValue(err({ type: "NotFound" as const, message: "Recipe not found" })),
      });
      const controller = new PreviewController(client, "example.com");

      await controller.loadRecipe("nonexistent" as RecipeId);

      const state = controller.getState();
      expect(state.error).toBe("Recipe not found");
      expect(state.recipe).toBeNull();
    });

    it("proceeds with null brand when brand fetch fails", async () => {
      const client = createMockClient({
        getBrandKit: vi
          .fn()
          .mockResolvedValue(err({ type: "NotFound" as const, message: "No brand kit" })),
      });
      const controller = new PreviewController(client, "example.com");

      await controller.loadRecipe("recipe-1" as RecipeId);

      const state = controller.getState();
      expect(state.recipe).not.toBeNull();
      expect(state.brand).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe("setDisplayMode", () => {
    it("sets the display mode", () => {
      const client = createMockClient();
      const controller = new PreviewController(client, "example.com");

      controller.setDisplayMode(DISPLAY_MODE.Compact);
      expect(controller.getState().displayMode).toBe(DISPLAY_MODE.Compact);

      controller.setDisplayMode(DISPLAY_MODE.Full);
      expect(controller.getState().displayMode).toBe(DISPLAY_MODE.Full);
    });
  });

  describe("cycleDisplayMode", () => {
    it("cycles Compact -> Standard -> Full -> Compact", () => {
      const client = createMockClient();
      const controller = new PreviewController(client, "example.com");

      controller.setDisplayMode(DISPLAY_MODE.Compact);
      controller.cycleDisplayMode();
      expect(controller.getState().displayMode).toBe(DISPLAY_MODE.Standard);

      controller.cycleDisplayMode();
      expect(controller.getState().displayMode).toBe(DISPLAY_MODE.Full);

      controller.cycleDisplayMode();
      expect(controller.getState().displayMode).toBe(DISPLAY_MODE.Compact);
    });
  });

  describe("toggleNutrition", () => {
    it("toggles nutrition visibility", () => {
      const client = createMockClient();
      const controller = new PreviewController(client, "example.com");

      expect(controller.getState().showNutrition).toBe(false);

      controller.toggleNutrition();
      expect(controller.getState().showNutrition).toBe(true);

      controller.toggleNutrition();
      expect(controller.getState().showNutrition).toBe(false);
    });
  });

  describe("getRenderOptions", () => {
    it("returns current render options", () => {
      const client = createMockClient();
      const controller = new PreviewController(client, "example.com");

      controller.setDisplayMode(DISPLAY_MODE.Full);
      controller.toggleNutrition();

      const options = controller.getRenderOptions();
      expect(options.displayMode).toBe(DISPLAY_MODE.Full);
      expect(options.showNutrition).toBe(true);
      expect(options.appDomain).toBe("example.com");
    });
  });

  describe("getCardHtml", () => {
    it("returns null when no recipe loaded", () => {
      const client = createMockClient();
      const controller = new PreviewController(client, "example.com");

      expect(controller.getCardHtml()).toBeNull();
    });

    it("returns HTML after loading a recipe", async () => {
      const client = createMockClient();
      const controller = new PreviewController(client, "example.com");

      await controller.loadRecipe("recipe-1" as RecipeId);

      const html = controller.getCardHtml();
      expect(html).not.toBeNull();
      expect(typeof html).toBe("string");
    });
  });

  describe("reset", () => {
    it("resets to initial state", async () => {
      const client = createMockClient();
      const controller = new PreviewController(client, "example.com");

      await controller.loadRecipe("recipe-1" as RecipeId);
      controller.setDisplayMode(DISPLAY_MODE.Full);
      controller.toggleNutrition();

      controller.reset();

      const state = controller.getState();
      expect(state.recipeId).toBeNull();
      expect(state.recipe).toBeNull();
      expect(state.displayMode).toBe(DISPLAY_MODE.Standard);
      expect(state.showNutrition).toBe(false);
      expect(state.cardHtml).toBeNull();
      expect(state.appDomain).toBe("example.com");
    });

    it("notifies listeners on reset", async () => {
      const client = createMockClient();
      const controller = new PreviewController(client, "example.com");
      const listener = vi.fn();

      await controller.loadRecipe("recipe-1" as RecipeId);
      controller.subscribe(listener);

      controller.reset();
      expect(listener).toHaveBeenCalled();
    });
  });
});
