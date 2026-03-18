/**
 * Typed API client for the dough backend.
 *
 * All methods return the parsed JSON response. Errors are thrown
 * as ApiError instances so callers can handle them uniformly.
 */
import { getSessionToken } from "./clerk.js";
import type {
  Recipe,
  RecipeId,
  Collection,
  CollectionId,
  ImportJob,
  ImportJobId,
  Product,
  ProductId,
  RecipeEngagementScore,
  RecipeStatus,
  DietaryTag,
  MealType,
  Season,
} from "@dough/shared";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

let apiBaseUrl = "";

export function setApiBaseUrl(url: string): void {
  apiBaseUrl = url.replace(/\/$/, "");
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API error ${status}`);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getSessionToken();

  if (!token && !apiBaseUrl) {
    throw new ApiError(401, { error: "Not authenticated" });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const fullUrl = `${apiBaseUrl}${path}`;
  console.log("[dough] apiFetch:", {
    url: fullUrl,
    method: options.method ?? "GET",
    hasToken: !!token,
    apiBaseUrl,
  });

  const res = await fetch(fullUrl, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    throw new ApiError(res.status, body);
  }

  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Recipe API response types
// ---------------------------------------------------------------------------

export interface RecipeListResponse {
  recipes: Recipe[];
  total: number;
  page: number;
  per_page: number;
}

export interface ListRecipesParams {
  q?: string;
  status?: RecipeStatus;
  email_ready?: boolean;
  cuisine?: string;
  meal_type?: MealType;
  season?: Season;
  max_cook_time_minutes?: number;
  collection_id?: string;
  dietary_tags?: DietaryTag[];
  sort?: "title" | "created_at" | "updated_at" | "engagement_score";
  order?: "asc" | "desc";
  page?: number;
  per_page?: number;
}

// ---------------------------------------------------------------------------
// Recipe endpoints
// ---------------------------------------------------------------------------

export const recipes = {
  async list(params: ListRecipesParams = {}): Promise<RecipeListResponse> {
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (key === "dietary_tags" && Array.isArray(value)) {
        searchParams.set("dietary_tags", value.join(","));
      } else {
        searchParams.set(key, String(value));
      }
    }

    const qs = searchParams.toString();
    const path = qs ? `/recipes?${qs}` : "/recipes";
    return apiFetch<RecipeListResponse>(path);
  },

  async get(id: RecipeId | string): Promise<Recipe> {
    return apiFetch<Recipe>(`/recipes/${id}`);
  },

  async create(input: Record<string, unknown>): Promise<Recipe> {
    return apiFetch<Recipe>("/recipes", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async update(id: RecipeId | string, input: Record<string, unknown>): Promise<Recipe> {
    return apiFetch<Recipe>(`/recipes/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },

  async delete(id: RecipeId | string): Promise<void> {
    await apiFetch<unknown>(`/recipes/${id}`, { method: "DELETE" });
  },
};

// ---------------------------------------------------------------------------
// Collection endpoints
// ---------------------------------------------------------------------------

export interface CollectionListResponse {
  collections: Collection[];
}

export const collections = {
  async list(): Promise<Collection[]> {
    const res = await apiFetch<CollectionListResponse | Collection[]>("/collections");
    return Array.isArray(res) ? res : res.collections;
  },

  async get(id: CollectionId | string): Promise<Collection> {
    return apiFetch<Collection>(`/collections/${id}`);
  },

  async create(input: { name: string; description?: string | null }): Promise<Collection> {
    return apiFetch<Collection>("/collections", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async update(
    id: CollectionId | string,
    input: { name?: string; description?: string | null },
  ): Promise<Collection> {
    return apiFetch<Collection>(`/collections/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },

  async delete(id: CollectionId | string): Promise<void> {
    await apiFetch<unknown>(`/collections/${id}`, { method: "DELETE" });
  },

  async addRecipe(collectionId: CollectionId | string, recipeId: RecipeId | string): Promise<void> {
    await apiFetch<unknown>(`/collections/${collectionId}/recipes`, {
      method: "POST",
      body: JSON.stringify({ recipeId }),
    });
  },

  async removeRecipe(
    collectionId: CollectionId | string,
    recipeId: RecipeId | string,
  ): Promise<void> {
    await apiFetch<unknown>(`/collections/${collectionId}/recipes/${recipeId}`, {
      method: "DELETE",
    });
  },
};

// ---------------------------------------------------------------------------
// Import endpoints
// ---------------------------------------------------------------------------

export interface ImportListResponse {
  jobs: ImportJob[];
}

export const imports = {
  async list(limit = 50, offset = 0): Promise<ImportJob[]> {
    const res = await apiFetch<ImportListResponse>(`/imports?limit=${limit}&offset=${offset}`);
    return res.jobs;
  },

  async get(id: ImportJobId | string): Promise<ImportJob> {
    return apiFetch<ImportJob>(`/imports/${id}`);
  },

  async create(sourceType: string, sourceData: Record<string, unknown>): Promise<ImportJob> {
    return apiFetch<ImportJob>("/imports", {
      method: "POST",
      body: JSON.stringify({ source_type: sourceType, source_data: sourceData }),
    });
  },

  async createFromText(text: string): Promise<ImportJob> {
    return apiFetch<ImportJob>("/imports", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  },

  async confirm(id: ImportJobId | string): Promise<ImportJob> {
    return apiFetch<ImportJob>(`/imports/${id}/confirm`, { method: "POST" });
  },

  async reject(id: ImportJobId | string): Promise<void> {
    await apiFetch<unknown>(`/imports/${id}/reject`, { method: "POST" });
  },
};

// ---------------------------------------------------------------------------
// Analytics endpoints
// ---------------------------------------------------------------------------

export interface EngagementScoresResponse {
  scores: RecipeEngagementScore[];
}

export interface ProductRecommendation {
  dietaryTag: string;
  subscriberCount: number;
  engagementRate: number;
  recipeCount: number;
  avgScore: number;
  message: string;
}

export interface RecommendationsResponse {
  recommendations: ProductRecommendation[];
}

export const analytics = {
  async getEngagementScores(): Promise<RecipeEngagementScore[]> {
    const res = await apiFetch<EngagementScoresResponse>("/analytics/engagement-scores");
    return res.scores;
  },

  async getRecipeScore(recipeId: RecipeId | string): Promise<RecipeEngagementScore | null> {
    try {
      const res = await apiFetch<{ score: RecipeEngagementScore }>(
        `/analytics/engagement-scores/${recipeId}`,
      );
      return res.score;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        return null;
      }
      throw e;
    }
  },

  async computeScores(): Promise<RecipeEngagementScore[]> {
    const res = await apiFetch<{ scores: RecipeEngagementScore[] }>("/analytics/compute-scores", {
      method: "POST",
    });
    return res.scores;
  },

  async getRecommendations(): Promise<ProductRecommendation[]> {
    const res = await apiFetch<RecommendationsResponse>("/analytics/recommendations");
    return res.recommendations;
  },
};

// ---------------------------------------------------------------------------
// Segmentation endpoints
// ---------------------------------------------------------------------------

export interface SegmentData {
  subscriber_count: number;
  engagement_rate: number;
  growth_rate_30d: number;
  top_recipe_ids: readonly string[];
}

export interface SegmentProfileData {
  creator_id: string;
  computed_at: string;
  segments: Record<string, SegmentData>;
}

export interface SegmentProfileResponse {
  profile: SegmentProfileData | null;
}

export const segmentation = {
  async getProfile(): Promise<SegmentProfileData | null> {
    const res = await apiFetch<SegmentProfileResponse>("/segments");
    return res.profile;
  },

  async computeProfile(): Promise<SegmentProfileData> {
    const res = await apiFetch<{ profile: SegmentProfileData }>("/segments/compute", {
      method: "POST",
    });
    return res.profile;
  },

  async inferDietaryTags(recipeId: RecipeId | string): Promise<unknown> {
    return apiFetch<unknown>(`/recipes/${recipeId}/dietary-tags/infer`, {
      method: "POST",
    });
  },

  async confirmDietaryTags(recipeId: RecipeId | string, tags: DietaryTag[]): Promise<unknown> {
    return apiFetch<unknown>(`/recipes/${recipeId}/dietary-tags/confirm`, {
      method: "PUT",
      body: JSON.stringify({ tags }),
    });
  },
};

// ---------------------------------------------------------------------------
// Automation endpoints
// ---------------------------------------------------------------------------

export interface SeasonalDrop {
  id: string;
  creator_id: string;
  label: string;
  start_date: string;
  end_date: string;
  collection_id: string;
  target_segment: string | null;
  recurrence: string;
  last_processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationConfig {
  creator_id: string;
  save_recipe_sequence_id: string | null;
  sends_this_month: number;
  sends_month_reset_at: string | null;
}

export const automation = {
  async getSeasonalDrops(): Promise<SeasonalDrop[]> {
    const res = await apiFetch<{ drops: SeasonalDrop[] }>("/automation/seasonal-drops");
    return res.drops;
  },

  async createSeasonalDrop(input: Record<string, unknown>): Promise<SeasonalDrop> {
    return apiFetch<SeasonalDrop>("/automation/seasonal-drops", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async deleteSeasonalDrop(id: string): Promise<void> {
    await apiFetch<unknown>(`/automation/seasonal-drops/${id}`, {
      method: "DELETE",
    });
  },

  async getConfig(): Promise<AutomationConfig | null> {
    try {
      return await apiFetch<AutomationConfig>("/automation/config");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        return null;
      }
      throw e;
    }
  },

  async createBroadcastDraft(recipeId: RecipeId | string): Promise<unknown> {
    return apiFetch<unknown>(`/automation/broadcast-draft/${recipeId}`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
};

// ---------------------------------------------------------------------------
// Products endpoints
// ---------------------------------------------------------------------------

export interface CreateEbookInput {
  title: string;
  description: string | null;
  brand_kit_id: string;
  template_id: string;
  recipe_ids: string[];
  chapters: { title: string; intro_copy: string | null; recipe_ids: string[] }[];
  intro_copy: string | null;
  author_bio: string | null;
  format: string;
  suggested_price_cents: number | null;
}

export interface MealPlanDayInput {
  day_number: number;
  breakfast: string | null;
  lunch: string | null;
  dinner: string | null;
  snacks: string[];
}

export interface CreateMealPlanInput {
  title: string;
  description: string | null;
  brand_kit_id: string;
  template_id: string;
  days: MealPlanDayInput[];
  suggested_price_cents: number | null;
}

export const products = {
  async list(): Promise<Product[]> {
    try {
      const res = await apiFetch<{ products: Product[] } | Product[]>("/products");
      return Array.isArray(res) ? res : res.products;
    } catch {
      return [];
    }
  },

  async get(id: ProductId | string): Promise<Product | null> {
    try {
      return await apiFetch<Product>(`/products/${id}`);
    } catch {
      return null;
    }
  },

  async createEbook(input: CreateEbookInput): Promise<Product> {
    return apiFetch<Product>("/products/ebook", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async createMealPlan(input: CreateMealPlanInput): Promise<Product> {
    return apiFetch<Product>("/products/meal-plan", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async publish(id: ProductId | string, platform: string): Promise<Product> {
    return apiFetch<Product>(`/products/${id}/publish`, {
      method: "POST",
      body: JSON.stringify({ platform }),
    });
  },

  async generateLeadMagnet(id: ProductId | string): Promise<Product> {
    return apiFetch<Product>(`/products/${id}/lead-magnet`, {
      method: "POST",
    });
  },
};

// ---------------------------------------------------------------------------
// Settings endpoints
// ---------------------------------------------------------------------------

export interface KitStatus {
  connected: boolean;
  account_id: string | null;
  connected_at: string | null;
  scopes: readonly string[] | null;
  token_expires_at: string | null;
}

export interface BrandKit {
  id: string;
  creator_id: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string | null;
  accent_color: string | null;
  heading_font_family: string;
  heading_font_fallback: readonly string[];
  body_font_family: string;
  body_font_fallback: readonly string[];
  created_at: string;
  updated_at: string;
}

export interface BrandKitInput {
  name?: string;
  logo_url?: string | null;
  primary_color?: string;
  secondary_color?: string | null;
  accent_color?: string | null;
  heading_font_family?: string;
  heading_font_fallback?: readonly string[];
  body_font_family?: string;
  body_font_fallback?: readonly string[];
}

export interface TeamMember {
  id: string;
  creator_id: string;
  email: string;
  role: string;
  invited_at: string;
  accepted_at: string | null;
}

export interface WordPressStatus {
  connected: boolean;
  site_url: string | null;
  plugin: string | null;
  connected_at: string | null;
}

export interface CreatorAccount {
  id: string;
  email: string;
  name: string;
  subscription_tier: string;
  subscription_started_at: string;
  subscription_renews_at: string | null;
  kit_connected_at: string | null;
  wordpress_connected_at: string | null;
  created_at: string;
}

export const settings = {
  // Kit Connection
  async getKitStatus(): Promise<KitStatus> {
    return apiFetch<KitStatus>("/settings/kit/status");
  },

  async getKitAuthUrl(redirectUri?: string): Promise<{ url: string; state: string }> {
    const params = redirectUri ? `?redirect_uri=${encodeURIComponent(redirectUri)}` : "";
    return apiFetch<{ url: string; state: string }>(`/settings/kit/auth-url${params}`);
  },

  async exchangeKitCode(
    code: string,
    redirectUri: string,
  ): Promise<{ connected: boolean; connected_at: string }> {
    return apiFetch<{ connected: boolean; connected_at: string }>("/settings/kit/callback", {
      method: "POST",
      body: JSON.stringify({ code, redirect_uri: redirectUri }),
    });
  },

  async disconnectKit(): Promise<{ connected: boolean }> {
    return apiFetch<{ connected: boolean }>("/settings/kit/disconnect", {
      method: "POST",
    });
  },

  // Brand Kit
  async getBrandKit(): Promise<{ brand_kit: BrandKit | null }> {
    return apiFetch<{ brand_kit: BrandKit | null }>("/settings/brand");
  },

  async saveBrandKit(input: BrandKitInput): Promise<{ brand_kit: BrandKit }> {
    return apiFetch<{ brand_kit: BrandKit }>("/settings/brand", {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },

  // Team Management
  async getTeam(): Promise<{ members: TeamMember[]; subscription_tier: string }> {
    return apiFetch<{ members: TeamMember[]; subscription_tier: string }>("/settings/team");
  },

  async inviteTeamMember(email: string, role?: string): Promise<{ member: TeamMember }> {
    return apiFetch<{ member: TeamMember }>("/settings/team/invite", {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
  },

  async removeTeamMember(id: string): Promise<{ deleted: boolean }> {
    return apiFetch<{ deleted: boolean }>(`/settings/team/${id}`, {
      method: "DELETE",
    });
  },

  // WordPress
  async getWordPressStatus(): Promise<WordPressStatus> {
    return apiFetch<WordPressStatus>("/settings/wordpress");
  },

  async connectWordPress(
    siteUrl: string,
    apiKey: string,
    plugin?: string,
  ): Promise<WordPressStatus & { connected: true }> {
    return apiFetch<WordPressStatus & { connected: true }>("/settings/wordpress", {
      method: "POST",
      body: JSON.stringify({ site_url: siteUrl, api_key: apiKey, plugin }),
    });
  },

  async testWordPress(
    siteUrl: string,
    apiKey: string,
  ): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>("/settings/wordpress/test", {
      method: "POST",
      body: JSON.stringify({ site_url: siteUrl, api_key: apiKey }),
    });
  },

  async disconnectWordPress(): Promise<{ connected: boolean }> {
    return apiFetch<{ connected: boolean }>("/settings/wordpress/disconnect", {
      method: "POST",
    });
  },

  // Account
  async getAccount(): Promise<{ creator: CreatorAccount }> {
    return apiFetch<{ creator: CreatorAccount }>("/settings/account");
  },
};
