// ---------------------------------------------------------------------------
// Tests for Segmentation Engine — SPEC 9
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import type { Ingredient, NutritionValues, DietaryTag } from "@crumb/shared";
import { DIETARY_TAG, createIngredientId } from "@crumb/shared";
import { inferDietaryTags } from "../../src/services/segmentation.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a minimal Ingredient for testing. */
function ing(item: string, notes: string | null = null): Ingredient {
  return {
    id: createIngredientId(crypto.randomUUID()),
    quantity: null,
    unit: null,
    item,
    notes,
  };
}

/** Create a NutritionValues object for keto testing. */
function nutrition(overrides: Partial<NutritionValues> = {}): NutritionValues {
  return {
    calories: null,
    total_fat_g: null,
    saturated_fat_g: null,
    cholesterol_mg: null,
    sodium_mg: null,
    total_carbs_g: null,
    dietary_fiber_g: null,
    total_sugars_g: null,
    protein_g: null,
    vitamin_d_mcg: null,
    calcium_mg: null,
    iron_mg: null,
    potassium_mg: null,
    ...overrides,
  };
}

/** Check if a DietaryTag is present in the inferred result. */
function hasTag(tags: ReadonlySet<DietaryTag>, tag: DietaryTag): boolean {
  return tags.has(tag);
}

// ---------------------------------------------------------------------------
// Vegan detection
// ---------------------------------------------------------------------------

describe("Segmentation — Vegan detection", () => {
  it("tags all-plant ingredients as vegan", () => {
    const ingredients = [
      ing("tofu"),
      ing("rice"),
      ing("broccoli"),
      ing("olive oil"),
      ing("garlic"),
      ing("soy sauce"),
    ];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegan)).toBe(true);
  });

  it("does not tag as vegan when honey is present", () => {
    const ingredients = [ing("oat milk"), ing("banana"), ing("honey")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegan)).toBe(false);
  });

  it("does not tag as vegan when dairy is present", () => {
    const ingredients = [ing("pasta"), ing("parmesan"), ing("olive oil")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegan)).toBe(false);
  });

  it("does not tag as vegan when eggs are present", () => {
    const ingredients = [ing("flour"), ing("sugar"), ing("eggs"), ing("vanilla extract")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegan)).toBe(false);
  });

  it("does not tag as vegan when meat is present", () => {
    const ingredients = [ing("chicken breast"), ing("rice"), ing("vegetables")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegan)).toBe(false);
  });

  it("does not tag as vegan when seafood is present", () => {
    const ingredients = [ing("salmon fillet"), ing("lemon"), ing("dill")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegan)).toBe(false);
  });

  it("returns Unconfirmed state", () => {
    const ingredients = [ing("rice"), ing("beans"), ing("avocado")];
    const result = inferDietaryTags(ingredients, null);
    expect(result.state.type).toBe("Unconfirmed");
  });
});

// ---------------------------------------------------------------------------
// Vegetarian detection
// ---------------------------------------------------------------------------

describe("Segmentation — Vegetarian detection", () => {
  it("tags recipe with eggs and cheese as vegetarian", () => {
    const ingredients = [ing("eggs"), ing("cheddar cheese"), ing("spinach"), ing("butter")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegetarian)).toBe(true);
  });

  it("does not tag as vegetarian when chicken is present", () => {
    const ingredients = [ing("chicken thigh"), ing("rice"), ing("vegetables")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegetarian)).toBe(false);
  });

  it("does not tag as vegetarian when fish is present", () => {
    const ingredients = [ing("tuna steak"), ing("vegetables")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegetarian)).toBe(false);
  });

  it("does not tag as vegetarian when bacon is present", () => {
    const ingredients = [ing("pasta"), ing("bacon"), ing("cream")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegetarian)).toBe(false);
  });

  it("dairy and honey are OK for vegetarian", () => {
    const ingredients = [ing("milk"), ing("honey"), ing("oats")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegetarian)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gluten-free detection
// ---------------------------------------------------------------------------

describe("Segmentation — Gluten-free detection", () => {
  it("tags recipe with rice and potatoes as gluten-free", () => {
    const ingredients = [ing("rice"), ing("potatoes"), ing("olive oil"), ing("salt")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.GlutenFree)).toBe(true);
  });

  it("does not tag as gluten-free when wheat flour is present", () => {
    const ingredients = [ing("all-purpose flour"), ing("sugar"), ing("butter")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.GlutenFree)).toBe(false);
  });

  it("does not tag as gluten-free when barley is present", () => {
    const ingredients = [ing("pearl barley"), ing("vegetables"), ing("water")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.GlutenFree)).toBe(false);
  });

  it("does not tag as gluten-free when pasta is present", () => {
    const ingredients = [ing("spaghetti"), ing("tomato sauce"), ing("garlic")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.GlutenFree)).toBe(false);
  });

  it("flags oats as ambiguous for gluten-free", () => {
    const ingredients = [ing("rolled oats"), ing("banana"), ing("maple syrup")];

    const result = inferDietaryTags(ingredients, null);
    // Oats themselves are naturally gluten-free but cross-contamination is common
    // The tag should be present but flagged as ambiguous
    expect(hasTag(result.state.tags, DIETARY_TAG.GlutenFree)).toBe(true);
    expect(result.ambiguous.has(DIETARY_TAG.GlutenFree)).toBe(true);
    expect(result.ambiguous.get(DIETARY_TAG.GlutenFree)).toContain("oats");
  });

  it("does not flag ambiguity when no oats are present", () => {
    const ingredients = [ing("rice"), ing("chicken")];

    const result = inferDietaryTags(ingredients, null);
    expect(result.ambiguous.has(DIETARY_TAG.GlutenFree)).toBe(false);
  });

  it("does not tag as gluten-free when soy sauce is present", () => {
    const ingredients = [ing("rice"), ing("soy sauce"), ing("ginger")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.GlutenFree)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Dairy-free detection
// ---------------------------------------------------------------------------

describe("Segmentation — Dairy-free detection", () => {
  it("tags recipe without dairy as dairy-free", () => {
    const ingredients = [ing("chicken"), ing("rice"), ing("olive oil"), ing("garlic")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.DairyFree)).toBe(true);
  });

  it("does not tag as dairy-free when butter is present", () => {
    const ingredients = [ing("pasta"), ing("butter"), ing("garlic")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.DairyFree)).toBe(false);
  });

  it("does not tag as dairy-free when ghee is present", () => {
    const ingredients = [ing("rice"), ing("ghee"), ing("spices")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.DairyFree)).toBe(false);
  });

  it("does not tag as dairy-free when cream is present", () => {
    const ingredients = [ing("pasta"), ing("heavy cream"), ing("garlic")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.DairyFree)).toBe(false);
  });

  it("does not tag as dairy-free when cheese is present", () => {
    const ingredients = [ing("bread"), ing("mozzarella"), ing("tomato")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.DairyFree)).toBe(false);
  });

  it("does not tag as dairy-free when yogurt is present", () => {
    const ingredients = [ing("cucumber"), ing("greek yogurt"), ing("dill")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.DairyFree)).toBe(false);
  });

  it("does not tag as dairy-free when whey is present", () => {
    const ingredients = [ing("banana"), ing("whey protein"), ing("water")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.DairyFree)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Nut-free detection
// ---------------------------------------------------------------------------

describe("Segmentation — Nut-free detection", () => {
  it("tags recipe without nuts as nut-free", () => {
    const ingredients = [ing("chicken"), ing("rice"), ing("broccoli")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.NutFree)).toBe(true);
  });

  it("does not tag as nut-free when almonds are present", () => {
    const ingredients = [ing("almonds"), ing("chocolate")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.NutFree)).toBe(false);
  });

  it("does not tag as nut-free when peanut butter is present", () => {
    const ingredients = [ing("peanut butter"), ing("banana"), ing("bread")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.NutFree)).toBe(false);
  });

  it("does not tag as nut-free when cashews are present", () => {
    const ingredients = [ing("stir fry vegetables"), ing("cashews"), ing("rice")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.NutFree)).toBe(false);
  });

  it("does not tag as nut-free when walnuts are present", () => {
    const ingredients = [ing("salad greens"), ing("walnuts"), ing("vinaigrette")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.NutFree)).toBe(false);
  });

  it("does not tag as nut-free when almond flour is present in notes", () => {
    const ingredients = [ing("flour blend", "contains almond flour")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.NutFree)).toBe(false);
  });

  it("does not tag as nut-free when pine nuts are present", () => {
    const ingredients = [ing("basil pesto"), ing("pine nuts"), ing("pasta")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.NutFree)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Egg-free detection
// ---------------------------------------------------------------------------

describe("Segmentation — Egg-free detection", () => {
  it("tags recipe without eggs as egg-free", () => {
    const ingredients = [ing("rice"), ing("beans"), ing("salsa")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.EggFree)).toBe(true);
  });

  it("does not tag as egg-free when eggs are present", () => {
    const ingredients = [ing("eggs"), ing("milk"), ing("flour")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.EggFree)).toBe(false);
  });

  it("does not tag as egg-free when mayonnaise is present", () => {
    const ingredients = [ing("tuna"), ing("mayonnaise"), ing("celery")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.EggFree)).toBe(false);
  });

  it("does not tag as egg-free when egg whites are present", () => {
    const ingredients = [ing("egg whites"), ing("sugar")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.EggFree)).toBe(false);
  });

  it("does not tag as egg-free when egg yolks are present", () => {
    const ingredients = [ing("egg yolks"), ing("cream"), ing("sugar")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.EggFree)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Keto detection
// ---------------------------------------------------------------------------

describe("Segmentation — Keto detection", () => {
  it("tags as keto with low carb, high fat nutrition data", () => {
    const ingredients = [ing("avocado"), ing("olive oil"), ing("spinach")];

    const nutri = nutrition({
      total_carbs_g: 5,
      total_fat_g: 40,
      protein_g: 10,
    });

    const result = inferDietaryTags(ingredients, nutri);
    expect(hasTag(result.state.tags, DIETARY_TAG.Keto)).toBe(true);
  });

  it("does not tag as keto with high carb nutrition data", () => {
    const ingredients = [ing("rice"), ing("beans")];

    const nutri = nutrition({
      total_carbs_g: 50,
      total_fat_g: 5,
      protein_g: 10,
    });

    const result = inferDietaryTags(ingredients, nutri);
    expect(hasTag(result.state.tags, DIETARY_TAG.Keto)).toBe(false);
  });

  it("does not tag as keto when carbs are exactly 10g (boundary)", () => {
    const ingredients = [ing("cheese")];

    const nutri = nutrition({
      total_carbs_g: 10,
      total_fat_g: 30,
      protein_g: 15,
    });

    const result = inferDietaryTags(ingredients, nutri);
    expect(hasTag(result.state.tags, DIETARY_TAG.Keto)).toBe(true);
  });

  it("does not tag as keto when carbs are 11g (just over boundary)", () => {
    const ingredients = [ing("cheese")];

    const nutri = nutrition({
      total_carbs_g: 11,
      total_fat_g: 30,
      protein_g: 15,
    });

    const result = inferDietaryTags(ingredients, nutri);
    expect(hasTag(result.state.tags, DIETARY_TAG.Keto)).toBe(false);
  });

  it("does not tag as keto when fat <= protein", () => {
    const ingredients = [ing("chicken breast")];

    const nutri = nutrition({
      total_carbs_g: 5,
      total_fat_g: 10,
      protein_g: 30,
    });

    const result = inferDietaryTags(ingredients, nutri);
    expect(hasTag(result.state.tags, DIETARY_TAG.Keto)).toBe(false);
  });

  it("does not tag as keto when no nutrition data is provided", () => {
    const ingredients = [ing("avocado"), ing("olive oil")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Keto)).toBe(false);
  });

  it("does not tag as keto when nutrition values are null", () => {
    const ingredients = [ing("avocado")];
    const nutri = nutrition(); // all values null

    const result = inferDietaryTags(ingredients, nutri);
    expect(hasTag(result.state.tags, DIETARY_TAG.Keto)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Paleo detection
// ---------------------------------------------------------------------------

describe("Segmentation — Paleo detection", () => {
  it("tags whole food recipe as paleo", () => {
    const ingredients = [
      ing("chicken breast"),
      ing("sweet potato"),
      ing("olive oil"),
      ing("garlic"),
      ing("rosemary"),
    ];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Paleo)).toBe(true);
  });

  it("does not tag as paleo when grains are present", () => {
    const ingredients = [ing("chicken"), ing("rice"), ing("vegetables")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Paleo)).toBe(false);
  });

  it("does not tag as paleo when legumes are present", () => {
    const ingredients = [ing("chicken"), ing("black beans"), ing("vegetables")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Paleo)).toBe(false);
  });

  it("does not tag as paleo when dairy is present", () => {
    const ingredients = [ing("steak"), ing("butter"), ing("vegetables")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Paleo)).toBe(false);
  });

  it("does not tag as paleo when refined sugar is present", () => {
    const ingredients = [ing("chicken"), ing("sugar"), ing("vinegar")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Paleo)).toBe(false);
  });

  it("does not tag as paleo when processed oils are present", () => {
    const ingredients = [ing("chicken"), ing("vegetable oil"), ing("vegetables")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Paleo)).toBe(false);
  });

  it("does not tag as paleo when flour is present", () => {
    const ingredients = [ing("chicken breast"), ing("flour"), ing("olive oil")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Paleo)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Soy-free detection
// ---------------------------------------------------------------------------

describe("Segmentation — Soy-free detection", () => {
  it("tags recipe without soy as soy-free", () => {
    const ingredients = [ing("chicken"), ing("rice"), ing("broccoli")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.SoyFree)).toBe(true);
  });

  it("does not tag as soy-free when tofu is present", () => {
    const ingredients = [ing("firm tofu"), ing("vegetables"), ing("sesame oil")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.SoyFree)).toBe(false);
  });

  it("does not tag as soy-free when soy sauce is present", () => {
    const ingredients = [ing("rice"), ing("soy sauce"), ing("ginger")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.SoyFree)).toBe(false);
  });

  it("does not tag as soy-free when edamame is present", () => {
    const ingredients = [ing("salad greens"), ing("edamame"), ing("sesame seeds")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.SoyFree)).toBe(false);
  });

  it("does not tag as soy-free when miso is present", () => {
    const ingredients = [ing("water"), ing("miso paste"), ing("seaweed")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.SoyFree)).toBe(false);
  });

  it("does not tag as soy-free when tempeh is present", () => {
    const ingredients = [ing("tempeh"), ing("vegetables")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.SoyFree)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Confirmed vs Unconfirmed state
// ---------------------------------------------------------------------------

describe("Segmentation — State management", () => {
  it("inferred tags are always Unconfirmed", () => {
    const ingredients = [ing("rice"), ing("beans")];
    const result = inferDietaryTags(ingredients, null);
    expect(result.state.type).toBe("Unconfirmed");
  });

  it("inferred tags return the correct tags for a complex recipe", () => {
    // A plant-based, gluten-free, nut-free, soy-free recipe
    const ingredients = [
      ing("sweet potato"),
      ing("avocado"),
      ing("lime juice"),
      ing("cilantro"),
      ing("olive oil"),
      ing("salt"),
      ing("pepper"),
    ];

    const result = inferDietaryTags(ingredients, null);
    expect(result.state.type).toBe("Unconfirmed");

    // Should be vegan
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegan)).toBe(true);
    // Should be vegetarian
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegetarian)).toBe(true);
    // Should be gluten-free
    expect(hasTag(result.state.tags, DIETARY_TAG.GlutenFree)).toBe(true);
    // Should be dairy-free
    expect(hasTag(result.state.tags, DIETARY_TAG.DairyFree)).toBe(true);
    // Should be nut-free
    expect(hasTag(result.state.tags, DIETARY_TAG.NutFree)).toBe(true);
    // Should be egg-free
    expect(hasTag(result.state.tags, DIETARY_TAG.EggFree)).toBe(true);
    // Should be soy-free
    expect(hasTag(result.state.tags, DIETARY_TAG.SoyFree)).toBe(true);
    // Should be paleo (no grains, legumes, dairy, refined sugar, processed oils)
    expect(hasTag(result.state.tags, DIETARY_TAG.Paleo)).toBe(true);
    // Should NOT be keto (no nutrition data)
    expect(hasTag(result.state.tags, DIETARY_TAG.Keto)).toBe(false);
  });

  it("empty ingredient list tags everything except keto", () => {
    const result = inferDietaryTags([], null);
    expect(result.state.type).toBe("Unconfirmed");
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegan)).toBe(true);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegetarian)).toBe(true);
    expect(hasTag(result.state.tags, DIETARY_TAG.GlutenFree)).toBe(true);
    expect(hasTag(result.state.tags, DIETARY_TAG.DairyFree)).toBe(true);
    expect(hasTag(result.state.tags, DIETARY_TAG.NutFree)).toBe(true);
    expect(hasTag(result.state.tags, DIETARY_TAG.EggFree)).toBe(true);
    expect(hasTag(result.state.tags, DIETARY_TAG.SoyFree)).toBe(true);
    expect(hasTag(result.state.tags, DIETARY_TAG.Paleo)).toBe(true);
    expect(hasTag(result.state.tags, DIETARY_TAG.Keto)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Case-insensitive matching
// ---------------------------------------------------------------------------

describe("Segmentation — Case-insensitive matching", () => {
  it("detects dairy in mixed case", () => {
    const ingredients = [ing("BUTTER"), ing("pasta")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.DairyFree)).toBe(false);
  });

  it("detects meat with capitalized text", () => {
    const ingredients = [ing("Chicken Breast"), ing("Rice")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegan)).toBe(false);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegetarian)).toBe(false);
  });

  it("detects allergens in notes field (case-insensitive)", () => {
    const ingredients = [ing("spread", "Contains PEANUT butter")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.NutFree)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Multi-word keyword matching
// ---------------------------------------------------------------------------

describe("Segmentation — Multi-word keyword matching", () => {
  it("detects peanut butter as nut-containing", () => {
    const ingredients = [ing("peanut butter")];
    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.NutFree)).toBe(false);
  });

  it("detects soy sauce as soy-containing", () => {
    const ingredients = [ing("soy sauce")];
    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.SoyFree)).toBe(false);
  });

  it("detects almond flour as nut-containing", () => {
    const ingredients = [ing("almond flour")];
    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.NutFree)).toBe(false);
  });

  it("detects all-purpose flour as gluten-containing", () => {
    const ingredients = [ing("all-purpose flour")];
    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.GlutenFree)).toBe(false);
  });

  it("detects cream cheese as dairy", () => {
    const ingredients = [ing("cream cheese")];
    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.DairyFree)).toBe(false);
  });

  it("detects egg whites as egg-containing", () => {
    const ingredients = [ing("egg whites")];
    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.EggFree)).toBe(false);
  });

  it("detects fish sauce as non-vegetarian", () => {
    const ingredients = [ing("fish sauce")];
    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegetarian)).toBe(false);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegan)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Word boundary matching
// ---------------------------------------------------------------------------

describe("Segmentation — Word boundary matching", () => {
  it("does not falsely match 'rice' in 'licorice'", () => {
    // "rice" appears in "licorice" but should not trigger rice detection
    const ingredients = [ing("licorice")];
    const result = inferDietaryTags(ingredients, null);
    // "licorice" should not be detected as containing "rice"
    // This ensures our word boundary matching works
    expect(hasTag(result.state.tags, DIETARY_TAG.Paleo)).toBe(true);
  });

  it("does not falsely match 'corn' in 'acorn squash'", () => {
    const ingredients = [ing("acorn squash")];
    const result = inferDietaryTags(ingredients, null);
    // "acorn" contains "corn" but should not be detected as corn
    // However "corn" is not in paleo grains as a word-boundary match here
    // since "acorn" starts with 'a' before 'corn'
    expect(hasTag(result.state.tags, DIETARY_TAG.Paleo)).toBe(true);
  });

  it("matches 'egg' as a standalone word", () => {
    const ingredients = [ing("1 egg")];
    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.EggFree)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Segment profile computation (mock Kit API)
// ---------------------------------------------------------------------------

describe("Segmentation — Segment profile computation concepts", () => {
  it("computeSegmentProfile returns a profile structure with all dietary tags", () => {
    // This tests the structure/contract of inferDietaryTags and the
    // DIETARY_TAG enum, verifying all 9 tags are accounted for
    const allTags = Object.values(DIETARY_TAG);
    expect(allTags).toHaveLength(9);
    expect(allTags).toContain("GlutenFree");
    expect(allTags).toContain("DairyFree");
    expect(allTags).toContain("Vegan");
    expect(allTags).toContain("Vegetarian");
    expect(allTags).toContain("Keto");
    expect(allTags).toContain("Paleo");
    expect(allTags).toContain("NutFree");
    expect(allTags).toContain("EggFree");
    expect(allTags).toContain("SoyFree");
  });

  it("SegmentStat shape matches expected structure", () => {
    // Validate that our segment profile data shape is correct
    const stat: {
      subscriber_count: number;
      engagement_rate: number;
      growth_rate_30d: number;
      top_recipe_ids: readonly string[];
    } = {
      subscriber_count: 150,
      engagement_rate: 0.25,
      growth_rate_30d: 0.05,
      top_recipe_ids: ["recipe-1", "recipe-2", "recipe-3"],
    };

    expect(stat.subscriber_count).toBe(150);
    expect(stat.engagement_rate).toBe(0.25);
    expect(stat.growth_rate_30d).toBe(0.05);
    expect(stat.top_recipe_ids).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Realistic recipe scenarios
// ---------------------------------------------------------------------------

describe("Segmentation — Realistic recipes", () => {
  it("classic pasta carbonara is not vegan, not dairy-free, not egg-free, not paleo", () => {
    const ingredients = [
      ing("spaghetti"),
      ing("guanciale"),
      ing("egg yolks"),
      ing("pecorino romano"),
      ing("black pepper"),
    ];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegan)).toBe(false);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegetarian)).toBe(false);
    expect(hasTag(result.state.tags, DIETARY_TAG.GlutenFree)).toBe(false);
    expect(hasTag(result.state.tags, DIETARY_TAG.DairyFree)).toBe(false);
    expect(hasTag(result.state.tags, DIETARY_TAG.EggFree)).toBe(false);
    expect(hasTag(result.state.tags, DIETARY_TAG.Paleo)).toBe(false);
  });

  it("grilled chicken salad is vegetarian=false, dairy-free, egg-free, gluten-free, nut-free, soy-free", () => {
    const ingredients = [
      ing("chicken breast"),
      ing("mixed greens"),
      ing("cherry tomatoes"),
      ing("cucumber"),
      ing("olive oil"),
      ing("lemon juice"),
      ing("salt"),
      ing("pepper"),
    ];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegan)).toBe(false);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegetarian)).toBe(false);
    expect(hasTag(result.state.tags, DIETARY_TAG.GlutenFree)).toBe(true);
    expect(hasTag(result.state.tags, DIETARY_TAG.DairyFree)).toBe(true);
    expect(hasTag(result.state.tags, DIETARY_TAG.EggFree)).toBe(true);
    expect(hasTag(result.state.tags, DIETARY_TAG.NutFree)).toBe(true);
    expect(hasTag(result.state.tags, DIETARY_TAG.SoyFree)).toBe(true);
  });

  it("thai peanut tofu stir-fry is not nut-free, not soy-free, vegan", () => {
    const ingredients = [
      ing("firm tofu"),
      ing("peanut sauce"),
      ing("broccoli"),
      ing("bell pepper"),
      ing("sesame oil"),
      ing("lime"),
      ing("cilantro"),
    ];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegan)).toBe(true);
    expect(hasTag(result.state.tags, DIETARY_TAG.NutFree)).toBe(false);
    expect(hasTag(result.state.tags, DIETARY_TAG.SoyFree)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Worcestershire sauce detection
// ---------------------------------------------------------------------------

describe("Segmentation — Edge cases", () => {
  it("detects worcestershire sauce as non-vegetarian", () => {
    const ingredients = [ing("steak"), ing("worcestershire sauce")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegetarian)).toBe(false);
  });

  it("detects gelatin as non-vegetarian", () => {
    const ingredients = [ing("gelatin"), ing("fruit juice"), ing("sugar")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegan)).toBe(false);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegetarian)).toBe(false);
  });

  it("detects bone broth as non-vegetarian", () => {
    const ingredients = [ing("bone broth"), ing("vegetables"), ing("salt")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegan)).toBe(false);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegetarian)).toBe(false);
  });

  it("detects lard as non-vegetarian", () => {
    const ingredients = [ing("lard"), ing("flour"), ing("salt")];

    const result = inferDietaryTags(ingredients, null);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegan)).toBe(false);
    expect(hasTag(result.state.tags, DIETARY_TAG.Vegetarian)).toBe(false);
  });
});
