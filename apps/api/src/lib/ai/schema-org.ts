// ---------------------------------------------------------------------------
// Schema.org recipe extraction utilities
// ---------------------------------------------------------------------------
// Extracted from import.ts for reuse by the AI agent tools.
// ---------------------------------------------------------------------------

import type { RecipeExtract, Url } from "@dough/shared";
import { createUrl } from "@dough/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SchemaOrgRecipe {
  readonly name: string | null;
  readonly description: string | null;
  readonly recipeIngredient: readonly string[];
  readonly recipeInstructions: readonly (string | { readonly text: string })[];
  readonly prepTime: string | null;
  readonly cookTime: string | null;
  readonly totalTime: string | null;
  readonly recipeYield: string | null;
  readonly image: string | readonly string[] | null;
}

// ---------------------------------------------------------------------------
// Duration parsing
// ---------------------------------------------------------------------------

/**
 * Parse ISO 8601 duration (PT30M, PT1H30M, etc.) to minutes.
 */
export function parseDuration(iso: string | null): number | null {
  if (iso === null) return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(iso);
  if (match === null) return null;
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  return hours * 60 + minutes;
}

// ---------------------------------------------------------------------------
// Schema.org extraction
// ---------------------------------------------------------------------------

/**
 * Extract schema.org Recipe JSON-LD from HTML.
 * Returns null if not found or incomplete.
 */
export function extractSchemaOrgRecipe(html: string): SchemaOrgRecipe | null {
  const ldJsonRegex =
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match = ldJsonRegex.exec(html);

  while (match !== null) {
    const jsonText = match[1];
    if (jsonText !== undefined) {
      try {
        const parsed: unknown = JSON.parse(jsonText);
        const recipe = findRecipeInLdJson(parsed);
        if (recipe !== null) {
          return recipe;
        }
      } catch {
        // Invalid JSON, try next block
      }
    }
    match = ldJsonRegex.exec(html);
  }

  return null;
}

function findRecipeInLdJson(data: unknown): SchemaOrgRecipe | null {
  if (data === null || typeof data !== "object") return null;

  if (Array.isArray(data)) {
    for (const item of data) {
      const result = findRecipeInLdJson(item);
      if (result !== null) return result;
    }
    return null;
  }

  const obj = data as Record<string, unknown>;
  const typeVal = obj["@type"];
  const isRecipe = typeVal === "Recipe" || (Array.isArray(typeVal) && typeVal.includes("Recipe"));

  if (isRecipe) {
    return parseSchemaOrgRecipe(obj);
  }

  const graph = obj["@graph"];
  if (Array.isArray(graph)) {
    for (const item of graph) {
      const result = findRecipeInLdJson(item);
      if (result !== null) return result;
    }
  }

  return null;
}

function parseSchemaOrgRecipe(obj: Record<string, unknown>): SchemaOrgRecipe | null {
  const name = typeof obj["name"] === "string" ? obj["name"] : null;
  const description = typeof obj["description"] === "string" ? obj["description"] : null;

  const rawIngredients = obj["recipeIngredient"];
  const recipeIngredient: string[] = Array.isArray(rawIngredients)
    ? rawIngredients.filter((i): i is string => typeof i === "string")
    : [];

  const rawInstructions = obj["recipeInstructions"];
  const recipeInstructions: (string | { readonly text: string })[] = [];
  if (Array.isArray(rawInstructions)) {
    for (const inst of rawInstructions) {
      if (typeof inst === "string") {
        recipeInstructions.push(inst);
      } else if (
        inst !== null &&
        typeof inst === "object" &&
        "text" in inst &&
        typeof (inst as Record<string, unknown>)["text"] === "string"
      ) {
        recipeInstructions.push({
          text: (inst as Record<string, unknown>)["text"] as string,
        });
      }
    }
  }

  const prepTime = typeof obj["prepTime"] === "string" ? obj["prepTime"] : null;
  const cookTime = typeof obj["cookTime"] === "string" ? obj["cookTime"] : null;
  const totalTime = typeof obj["totalTime"] === "string" ? obj["totalTime"] : null;
  const recipeYield = typeof obj["recipeYield"] === "string" ? obj["recipeYield"] : null;

  let image: string | readonly string[] | null = null;
  if (typeof obj["image"] === "string") {
    image = obj["image"];
  } else if (Array.isArray(obj["image"])) {
    image = obj["image"].filter((i): i is string => typeof i === "string");
  }

  return {
    name,
    description,
    recipeIngredient,
    recipeInstructions,
    prepTime,
    cookTime,
    totalTime,
    recipeYield,
    image,
  };
}

// ---------------------------------------------------------------------------
// Completeness check
// ---------------------------------------------------------------------------

/**
 * Check if a schema.org recipe is complete enough to use directly.
 */
export function isSchemaOrgComplete(recipe: SchemaOrgRecipe): boolean {
  return (
    recipe.name !== null &&
    recipe.name.length > 0 &&
    recipe.recipeIngredient.length > 0 &&
    recipe.recipeInstructions.length > 0
  );
}

// ---------------------------------------------------------------------------
// Conversion to RecipeExtract
// ---------------------------------------------------------------------------

/**
 * Convert a schema.org recipe to a RecipeExtract.
 */
export function schemaOrgToExtract(recipe: SchemaOrgRecipe): RecipeExtract {
  const photoUrls: Url[] = [];
  if (typeof recipe.image === "string") {
    const url = createUrl(recipe.image);
    if (url !== null) photoUrls.push(url);
  } else if (Array.isArray(recipe.image)) {
    for (const img of recipe.image) {
      const url = createUrl(img);
      if (url !== null) photoUrls.push(url);
    }
  }

  const instructions: string[] = [];
  for (const inst of recipe.recipeInstructions) {
    if (typeof inst === "string") {
      instructions.push(inst);
    } else {
      instructions.push(inst.text);
    }
  }

  let recipeYield: { quantity: number; unit: string } | null = null;
  if (recipe.recipeYield !== null) {
    const yieldMatch = /(\d+)\s*(.*)/.exec(recipe.recipeYield);
    if (yieldMatch !== null && yieldMatch[1] !== undefined) {
      recipeYield = {
        quantity: parseInt(yieldMatch[1], 10),
        unit: yieldMatch[2]?.trim() || "servings",
      };
    }
  }

  return {
    title: recipe.name,
    description: recipe.description,
    ingredients: [
      {
        label: null,
        ingredients: recipe.recipeIngredient.map((text) => ({
          raw_text: text,
          quantity: null,
          unit: null,
          item: null,
          notes: null,
          confidence: 0.95,
        })),
      },
    ],
    instructions,
    timing: {
      prep_minutes: parseDuration(recipe.prepTime),
      cook_minutes: parseDuration(recipe.cookTime),
      total_minutes: parseDuration(recipe.totalTime),
    },
    yield: recipeYield,
    notes: null,
    photo_urls: photoUrls,
    dietary_tags: new Set(),
    confidence: {
      overall: 0.95,
      field_scores: {
        title: 0.95,
        ingredients: 0.95,
        instructions: 0.95,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// HTML text extraction
// ---------------------------------------------------------------------------

/**
 * Strip HTML tags and extract visible text content.
 * Truncates to approximately maxChars characters.
 */
export function extractVisibleText(html: string, maxChars: number = 32000): string {
  // Remove script and style blocks
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");

  // Remove all HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();

  // Truncate
  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
  }

  return text;
}
