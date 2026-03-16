/**
 * Kit Plugin entry point.
 *
 * Exposes the DoughPlugin global object that Kit loads inside its email editor.
 * The plugin is built as a single IIFE file via Vite library mode.
 */

import type { RecipeId } from "@dough/shared";
import { ApiClient } from "@/lib/api-client";
import { renderCard } from "@/lib/card-renderer";
import type {
  BrandKit,
  CardRenderOptions,
  PluginConfig,
  RecipeSearchFilters,
  SearchResponse,
} from "@/lib/types";
import { DISPLAY_MODE } from "@/lib/types";
import type { Result } from "@dough/shared";
import type { ApiError } from "@/lib/api-client";

export interface DoughPluginInterface {
  /**
   * Initialize the plugin with API base URL, auth token, and creator ID.
   * Must be called before any other method.
   */
  init(config: PluginConfig): void;

  /**
   * Render a recipe card as email-safe HTML.
   *
   * @param recipeId - The ID of the recipe to render
   * @param options - Display mode, nutrition toggle, app domain
   * @returns Promise resolving to a Result containing the HTML string
   */
  renderCard(recipeId: RecipeId, options: CardRenderOptions): Promise<Result<string, ApiError>>;

  /**
   * Search the creator's recipe library.
   *
   * @param query - Optional search text
   * @param filters - Optional search filters
   * @returns Promise resolving to a Result containing search results
   */
  searchRecipes(
    query?: string,
    filters?: RecipeSearchFilters,
  ): Promise<Result<SearchResponse, ApiError>>;

  /**
   * The available display modes.
   */
  readonly DisplayMode: typeof DISPLAY_MODE;
}

function createPlugin(): DoughPluginInterface {
  let client: ApiClient | null = null;
  let cachedBrand: BrandKit | null = null;
  let brandFetched = false;

  function requireClient(): ApiClient {
    if (client === null) {
      throw new Error("[dough] Plugin not initialized. Call DoughPlugin.init() first.");
    }
    return client;
  }

  return {
    DisplayMode: DISPLAY_MODE,

    init(config: PluginConfig): void {
      client = new ApiClient(config);
      cachedBrand = null;
      brandFetched = false;
    },

    async renderCard(
      recipeId: RecipeId,
      options: CardRenderOptions,
    ): Promise<Result<string, ApiError>> {
      const c = requireClient();

      const recipeResult = await c.getRecipe(recipeId);
      if (!recipeResult.ok) {
        return recipeResult;
      }

      // Fetch brand kit if not already cached
      if (!brandFetched) {
        const brandResult = await c.getBrandKit();
        if (brandResult.ok) {
          cachedBrand = brandResult.value;
        }
        brandFetched = true;
      }

      const html = renderCard(recipeResult.value, options, cachedBrand);
      return { ok: true, value: html };
    },

    async searchRecipes(
      query?: string,
      filters?: RecipeSearchFilters,
    ): Promise<Result<SearchResponse, ApiError>> {
      const c = requireClient();
      return c.fetchRecipes(query, filters);
    },
  };
}

export const DoughPlugin: DoughPluginInterface = createPlugin();
