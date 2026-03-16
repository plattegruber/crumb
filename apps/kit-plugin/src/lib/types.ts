/**
 * Plugin-local types used across the kit-plugin package.
 * These supplement @dough/shared types with plugin-specific structures.
 */

import type {
  BrandKitId,
  CreatorId,
  DietaryTag,
  HexColor,
  RecipeId,
  Slug,
  Url,
} from "@dough/shared";
import type {
  FontSpec,
  IngredientGroup,
  InstructionGroup,
  NutritionFacts,
  Photo,
  RecipeClassification,
  RecipeTiming,
  RecipeYield,
} from "@dough/shared";

// ---------------------------------------------------------------------------
// Display mode for recipe cards
// ---------------------------------------------------------------------------

export const DISPLAY_MODE = {
  Compact: "Compact",
  Standard: "Standard",
  Full: "Full",
} as const;

export type DisplayMode = (typeof DISPLAY_MODE)[keyof typeof DISPLAY_MODE];

// ---------------------------------------------------------------------------
// BrandKit — local definition matching SPEC §2.3
// ---------------------------------------------------------------------------

export interface BrandKit {
  readonly id: BrandKitId;
  readonly creator_id: CreatorId;
  readonly name: string;
  readonly logo_url: Url | null;
  readonly primary_color: HexColor;
  readonly secondary_color: HexColor | null;
  readonly accent_color: HexColor | null;
  readonly heading_font: FontSpec;
  readonly body_font: FontSpec;
  readonly created_at: number;
  readonly updated_at: number;
}

// ---------------------------------------------------------------------------
// Plugin config
// ---------------------------------------------------------------------------

export interface PluginConfig {
  readonly apiBaseUrl: string;
  readonly authToken: string;
  readonly creatorId: CreatorId;
}

// ---------------------------------------------------------------------------
// Card render options
// ---------------------------------------------------------------------------

export interface CardRenderOptions {
  readonly displayMode: DisplayMode;
  readonly showNutrition: boolean;
  readonly appDomain: string;
}

// ---------------------------------------------------------------------------
// Recipe search filters
// ---------------------------------------------------------------------------

export interface RecipeSearchFilters {
  readonly dietary_tags?: readonly DietaryTag[];
  readonly cuisine?: string;
  readonly meal_type?: string;
  readonly max_cook_time_minutes?: number;
  readonly status?: string;
}

// ---------------------------------------------------------------------------
// Recipe summary — lighter-weight type for search results
// ---------------------------------------------------------------------------

export interface RecipeSummary {
  readonly id: RecipeId;
  readonly title: string;
  readonly slug: Slug;
  readonly description: string | null;
  readonly primary_photo: Photo | null;
  readonly timing: RecipeTiming;
  readonly yield: RecipeYield | null;
  readonly classification: RecipeClassification;
}

// ---------------------------------------------------------------------------
// Full recipe — what getRecipe returns
// ---------------------------------------------------------------------------

export interface PluginRecipe {
  readonly id: RecipeId;
  readonly creator_id: CreatorId;
  readonly title: string;
  readonly slug: Slug;
  readonly description: string | null;
  readonly timing: RecipeTiming;
  readonly yield: RecipeYield | null;
  readonly ingredients: readonly IngredientGroup[];
  readonly instructions: readonly InstructionGroup[];
  readonly photos: readonly Photo[];
  readonly classification: RecipeClassification;
  readonly nutrition: NutritionFacts | null;
}

// ---------------------------------------------------------------------------
// Search response
// ---------------------------------------------------------------------------

export interface SearchResponse {
  readonly recipes: readonly RecipeSummary[];
  readonly total: number;
  readonly page: number;
  readonly per_page: number;
}
