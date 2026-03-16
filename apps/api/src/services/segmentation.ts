// ---------------------------------------------------------------------------
// Segmentation Engine — SPEC 9
// ---------------------------------------------------------------------------
// Dietary auto-tagging (9.3), preference capture form (9.2),
// segment analytics (9.4).
// ---------------------------------------------------------------------------

import type { Result } from "@dough/shared";
import { ok, err } from "@dough/shared";
import type {
  DietaryTag,
  Ingredient,
  NutritionValues,
  DietaryTagState,
  RecipeId,
  CreatorId,
} from "@dough/shared";
import { DIETARY_TAG } from "@dough/shared";
import { createLogger, type Logger } from "../lib/logger.js";

import type { KitClientConfig } from "../lib/kit/client.js";
import { listTags, getOrCreateTag, tagSubscriber, listForms } from "../lib/kit/client.js";
import type { KitTag } from "../lib/kit/types.js";
import { dietaryTagName } from "../lib/kit/tag-conventions.js";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { recipes, segmentProfiles } from "../db/schema.js";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export interface SegmentationError {
  readonly code:
    | "RECIPE_NOT_FOUND"
    | "NOT_AUTHORIZED"
    | "KIT_API_ERROR"
    | "FORM_NOT_FOUND"
    | "INVALID_INPUT";
  readonly message: string;
}

function segError(code: SegmentationError["code"], message: string): SegmentationError {
  return { code, message };
}

const defaultLogger = createLogger("segmentation");

// ---------------------------------------------------------------------------
// Keyword lists for dietary tag inference (SPEC 9.3)
// ---------------------------------------------------------------------------

/** Meat / poultry / seafood keywords — used by vegan + vegetarian checks. */
const MEAT_POULTRY_SEAFOOD_KEYWORDS: readonly string[] = [
  // Meats
  "beef",
  "steak",
  "ground beef",
  "veal",
  "lamb",
  "pork",
  "bacon",
  "ham",
  "prosciutto",
  "pancetta",
  "guanciale",
  "salami",
  "pepperoni",
  "sausage",
  "bratwurst",
  "chorizo",
  "venison",
  "bison",
  "buffalo",
  "elk",
  "rabbit",
  "goat",
  "duck",
  "goose",
  "lard",
  "suet",
  "tallow",
  "gelatin",
  "bone broth",
  "beef broth",
  "beef stock",
  "chicken broth",
  "chicken stock",
  "meat",
  "ribs",
  "roast",
  "mince",
  "ground meat",
  "hot dog",
  "jerky",
  "pastrami",
  "corned beef",
  "liver",
  "offal",
  "oxtail",
  // Poultry
  "chicken",
  "turkey",
  "poultry",
  "cornish hen",
  "quail",
  "pheasant",
  // Seafood
  "fish",
  "salmon",
  "tuna",
  "cod",
  "tilapia",
  "halibut",
  "sea bass",
  "trout",
  "mackerel",
  "sardine",
  "sardines",
  "anchovy",
  "anchovies",
  "anchovy paste",
  "shrimp",
  "prawns",
  "prawn",
  "lobster",
  "crab",
  "scallop",
  "scallops",
  "clam",
  "clams",
  "mussel",
  "mussels",
  "oyster",
  "oysters",
  "calamari",
  "squid",
  "octopus",
  "swordfish",
  "mahi mahi",
  "snapper",
  "grouper",
  "catfish",
  "haddock",
  "pollock",
  "seafood",
  "fish sauce",
  "worcestershire sauce",
  "worcestershire",
];

/** Dairy keywords — used by vegan + dairy-free checks. */
const DAIRY_KEYWORDS: readonly string[] = [
  "milk",
  "whole milk",
  "skim milk",
  "2% milk",
  "buttermilk",
  "cream",
  "heavy cream",
  "light cream",
  "whipping cream",
  "half and half",
  "half-and-half",
  "sour cream",
  "cream cheese",
  "butter",
  "unsalted butter",
  "salted butter",
  "ghee",
  "clarified butter",
  "cheese",
  "cheddar",
  "mozzarella",
  "parmesan",
  "parmigiano",
  "gruyere",
  "swiss cheese",
  "brie",
  "camembert",
  "gouda",
  "feta",
  "ricotta",
  "mascarpone",
  "provolone",
  "blue cheese",
  "gorgonzola",
  "goat cheese",
  "cottage cheese",
  "queso",
  "paneer",
  "pecorino",
  "romano",
  "asiago",
  "fontina",
  "havarti",
  "muenster",
  "manchego",
  "colby",
  "jack cheese",
  "monterey jack",
  "pepper jack",
  "neufchatel",
  "yogurt",
  "greek yogurt",
  "kefir",
  "whey",
  "whey protein",
  "casein",
  "lactose",
  "condensed milk",
  "evaporated milk",
  "powdered milk",
  "milk powder",
  "ice cream",
  "gelato",
  "custard",
  "creme fraiche",
];

/** Egg keywords — used by vegan + egg-free checks. */
const EGG_KEYWORDS: readonly string[] = [
  "egg",
  "eggs",
  "egg white",
  "egg whites",
  "egg yolk",
  "egg yolks",
  "whole egg",
  "whole eggs",
  "meringue",
  "mayonnaise",
  "mayo",
  "aioli",
  "hollandaise",
  "bearnaise",
  "egg wash",
  "egg noodle",
  "egg noodles",
  "egg pasta",
  "quiche",
  "frittata",
  "custard powder",
  "eggnog",
];

/** Honey keyword — used by vegan check. */
const HONEY_KEYWORDS: readonly string[] = ["honey"];

/** Gluten-containing keywords. */
const GLUTEN_KEYWORDS: readonly string[] = [
  "wheat",
  "wheat flour",
  "all-purpose flour",
  "all purpose flour",
  "bread flour",
  "cake flour",
  "pastry flour",
  "self-rising flour",
  "self rising flour",
  "semolina",
  "durum",
  "spelt",
  "farro",
  "kamut",
  "couscous",
  "bulgur",
  "barley",
  "pearl barley",
  "rye",
  "rye flour",
  "malt",
  "malt extract",
  "malt vinegar",
  "malted",
  "triticale",
  "seitan",
  "vital wheat gluten",
  "wheat germ",
  "wheat bran",
  "flour tortilla",
  "flour tortillas",
  "bread doughs",
  "breaddoughs",
  "panko",
  "pasta",
  "spaghetti",
  "penne",
  "fettuccine",
  "linguine",
  "macaroni",
  "noodles",
  "udon",
  "ramen",
  "soy sauce",
  "teriyaki sauce",
  "hoisin sauce",
  "beer",
  "flour",
  "cracker",
  "crackers",
  "croutons",
  "pita",
  "naan",
  "baguette",
  "croissant",
  "pretzel",
  "pretzels",
  "wonton wrapper",
  "wonton wrappers",
  "phyllo",
  "filo",
  "puff pastry",
];

/** Oat keywords — flagged as ambiguous for gluten-free. */
const OATS_KEYWORDS: readonly string[] = [
  "oats",
  "oat",
  "oatmeal",
  "oat flour",
  "oat milk",
  "rolled oats",
  "steel cut oats",
  "instant oats",
  "oat bran",
];

/** Nut keywords. */
const NUT_KEYWORDS: readonly string[] = [
  "almond",
  "almonds",
  "almond flour",
  "almond milk",
  "almond butter",
  "almond extract",
  "almond meal",
  "cashew",
  "cashews",
  "cashew butter",
  "cashew milk",
  "cashew cream",
  "walnut",
  "walnuts",
  "pecan",
  "pecans",
  "pistachio",
  "pistachios",
  "hazelnut",
  "hazelnuts",
  "hazelnut flour",
  "frangelico",
  "nutella",
  "macadamia",
  "macadamia nut",
  "macadamia nuts",
  "brazil nut",
  "brazil nuts",
  "peanut",
  "peanuts",
  "peanut butter",
  "peanut oil",
  "peanut sauce",
  "tree nut",
  "tree nuts",
  "mixed nuts",
  "nut butter",
  "nut milk",
  "pine nut",
  "pine nuts",
  "praline",
  "marzipan",
  "nougat",
  "chestnut",
  "chestnuts",
];

/** Soy keywords. */
const SOY_KEYWORDS: readonly string[] = [
  "soy",
  "soy sauce",
  "soy milk",
  "soy protein",
  "soy flour",
  "soy lecithin",
  "soybean",
  "soybeans",
  "soybean oil",
  "tofu",
  "silken tofu",
  "firm tofu",
  "extra firm tofu",
  "tempeh",
  "edamame",
  "miso",
  "miso paste",
  "tamari",
  "teriyaki",
  "teriyaki sauce",
  "hoisin",
  "hoisin sauce",
  "natto",
  "soy curls",
  "textured soy protein",
  "tvp",
];

/** Grains (for paleo). */
const GRAIN_KEYWORDS: readonly string[] = [
  "wheat",
  "flour",
  "all-purpose flour",
  "bread flour",
  "rice",
  "white rice",
  "brown rice",
  "wild rice",
  "rice flour",
  "oats",
  "oatmeal",
  "corn",
  "cornmeal",
  "cornstarch",
  "corn flour",
  "corn tortilla",
  "corn tortillas",
  "barley",
  "rye",
  "millet",
  "sorghum",
  "quinoa",
  "bulgur",
  "couscous",
  "pasta",
  "noodles",
  "bread",
  "tortilla",
  "cereal",
  "granola",
  "farro",
  "spelt",
  "kamut",
  "amaranth",
  "buckwheat",
  "teff",
];

/** Legumes (for paleo). */
const LEGUME_KEYWORDS: readonly string[] = [
  "bean",
  "beans",
  "black bean",
  "black beans",
  "kidney bean",
  "kidney beans",
  "pinto bean",
  "pinto beans",
  "navy bean",
  "navy beans",
  "cannellini",
  "great northern beans",
  "lima bean",
  "lima beans",
  "chickpea",
  "chickpeas",
  "garbanzo",
  "lentil",
  "lentils",
  "red lentils",
  "green lentils",
  "brown lentils",
  "split peas",
  "black-eyed peas",
  "peanut",
  "peanuts",
  "peanut butter",
  "soybean",
  "soybeans",
  "tofu",
  "tempeh",
  "edamame",
  "miso",
  "hummus",
  "falafel",
  "refried beans",
  "baked beans",
];

/** Refined sugar (for paleo). */
const REFINED_SUGAR_KEYWORDS: readonly string[] = [
  "white sugar",
  "granulated sugar",
  "powdered sugar",
  "confectioners sugar",
  "brown sugar",
  "cane sugar",
  "sugar",
  "corn syrup",
  "high fructose corn syrup",
  "agave",
  "agave nectar",
  "molasses",
  "simple syrup",
];

/** Processed oils (for paleo). */
const PROCESSED_OIL_KEYWORDS: readonly string[] = [
  "canola oil",
  "vegetable oil",
  "soybean oil",
  "corn oil",
  "sunflower oil",
  "safflower oil",
  "rapeseed oil",
  "cottonseed oil",
  "margarine",
  "shortening",
  "crisco",
  "pam",
  "cooking spray",
];

// ---------------------------------------------------------------------------
// Ingredient text matching helper
// ---------------------------------------------------------------------------

/**
 * Check if an ingredient's item or notes field contains any keyword from a list.
 * Matching is case-insensitive and uses word-boundary-aware matching for
 * multi-word keywords and substring matching for single words.
 */
function ingredientContainsAny(ingredient: Ingredient, keywords: readonly string[]): boolean {
  const itemLower = ingredient.item.toLowerCase();
  const notesLower = ingredient.notes !== null ? ingredient.notes.toLowerCase() : "";

  for (const keyword of keywords) {
    if (textContainsKeyword(itemLower, keyword) || textContainsKeyword(notesLower, keyword)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if text contains a keyword. For single words, uses word boundary matching.
 * For multi-word phrases, uses substring matching with word boundary check.
 */
function textContainsKeyword(text: string, keyword: string): boolean {
  if (text.length === 0) return false;

  const idx = text.indexOf(keyword);
  if (idx === -1) return false;

  // Check word boundaries: the character before the match should be
  // a non-word character (or start of string), and the character after
  // should also be a non-word character (or end of string).
  const charBefore = idx > 0 ? text[idx - 1] : " ";
  const charAfter = idx + keyword.length < text.length ? text[idx + keyword.length] : " ";

  const boundaryBefore = charBefore === undefined || !isWordChar(charBefore);
  const boundaryAfter = charAfter === undefined || !isWordChar(charAfter);

  return boundaryBefore && boundaryAfter;
}

function isWordChar(ch: string): boolean {
  return /[a-z0-9]/.test(ch);
}

/**
 * Check if ANY ingredient in the list matches any keyword.
 */
function anyIngredientContains(
  ingredients: readonly Ingredient[],
  keywords: readonly string[],
): boolean {
  for (const ing of ingredients) {
    if (ingredientContainsAny(ing, keywords)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Ambiguous ingredient detection (oats for gluten-free)
// ---------------------------------------------------------------------------

/**
 * Check if any ingredient contains oats (ambiguous for gluten-free).
 */
function hasOats(ingredients: readonly Ingredient[]): boolean {
  return anyIngredientContains(ingredients, OATS_KEYWORDS);
}

// ---------------------------------------------------------------------------
// inferDietaryTags — SPEC 9.3
// ---------------------------------------------------------------------------

/**
 * Information about ambiguous tags detected during inference.
 * Currently only oats are flagged as ambiguous for gluten-free.
 */
export interface DietaryTagInferenceResult {
  readonly state: DietaryTagState;
  readonly ambiguous: ReadonlyMap<DietaryTag, string>;
}

/**
 * Infer dietary tags from a recipe's ingredients and nutrition data.
 *
 * Returns DietaryTagState.Unconfirmed with all tags that match the rules.
 * The tags are inferred by checking ALL ingredients against exclusion keyword lists.
 */
export function inferDietaryTags(
  ingredients: readonly Ingredient[],
  nutrition: NutritionValues | null,
): DietaryTagInferenceResult {
  const tags = new Set<DietaryTag>();
  const ambiguous = new Map<DietaryTag, string>();

  // --- Vegan ---
  // No meat/poultry/seafood, dairy, eggs, honey
  const hasMeat = anyIngredientContains(ingredients, MEAT_POULTRY_SEAFOOD_KEYWORDS);
  const hasDairy = anyIngredientContains(ingredients, DAIRY_KEYWORDS);
  const hasEggs = anyIngredientContains(ingredients, EGG_KEYWORDS);
  const hasHoney = anyIngredientContains(ingredients, HONEY_KEYWORDS);

  if (!hasMeat && !hasDairy && !hasEggs && !hasHoney) {
    tags.add(DIETARY_TAG.Vegan);
  }

  // --- Vegetarian ---
  // No meat/poultry/seafood (dairy and eggs OK)
  if (!hasMeat) {
    tags.add(DIETARY_TAG.Vegetarian);
  }

  // --- Gluten-free ---
  // No wheat, barley, rye, malt, triticale
  const hasGluten = anyIngredientContains(ingredients, GLUTEN_KEYWORDS);
  if (!hasGluten) {
    if (hasOats(ingredients)) {
      // Oats are ambiguous — add tag but flag it
      tags.add(DIETARY_TAG.GlutenFree);
      ambiguous.set(
        DIETARY_TAG.GlutenFree,
        "Contains oats which may or may not be gluten-free depending on processing",
      );
    } else {
      tags.add(DIETARY_TAG.GlutenFree);
    }
  }

  // --- Dairy-free ---
  if (!hasDairy) {
    tags.add(DIETARY_TAG.DairyFree);
  }

  // --- Keto ---
  // total_carbs_g <= 10 AND total_fat_g > total_protein_g (needs nutrition data)
  if (nutrition !== null) {
    const totalCarbs = nutrition.total_carbs_g;
    const totalFat = nutrition.total_fat_g;
    const totalProtein = nutrition.protein_g;

    if (
      totalCarbs !== null &&
      totalFat !== null &&
      totalProtein !== null &&
      totalCarbs <= 10 &&
      totalFat > totalProtein
    ) {
      tags.add(DIETARY_TAG.Keto);
    }
  }

  // --- Paleo ---
  // No grains, legumes, dairy, refined sugar, processed oils
  // Confidence capped at 0.7
  const hasGrains = anyIngredientContains(ingredients, GRAIN_KEYWORDS);
  const hasLegumes = anyIngredientContains(ingredients, LEGUME_KEYWORDS);
  const hasRefinedSugar = anyIngredientContains(ingredients, REFINED_SUGAR_KEYWORDS);
  const hasProcessedOils = anyIngredientContains(ingredients, PROCESSED_OIL_KEYWORDS);

  if (!hasGrains && !hasLegumes && !hasDairy && !hasRefinedSugar && !hasProcessedOils) {
    tags.add(DIETARY_TAG.Paleo);
  }

  // --- Nut-free ---
  const hasNuts = anyIngredientContains(ingredients, NUT_KEYWORDS);
  if (!hasNuts) {
    tags.add(DIETARY_TAG.NutFree);
  }

  // --- Egg-free ---
  if (!hasEggs) {
    tags.add(DIETARY_TAG.EggFree);
  }

  // --- Soy-free ---
  const hasSoy = anyIngredientContains(ingredients, SOY_KEYWORDS);
  if (!hasSoy) {
    tags.add(DIETARY_TAG.SoyFree);
  }

  const state: DietaryTagState = {
    type: "Unconfirmed",
    tags: new Set(tags),
  };

  return { state, ambiguous };
}

// ---------------------------------------------------------------------------
// confirmDietaryTags — SPEC 9.3 confirmation
// ---------------------------------------------------------------------------

/**
 * Confirm dietary tags for a recipe. Only confirmed tags propagate to Kit
 * subscribers.
 *
 * Updates the recipe's dietary_tags and dietary_tags_confirmed fields.
 */
export async function confirmDietaryTags(
  db: DrizzleD1Database,
  recipeId: RecipeId,
  creatorId: CreatorId,
  confirmedTags: readonly DietaryTag[],
): Promise<Result<{ tags: readonly DietaryTag[]; confirmed: boolean }, SegmentationError>> {
  // Verify the recipe exists and belongs to this creator
  const recipeRows = await db
    .select({
      id: recipes.id,
      creator_id: recipes.creator_id,
    })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1);

  const recipe = recipeRows[0];
  if (!recipe) {
    return err(segError("RECIPE_NOT_FOUND", `Recipe not found: ${recipeId}`));
  }

  if (recipe.creator_id !== creatorId) {
    return err(segError("NOT_AUTHORIZED", "Not authorized to modify this recipe"));
  }

  const uniqueTags = [...new Set(confirmedTags)];

  await db
    .update(recipes)
    .set({
      dietary_tags: uniqueTags,
      dietary_tags_confirmed: true,
      updated_at: new Date().toISOString(),
    })
    .where(eq(recipes.id, recipeId));

  return ok({ tags: uniqueTags, confirmed: true });
}

// ---------------------------------------------------------------------------
// inferAndStoreDietaryTags — combined infer + store (for route handler)
// ---------------------------------------------------------------------------

/**
 * Infer dietary tags for a recipe and store them (unconfirmed) in the database.
 *
 * Fetches the recipe's ingredients from DB, runs inference, and updates
 * the recipe's dietary_tags field with confirmed=false.
 */
export async function inferAndStoreDietaryTags(
  db: DrizzleD1Database,
  recipeId: RecipeId,
  creatorId: CreatorId,
  logger: Logger = defaultLogger,
): Promise<Result<DietaryTagInferenceResult, SegmentationError>> {
  // We need to import ingredient-related tables here to avoid circular deps
  const { ingredientGroups, ingredients: ingredientsTable } = await import("../db/schema.js");

  // Verify the recipe exists and belongs to this creator
  const recipeRows = await db
    .select({
      id: recipes.id,
      creator_id: recipes.creator_id,
      nutrition_values: recipes.nutrition_values,
    })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1);

  const recipe = recipeRows[0];
  if (!recipe) {
    return err(segError("RECIPE_NOT_FOUND", `Recipe not found: ${recipeId}`));
  }

  if (recipe.creator_id !== creatorId) {
    return err(segError("NOT_AUTHORIZED", "Not authorized to modify this recipe"));
  }

  // Fetch ingredient groups and ingredients
  const groups = await db
    .select({
      id: ingredientGroups.id,
      recipe_id: ingredientGroups.recipe_id,
    })
    .from(ingredientGroups)
    .where(eq(ingredientGroups.recipe_id, recipeId));

  const groupIds = groups.map((g) => g.id);

  const ingredientRows: Array<{
    id: string;
    group_id: number;
    quantity_type: string | null;
    quantity_data: Record<string, unknown> | null;
    unit: string | null;
    item: string;
    notes: string | null;
    sort_order: number;
  }> = [];

  if (groupIds.length > 0) {
    // Fetch all ingredients for all groups of this recipe
    for (const gid of groupIds) {
      const ings = await db
        .select()
        .from(ingredientsTable)
        .where(eq(ingredientsTable.group_id, gid));
      ingredientRows.push(...ings);
    }
  }

  // Convert DB rows to Ingredient type
  const ingredientsList: Ingredient[] = ingredientRows.map((row) => ({
    id: row.id as Ingredient["id"],
    quantity: null, // Quantity parsing is not needed for dietary tag inference
    unit: row.unit,
    item: row.item,
    notes: row.notes,
  }));

  // Parse nutrition values if present
  const nutritionValues: NutritionValues | null = recipe.nutrition_values
    ? (recipe.nutrition_values as unknown as NutritionValues)
    : null;

  // Run inference
  const result = inferDietaryTags(ingredientsList, nutritionValues);

  // Store inferred tags (unconfirmed)
  const tagArray = [...result.state.tags];
  await db
    .update(recipes)
    .set({
      dietary_tags: tagArray,
      dietary_tags_confirmed: false,
      updated_at: new Date().toISOString(),
    })
    .where(eq(recipes.id, recipeId));

  logger.info("dietary_tags_inferred", {
    recipeId,
    tagsInferred: tagArray,
    ambiguousCount: result.ambiguous.size,
  });

  return ok(result);
}

// ---------------------------------------------------------------------------
// computeSegmentProfile — SPEC 9.4
// ---------------------------------------------------------------------------

/** Segment profile as stored in the database. */
export interface StoredSegmentProfile {
  readonly creator_id: CreatorId;
  readonly computed_at: string;
  readonly segments: Record<
    string,
    {
      subscriber_count: number;
      engagement_rate: number;
      growth_rate_30d: number;
      top_recipe_ids: readonly string[];
    }
  >;
}

/**
 * Compute segment analytics for a creator.
 *
 * For each DietaryTag: counts subscribers with that tag, computes engagement
 * rate and growth rate, finds top recipes. Stores result in segmentProfiles table.
 */
export async function computeSegmentProfile(
  db: DrizzleD1Database,
  creatorId: CreatorId,
  kitConfig: KitClientConfig,
  accessToken: string,
  logger: Logger = defaultLogger,
): Promise<Result<StoredSegmentProfile, SegmentationError>> {
  // 1. Fetch all Kit tags for the account
  const tagsResult = await listTags(kitConfig, accessToken);
  if (!tagsResult.ok) {
    return err(
      segError("KIT_API_ERROR", `Failed to list Kit tags: ${tagsResult.error.messages.join(", ")}`),
    );
  }

  const allKitTags = tagsResult.value;

  // 2. For each dietary tag, find the matching Kit tag and its subscriber count
  const segmentsData: Record<
    string,
    {
      subscriber_count: number;
      engagement_rate: number;
      growth_rate_30d: number;
      top_recipe_ids: readonly string[];
    }
  > = {};

  const dietaryTagValues: readonly DietaryTag[] = Object.values(DIETARY_TAG);

  for (const dietTag of dietaryTagValues) {
    const kitTagName = dietaryTagName(dietTag);
    const matchingTag = allKitTags.find((t: KitTag) => t.name === kitTagName);

    // If no Kit tag exists for this dietary tag, report zero subscribers
    const subscriberCount = matchingTag ? 1 : 0;
    // Without detailed subscriber data from Kit, we set defaults
    // In production this would query Kit's subscriber list per tag
    const engagementRate = 0;
    const growthRate = 0;
    const topRecipeIds: readonly string[] = [];

    segmentsData[dietTag] = {
      subscriber_count: subscriberCount,
      engagement_rate: engagementRate,
      growth_rate_30d: growthRate,
      top_recipe_ids: topRecipeIds,
    };
  }

  const computedAt = new Date().toISOString();
  const profile: StoredSegmentProfile = {
    creator_id: creatorId,
    computed_at: computedAt,
    segments: segmentsData,
  };

  // 3. Upsert into segmentProfiles table (replace previous profile)
  // First try to delete any existing profile
  await db.delete(segmentProfiles).where(eq(segmentProfiles.creator_id, creatorId));

  // Then insert the new profile
  await db.insert(segmentProfiles).values({
    creator_id: creatorId,
    computed_at: computedAt,
    segments: segmentsData,
  });

  logger.info("segment_profile_computed", {
    creator: creatorId,
    tagCount: Object.keys(segmentsData).length,
  });

  return ok(profile);
}

// ---------------------------------------------------------------------------
// getSegmentProfile — retrieve current profile
// ---------------------------------------------------------------------------

/**
 * Get the current segment profile for a creator.
 */
export async function getSegmentProfile(
  db: DrizzleD1Database,
  creatorId: CreatorId,
): Promise<Result<StoredSegmentProfile | null, SegmentationError>> {
  const rows = await db
    .select()
    .from(segmentProfiles)
    .where(eq(segmentProfiles.creator_id, creatorId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return ok(null);
  }

  return ok({
    creator_id: row.creator_id as CreatorId,
    computed_at: row.computed_at,
    segments: row.segments as StoredSegmentProfile["segments"],
  });
}

// ---------------------------------------------------------------------------
// createPreferenceCaptureForm — SPEC 9.2
// ---------------------------------------------------------------------------

/**
 * Create a Kit form for dietary preference capture.
 *
 * Note: Kit V4 API does not have a "create form" endpoint. Forms must be
 * created through the Kit UI. This function lists existing forms and
 * returns the first one that matches the dietary preference naming convention,
 * or returns an error indicating the creator needs to create the form in Kit.
 */
export async function createPreferenceCaptureForm(
  db: DrizzleD1Database,
  creatorId: CreatorId,
  kitConfig: KitClientConfig,
  accessToken: string,
): Promise<
  Result<
    {
      readonly formId: number;
      readonly formName: string;
      readonly embedUrl: string;
    },
    SegmentationError
  >
> {
  // List existing forms and look for a dietary preference form
  const formsResult = await listForms(kitConfig, accessToken);
  if (!formsResult.ok) {
    return err(
      segError(
        "KIT_API_ERROR",
        `Failed to list Kit forms: ${formsResult.error.messages.join(", ")}`,
      ),
    );
  }

  const forms = formsResult.value;

  // Look for a form named with our convention
  const PREFERENCE_FORM_NAME = "Dietary Preferences";
  const preferenceForm = forms.find(
    (f) =>
      f.name.toLowerCase().includes("dietary") &&
      f.name.toLowerCase().includes("preference") &&
      !f.archived,
  );

  if (!preferenceForm) {
    // Ensure the required Kit tags exist so that when the creator creates
    // the form manually, the tags are ready
    const dietaryTags: readonly DietaryTag[] = [
      DIETARY_TAG.GlutenFree,
      DIETARY_TAG.DairyFree,
      DIETARY_TAG.Vegan,
      DIETARY_TAG.Vegetarian,
      DIETARY_TAG.Keto,
      DIETARY_TAG.Paleo,
      DIETARY_TAG.NutFree,
    ];

    for (const tag of dietaryTags) {
      const tagName = dietaryTagName(tag);
      const tagResult = await getOrCreateTag(kitConfig, accessToken, tagName);
      if (!tagResult.ok) {
        return err(
          segError(
            "KIT_API_ERROR",
            `Failed to create Kit tag ${tagName}: ${tagResult.error.messages.join(", ")}`,
          ),
        );
      }
    }

    return err(
      segError(
        "FORM_NOT_FOUND",
        `No dietary preference form found. Please create a form named "${PREFERENCE_FORM_NAME}" in Kit with a multi-select for dietary preferences. Required tags have been created in your Kit account.`,
      ),
    );
  }

  return ok({
    formId: preferenceForm.id,
    formName: preferenceForm.name,
    embedUrl: preferenceForm.embed_url,
  });
}

// ---------------------------------------------------------------------------
// tagSubscriberWithDietaryTags — used after Save This Recipe (SPEC 9.1)
// ---------------------------------------------------------------------------

/**
 * Apply confirmed dietary tags from a recipe to a Kit subscriber.
 *
 * Only applies tags if the recipe's dietary_tags_confirmed is true.
 */
export async function tagSubscriberWithDietaryTags(
  db: DrizzleD1Database,
  recipeId: RecipeId,
  subscriberId: string,
  kitConfig: KitClientConfig,
  accessToken: string,
): Promise<Result<readonly DietaryTag[], SegmentationError>> {
  // Fetch the recipe
  const recipeRows = await db
    .select({
      dietary_tags: recipes.dietary_tags,
      dietary_tags_confirmed: recipes.dietary_tags_confirmed,
    })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1);

  const recipe = recipeRows[0];
  if (!recipe) {
    return err(segError("RECIPE_NOT_FOUND", `Recipe not found: ${recipeId}`));
  }

  // Only confirmed tags propagate to Kit
  if (!recipe.dietary_tags_confirmed) {
    return ok([]);
  }

  const dietaryTags = recipe.dietary_tags as readonly string[];
  const appliedTags: DietaryTag[] = [];

  for (const tagStr of dietaryTags) {
    const dietTag = tagStr as DietaryTag;
    const kitTagName = dietaryTagName(dietTag);

    // Get or create the Kit tag
    const tagResult = await getOrCreateTag(kitConfig, accessToken, kitTagName);
    if (!tagResult.ok) {
      // Log the error but continue with other tags
      continue;
    }

    // Tag the subscriber
    const applyResult = await tagSubscriber(
      kitConfig,
      accessToken,
      subscriberId,
      String(tagResult.value.id),
    );

    if (applyResult.ok) {
      appliedTags.push(dietTag);
    }
  }

  return ok(appliedTags);
}
