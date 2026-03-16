/**
 * API client for communicating with the Crumb API from within the Kit editor.
 *
 * Handles authentication, request formatting, and response parsing
 * for all plugin-to-API communication.
 */

import type { Result } from "@crumb/shared";
import { ok, err } from "@crumb/shared";
import type { RecipeId } from "@crumb/shared";
import type {
  BrandKit,
  PluginConfig,
  PluginRecipe,
  RecipeSearchFilters,
  SearchResponse,
} from "@/lib/types";

export type ApiError =
  | { readonly type: "NetworkError"; readonly message: string }
  | { readonly type: "AuthError"; readonly message: string }
  | { readonly type: "NotFound"; readonly message: string }
  | { readonly type: "ServerError"; readonly status: number; readonly message: string };

export class ApiClient {
  private readonly baseUrl: string;
  private readonly authToken: string;
  private readonly creatorId: string;

  constructor(config: PluginConfig) {
    // Strip trailing slash from base URL
    this.baseUrl = config.apiBaseUrl.replace(/\/+$/, "");
    this.authToken = config.authToken;
    this.creatorId = config.creatorId;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Search the creator's recipe library.
   */
  async fetchRecipes(
    query?: string,
    filters?: RecipeSearchFilters,
  ): Promise<Result<SearchResponse, ApiError>> {
    const params = new URLSearchParams();

    if (query !== undefined && query !== "") {
      params.set("q", query);
    }

    if (filters !== undefined) {
      if (filters.dietary_tags !== undefined && filters.dietary_tags.length > 0) {
        params.set("dietary_tags", filters.dietary_tags.join(","));
      }
      if (filters.cuisine !== undefined && filters.cuisine !== "") {
        params.set("cuisine", filters.cuisine);
      }
      if (filters.meal_type !== undefined && filters.meal_type !== "") {
        params.set("meal_type", filters.meal_type);
      }
      if (filters.max_cook_time_minutes !== undefined) {
        params.set("max_cook_time_minutes", String(filters.max_cook_time_minutes));
      }
      if (filters.status !== undefined && filters.status !== "") {
        params.set("status", filters.status);
      }
    }

    const queryString = params.toString();
    const url = `${this.baseUrl}/recipes${queryString ? `?${queryString}` : ""}`;

    return this.request<SearchResponse>(url);
  }

  /**
   * Get a single recipe with all data needed for card rendering.
   */
  async getRecipe(id: RecipeId): Promise<Result<PluginRecipe, ApiError>> {
    const url = `${this.baseUrl}/recipes/${id}`;
    return this.request<PluginRecipe>(url);
  }

  /**
   * Get the creator's brand kit for styling recipe cards.
   */
  async getBrandKit(): Promise<Result<BrandKit, ApiError>> {
    const url = `${this.baseUrl}/creators/${this.creatorId}/brand-kit`;
    return this.request<BrandKit>(url);
  }

  /**
   * Internal request helper with error handling.
   */
  private async request<T>(url: string): Promise<Result<T, ApiError>> {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.authToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return err({
            type: "AuthError" as const,
            message: `Authentication failed (${response.status})`,
          });
        }
        if (response.status === 404) {
          return err({
            type: "NotFound" as const,
            message: "Resource not found",
          });
        }
        return err({
          type: "ServerError" as const,
          status: response.status,
          message: `Server error (${response.status})`,
        });
      }

      const data = (await response.json()) as T;
      return ok(data);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown network error";
      return err({ type: "NetworkError" as const, message });
    }
  }
}
