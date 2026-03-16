/**
 * Recipe search/filter logic for the Kit plugin.
 *
 * Manages search state and delegates to the API client for fetching results.
 * This is plain TypeScript — no framework dependency — since the plugin
 * runs inside Kit's editor as a standalone bundle.
 */

import type { DietaryTag, RecipeId } from "@dough/shared";
import type { ApiClient } from "@/lib/api-client";
import type { RecipeSearchFilters, RecipeSummary, SearchResponse } from "@/lib/types";

export interface SearchState {
  readonly query: string;
  readonly filters: RecipeSearchFilters;
  readonly results: readonly RecipeSummary[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly selectedRecipeId: RecipeId | null;
}

function createInitialState(): SearchState {
  return {
    query: "",
    filters: {},
    results: [],
    total: 0,
    page: 1,
    perPage: 20,
    isLoading: false,
    error: null,
    selectedRecipeId: null,
  };
}

export type SearchListener = (state: SearchState) => void;

/**
 * Search controller that manages query state and API communication.
 * Uses a simple listener pattern for state change notifications.
 */
export class SearchController {
  private state: SearchState;
  private readonly client: ApiClient;
  private readonly listeners: SearchListener[] = [];

  constructor(client: ApiClient) {
    this.client = client;
    this.state = createInitialState();
  }

  getState(): SearchState {
    return this.state;
  }

  subscribe(listener: SearchListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private setState(partial: Partial<SearchState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  /**
   * Update the search query and fetch results.
   */
  async search(query: string): Promise<void> {
    this.setState({ query, isLoading: true, error: null });

    const result = await this.client.fetchRecipes(query, this.state.filters);

    if (result.ok) {
      const response: SearchResponse = result.value;
      this.setState({
        results: response.recipes,
        total: response.total,
        page: response.page,
        perPage: response.per_page,
        isLoading: false,
      });
    } else {
      this.setState({
        results: [],
        total: 0,
        isLoading: false,
        error: result.error.message,
      });
    }
  }

  /**
   * Update filters and re-fetch results.
   */
  async setFilters(filters: RecipeSearchFilters): Promise<void> {
    this.setState({ filters, isLoading: true, error: null });

    const result = await this.client.fetchRecipes(this.state.query, filters);

    if (result.ok) {
      const response: SearchResponse = result.value;
      this.setState({
        results: response.recipes,
        total: response.total,
        page: response.page,
        perPage: response.per_page,
        isLoading: false,
      });
    } else {
      this.setState({
        results: [],
        total: 0,
        isLoading: false,
        error: result.error.message,
      });
    }
  }

  /**
   * Set a dietary tag filter.
   */
  async filterByDietaryTag(tag: DietaryTag): Promise<void> {
    const currentTags = this.state.filters.dietary_tags ?? [];
    const newTags = currentTags.includes(tag)
      ? currentTags.filter((t) => t !== tag)
      : [...currentTags, tag];

    await this.setFilters({
      ...this.state.filters,
      dietary_tags: newTags,
    });
  }

  /**
   * Select a recipe from the search results.
   */
  selectRecipe(recipeId: RecipeId): void {
    this.setState({ selectedRecipeId: recipeId });
  }

  /**
   * Clear the current selection.
   */
  clearSelection(): void {
    this.setState({ selectedRecipeId: null });
  }

  /**
   * Reset all search state.
   */
  reset(): void {
    this.state = createInitialState();
    this.notify();
  }
}
