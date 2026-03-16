// ---------------------------------------------------------------------------
// Kit Tag & Custom Field Naming Conventions
// ---------------------------------------------------------------------------
// SPEC 4.4: Tag naming convention — namespaced to avoid collision.
// SPEC 4.5: Custom field key convention.
// ---------------------------------------------------------------------------

import type { DietaryTag, Slug } from "@dough/shared";

// ---------------------------------------------------------------------------
// Dietary tag slug mapping
// ---------------------------------------------------------------------------

const DIETARY_TAG_SLUGS: Readonly<Record<DietaryTag, string>> = {
  GlutenFree: "gluten-free",
  DairyFree: "dairy-free",
  Vegan: "vegan",
  Vegetarian: "vegetarian",
  Keto: "keto",
  Paleo: "paleo",
  NutFree: "nut-free",
  EggFree: "egg-free",
  SoyFree: "soy-free",
};

// ---------------------------------------------------------------------------
// Tag naming functions (SPEC 4.4)
// ---------------------------------------------------------------------------

/**
 * Generate the Kit tag name for a dietary tag.
 *
 * @example
 * dietaryTagName("GlutenFree") // "dietary:gluten-free"
 */
export function dietaryTagName(tag: DietaryTag): string {
  return `dietary:${DIETARY_TAG_SLUGS[tag]}`;
}

/**
 * Generate the Kit tag name for a saved recipe.
 *
 * @example
 * recipeSavedTagName("lemon-pasta" as Slug) // "recipe:saved:lemon-pasta"
 */
export function recipeSavedTagName(slug: Slug): string {
  return `recipe:saved:${slug}`;
}

/**
 * Generate the Kit tag name for a purchased product.
 *
 * @example
 * productPurchasedTagName("a1b2c3") // "product:purchased:a1b2c3"
 */
export function productPurchasedTagName(productId: string): string {
  return `product:purchased:${productId}`;
}

// ---------------------------------------------------------------------------
// Custom field keys (SPEC 4.5)
// ---------------------------------------------------------------------------

/**
 * Kit custom field keys used by the application.
 * These are the `label` values passed to Kit's createCustomField endpoint;
 * Kit auto-generates the internal `key` (lowercase with underscores).
 */
export const KIT_CUSTOM_FIELD_LABELS = {
  PreferredDietaryTags: "preferred_dietary_tags",
  LastRecipeSaved: "last_recipe_saved",
  LastRecipeSavedAt: "last_recipe_saved_at",
} as const;

export type KitCustomFieldLabel =
  (typeof KIT_CUSTOM_FIELD_LABELS)[keyof typeof KIT_CUSTOM_FIELD_LABELS];
