/**
 * Test helpers — factory functions for creating test fixtures.
 */

import type {
  CreatorId,
  HexColor,
  IngredientId,
  InstructionId,
  PhotoId,
  RecipeId,
  Slug,
  Url,
  BrandKitId,
} from "@crumb/shared";
import type {
  Ingredient,
  IngredientGroup,
  Instruction,
  InstructionGroup,
  NutritionFacts,
  Photo,
  RecipeClassification,
  RecipeTiming,
  RecipeYield,
} from "@crumb/shared";
import type { DietaryTag } from "@crumb/shared";
import { DIETARY_TAG } from "@crumb/shared";
import type { BrandKit, PluginRecipe } from "@/lib/types";

// ---------------------------------------------------------------------------
// ID factories
// ---------------------------------------------------------------------------

export function recipeId(id: string = "recipe-001"): RecipeId {
  return id as RecipeId;
}

export function creatorId(id: string = "creator-001"): CreatorId {
  return id as CreatorId;
}

export function brandKitId(id: string = "brand-001"): BrandKitId {
  return id as BrandKitId;
}

export function slug(value: string = "lemon-pasta"): Slug {
  return value as Slug;
}

export function url(value: string = "https://cdn.example.com/photo.jpg"): Url {
  return value as Url;
}

export function hexColor(value: string = "#FF5733"): HexColor {
  return value as HexColor;
}

export function photoId(id: string = "photo-001"): PhotoId {
  return id as PhotoId;
}

export function ingredientId(id: string = "ing-001"): IngredientId {
  return id as IngredientId;
}

export function instructionId(id: string = "inst-001"): InstructionId {
  return id as InstructionId;
}

// ---------------------------------------------------------------------------
// Value type factories
// ---------------------------------------------------------------------------

export function photo(overrides?: Partial<Photo>): Photo {
  return {
    id: photoId(),
    url: url("https://cdn.example.com/recipe-photo.jpg"),
    alt_text: "A delicious recipe",
    width: 800,
    height: 600,
    ...overrides,
  };
}

export function timing(overrides?: Partial<RecipeTiming>): RecipeTiming {
  return {
    prep_minutes: 15,
    cook_minutes: 30,
    total_minutes: 45,
    ...overrides,
  };
}

export function recipeYield(overrides?: Partial<RecipeYield>): RecipeYield {
  return {
    quantity: 4,
    unit: "servings",
    ...overrides,
  };
}

export function ingredient(item: string, overrides?: Partial<Ingredient>): Ingredient {
  return {
    id: ingredientId(`ing-${item}`),
    quantity: { type: "WholeNumber", value: 1 },
    unit: "cup",
    item,
    notes: null,
    ...overrides,
  };
}

export function ingredientGroup(items: string[], label: string | null = null): IngredientGroup {
  return {
    label,
    ingredients: items.map((item, i) => ingredient(item, { id: ingredientId(`ing-${i}`) })),
  };
}

export function instruction(body: string, id?: string): Instruction {
  return {
    id: instructionId(id ?? `inst-${body.substring(0, 10)}`),
    body,
  };
}

export function instructionGroup(steps: string[], label: string | null = null): InstructionGroup {
  return {
    label,
    instructions: steps.map((step, i) => instruction(step, `inst-${i}`)),
  };
}

export function classification(
  tags: DietaryTag[] = [],
  confirmed: boolean = true,
): RecipeClassification {
  return {
    dietary: {
      type: confirmed ? "Confirmed" : "Unconfirmed",
      tags: new Set(tags),
    },
    cuisine: "Italian",
    meal_types: new Set(),
    seasons: new Set(),
  };
}

export function nutritionFacts(): NutritionFacts {
  return {
    source: "Calculated",
    per_serving: {
      calories: 350,
      total_fat_g: 12,
      saturated_fat_g: 3,
      cholesterol_mg: 45,
      sodium_mg: 580,
      total_carbs_g: 42,
      dietary_fiber_g: 3,
      total_sugars_g: 5,
      protein_g: 18,
      vitamin_d_mcg: null,
      calcium_mg: null,
      iron_mg: null,
      potassium_mg: null,
    },
  };
}

// ---------------------------------------------------------------------------
// Complex type factories
// ---------------------------------------------------------------------------

export function pluginRecipe(overrides?: Partial<PluginRecipe>): PluginRecipe {
  return {
    id: recipeId(),
    creator_id: creatorId(),
    title: "Lemon Garlic Pasta",
    slug: slug("lemon-garlic-pasta"),
    description: "A bright and zesty pasta dish with fresh lemon, garlic, and parmesan cheese.",
    timing: timing(),
    yield: recipeYield(),
    ingredients: [
      ingredientGroup([
        "spaghetti",
        "lemon",
        "garlic cloves",
        "olive oil",
        "parmesan cheese",
        "butter",
        "salt",
        "black pepper",
        "red pepper flakes",
        "fresh parsley",
      ]),
    ],
    instructions: [
      instructionGroup([
        "Cook spaghetti according to package directions.",
        "Mince garlic and zest the lemon.",
        "Heat olive oil and butter in a large skillet.",
        "Add garlic and cook until fragrant.",
        "Toss pasta with the garlic oil, lemon zest, and lemon juice.",
        "Top with parmesan and fresh parsley.",
      ]),
    ],
    photos: [photo()],
    classification: classification([DIETARY_TAG.Vegetarian]),
    nutrition: nutritionFacts(),
    ...overrides,
  };
}

export function brandKit(overrides?: Partial<BrandKit>): BrandKit {
  return {
    id: brandKitId(),
    creator_id: creatorId(),
    name: "My Brand",
    logo_url: null,
    primary_color: hexColor("#E85D04"),
    secondary_color: null,
    accent_color: null,
    heading_font: {
      family: "Playfair Display",
      fallback: ["Georgia", "serif"],
    },
    body_font: {
      family: "Inter",
      fallback: ["Arial", "sans-serif"],
    },
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  };
}
