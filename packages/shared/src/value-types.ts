// ---------------------------------------------------------------------------
// Value types (SPEC §2.2–2.8)
// ---------------------------------------------------------------------------
// These are immutable, identity-less types defined by their content.
// Option<T> maps to T | null as per CLAUDE.md.
// ---------------------------------------------------------------------------

import type { IngredientId, InstructionId, KitAccountId, PhotoId, Url } from "./ids.js";

import type {
  DietaryTag,
  KitScope,
  MealType,
  Season,
  SubscriptionTier,
  WordPressRecipePlugin,
} from "./enums.js";

import type { Quantity } from "./quantity.js";

// ---------------------------------------------------------------------------
// §2.2 Creator — associated value types
// ---------------------------------------------------------------------------

/** Value type — Kit OAuth connection details. */
export interface KitConnection {
  readonly account_id: KitAccountId;
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_at: number; // timestamp (epoch ms)
  readonly scopes: ReadonlySet<KitScope>;
  readonly connected_at: number;
}

/** Value type — WordPress integration details. */
export interface WordPressConnection {
  readonly site_url: Url;
  readonly api_key: string;
  readonly plugin: WordPressRecipePlugin;
  readonly connected_at: number;
}

/** Value type — creator subscription state. */
export interface Subscription {
  readonly tier: SubscriptionTier;
  readonly started_at: number;
  readonly renews_at: number | null;
}

// ---------------------------------------------------------------------------
// §2.3 BrandKit — FontSpec
// ---------------------------------------------------------------------------

/** Value type — font specification for brand kit. */
export interface FontSpec {
  readonly family: string;
  readonly fallback: readonly string[];
}

// ---------------------------------------------------------------------------
// §2.4 Recipe — timing and yield
// ---------------------------------------------------------------------------

/** Value type — recipe time breakdown. */
export interface RecipeTiming {
  readonly prep_minutes: number | null;
  readonly cook_minutes: number | null;
  readonly total_minutes: number | null;
}

/** Value type — recipe yield. */
export interface RecipeYield {
  readonly quantity: number;
  readonly unit: string;
}

// ---------------------------------------------------------------------------
// §2.5 Ingredients
// ---------------------------------------------------------------------------

/** Value type — named group of ingredients. */
export interface IngredientGroup {
  readonly label: string | null;
  readonly ingredients: readonly Ingredient[];
}

/** An individual ingredient with parsed quantity. */
export interface Ingredient {
  readonly id: IngredientId;
  readonly quantity: Quantity | null;
  readonly unit: string | null;
  readonly item: string;
  readonly notes: string | null;
}

// ---------------------------------------------------------------------------
// §2.6 Instructions
// ---------------------------------------------------------------------------

/** Value type — named group of instructions. */
export interface InstructionGroup {
  readonly label: string | null;
  readonly instructions: readonly Instruction[];
}

/** A single instruction step. */
export interface Instruction {
  readonly id: InstructionId;
  readonly body: string;
}

// ---------------------------------------------------------------------------
// §2.7 Photo
// ---------------------------------------------------------------------------

/** A photo attached to a recipe. */
export interface Photo {
  readonly id: PhotoId;
  readonly url: Url;
  readonly alt_text: string | null;
  readonly width: number;
  readonly height: number;
}

// ---------------------------------------------------------------------------
// §2.8 DietaryTagState & RecipeClassification
// ---------------------------------------------------------------------------

/**
 * Discriminated union: dietary tags that are either AI-inferred (Unconfirmed)
 * or creator-reviewed (Confirmed). Only Confirmed tags are propagated to Kit.
 */
export type DietaryTagState =
  | { readonly type: "Unconfirmed"; readonly tags: ReadonlySet<DietaryTag> }
  | { readonly type: "Confirmed"; readonly tags: ReadonlySet<DietaryTag> };

/** Value type — recipe classification metadata. */
export interface RecipeClassification {
  readonly dietary: DietaryTagState;
  readonly cuisine: string | null;
  readonly meal_types: ReadonlySet<MealType>;
  readonly seasons: ReadonlySet<Season>;
}
