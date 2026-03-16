// ---------------------------------------------------------------------------
// Tests for Kit tag and custom field naming conventions
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import {
  dietaryTagName,
  recipeSavedTagName,
  productPurchasedTagName,
  KIT_CUSTOM_FIELD_LABELS,
} from "../../../src/lib/kit/tag-conventions.js";
import type { DietaryTag, Slug } from "@crumb/shared";

// ---------------------------------------------------------------------------
// dietaryTagName
// ---------------------------------------------------------------------------

describe("dietaryTagName", () => {
  it("generates correct tag for GlutenFree", () => {
    expect(dietaryTagName("GlutenFree" as DietaryTag)).toBe("dietary:gluten-free");
  });

  it("generates correct tag for DairyFree", () => {
    expect(dietaryTagName("DairyFree" as DietaryTag)).toBe("dietary:dairy-free");
  });

  it("generates correct tag for Vegan", () => {
    expect(dietaryTagName("Vegan" as DietaryTag)).toBe("dietary:vegan");
  });

  it("generates correct tag for Vegetarian", () => {
    expect(dietaryTagName("Vegetarian" as DietaryTag)).toBe("dietary:vegetarian");
  });

  it("generates correct tag for Keto", () => {
    expect(dietaryTagName("Keto" as DietaryTag)).toBe("dietary:keto");
  });

  it("generates correct tag for Paleo", () => {
    expect(dietaryTagName("Paleo" as DietaryTag)).toBe("dietary:paleo");
  });

  it("generates correct tag for NutFree", () => {
    expect(dietaryTagName("NutFree" as DietaryTag)).toBe("dietary:nut-free");
  });

  it("generates correct tag for EggFree", () => {
    expect(dietaryTagName("EggFree" as DietaryTag)).toBe("dietary:egg-free");
  });

  it("generates correct tag for SoyFree", () => {
    expect(dietaryTagName("SoyFree" as DietaryTag)).toBe("dietary:soy-free");
  });
});

// ---------------------------------------------------------------------------
// recipeSavedTagName
// ---------------------------------------------------------------------------

describe("recipeSavedTagName", () => {
  it("generates correct tag for a recipe slug", () => {
    expect(recipeSavedTagName("lemon-pasta" as Slug)).toBe(
      "recipe:saved:lemon-pasta",
    );
  });

  it("generates correct tag for a single-word slug", () => {
    expect(recipeSavedTagName("risotto" as Slug)).toBe(
      "recipe:saved:risotto",
    );
  });

  it("generates correct tag for a multi-word slug", () => {
    expect(recipeSavedTagName("chocolate-chip-cookies" as Slug)).toBe(
      "recipe:saved:chocolate-chip-cookies",
    );
  });
});

// ---------------------------------------------------------------------------
// productPurchasedTagName
// ---------------------------------------------------------------------------

describe("productPurchasedTagName", () => {
  it("generates correct tag for a product ID", () => {
    expect(productPurchasedTagName("a1b2c3")).toBe(
      "product:purchased:a1b2c3",
    );
  });

  it("generates correct tag for a UUID-style product ID", () => {
    expect(productPurchasedTagName("550e8400-e29b-41d4-a716-446655440000")).toBe(
      "product:purchased:550e8400-e29b-41d4-a716-446655440000",
    );
  });
});

// ---------------------------------------------------------------------------
// Custom field labels
// ---------------------------------------------------------------------------

describe("KIT_CUSTOM_FIELD_LABELS", () => {
  it("has correct label for preferred dietary tags", () => {
    expect(KIT_CUSTOM_FIELD_LABELS.PreferredDietaryTags).toBe(
      "preferred_dietary_tags",
    );
  });

  it("has correct label for last recipe saved", () => {
    expect(KIT_CUSTOM_FIELD_LABELS.LastRecipeSaved).toBe(
      "last_recipe_saved",
    );
  });

  it("has correct label for last recipe saved at", () => {
    expect(KIT_CUSTOM_FIELD_LABELS.LastRecipeSavedAt).toBe(
      "last_recipe_saved_at",
    );
  });
});
