/**
 * API response adapter layer.
 *
 * The backend returns recipes in a flat relational format
 * (RecipeWithRelations) while the frontend Recipe type uses nested
 * value objects. This module bridges the gap.
 */

// ---------------------------------------------------------------------------
// Raw API response shapes
// ---------------------------------------------------------------------------

export interface ApiRecipeRow {
  readonly id: string;
  readonly creator_id: string;
  readonly title: string;
  readonly slug: string;
  readonly description: string | null;
  readonly source_type: string;
  readonly source_data: Record<string, unknown> | null;
  readonly status: string;
  readonly email_ready: boolean;
  readonly prep_minutes: number | null;
  readonly cook_minutes: number | null;
  readonly total_minutes: number | null;
  readonly yield_quantity: number | null;
  readonly yield_unit: string | null;
  readonly notes: string | null;
  readonly dietary_tags: readonly string[] | string;
  readonly dietary_tags_confirmed: boolean;
  readonly cuisine: string | null;
  readonly meal_types: readonly string[] | string;
  readonly seasons: readonly string[] | string;
  readonly nutrition_source: string | null;
  readonly nutrition_values: Record<string, unknown> | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ApiIngredientRow {
  readonly id: string;
  readonly group_id: number;
  readonly quantity_type: string | null;
  readonly quantity_data: Record<string, unknown> | null;
  readonly unit: string | null;
  readonly item: string;
  readonly notes: string | null;
  readonly sort_order: number;
}

export interface ApiIngredientGroupRow {
  readonly id: number;
  readonly recipe_id: string;
  readonly label: string | null;
  readonly sort_order: number;
  readonly ingredients: readonly ApiIngredientRow[];
}

export interface ApiInstructionRow {
  readonly id: string;
  readonly group_id: number;
  readonly body: string;
  readonly sort_order: number;
}

export interface ApiInstructionGroupRow {
  readonly id: number;
  readonly recipe_id: string;
  readonly label: string | null;
  readonly sort_order: number;
  readonly instructions: readonly ApiInstructionRow[];
}

export interface ApiPhotoRow {
  readonly id: string;
  readonly recipe_id: string;
  readonly url: string;
  readonly alt_text: string | null;
  readonly width: number;
  readonly height: number;
  readonly sort_order: number;
}

export interface ApiRecipeResponse {
  readonly recipe: ApiRecipeRow;
  readonly ingredientGroups: readonly ApiIngredientGroupRow[];
  readonly instructionGroups: readonly ApiInstructionGroupRow[];
  readonly photos: readonly ApiPhotoRow[];
}

// ---------------------------------------------------------------------------
// Normalized frontend types (simpler than the full shared Recipe type)
// ---------------------------------------------------------------------------

export interface NormalizedQuantity {
  readonly type: string;
  readonly value?: number;
  readonly numerator?: number;
  readonly denominator?: number;
  readonly whole?: number;
}

export interface NormalizedIngredient {
  readonly id: string;
  readonly quantity: NormalizedQuantity | null;
  readonly unit: string | null;
  readonly item: string;
  readonly notes: string | null;
}

export interface NormalizedIngredientGroup {
  readonly label: string | null;
  readonly ingredients: readonly NormalizedIngredient[];
}

export interface NormalizedInstruction {
  readonly id: string;
  readonly body: string;
}

export interface NormalizedInstructionGroup {
  readonly label: string | null;
  readonly instructions: readonly NormalizedInstruction[];
}

export interface NormalizedPhoto {
  readonly id: string;
  readonly url: string;
  readonly alt_text: string | null;
  readonly width: number;
  readonly height: number;
}

export interface NormalizedRecipe {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly description: string | null;
  readonly status: string;
  readonly email_ready: boolean;
  readonly timing: {
    readonly prep_minutes: number | null;
    readonly cook_minutes: number | null;
    readonly total_minutes: number | null;
  };
  readonly yield: { readonly quantity: number; readonly unit: string } | null;
  readonly notes: string | null;
  readonly cuisine: string | null;
  readonly dietary_tags: readonly string[];
  readonly dietary_tags_confirmed: boolean;
  readonly meal_types: readonly string[];
  readonly seasons: readonly string[];
  readonly ingredientGroups: readonly NormalizedIngredientGroup[];
  readonly instructionGroups: readonly NormalizedInstructionGroup[];
  readonly photos: readonly NormalizedPhoto[];
  readonly created_at: string;
  readonly updated_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJsonArrayField(value: readonly string[] | string | null | undefined): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value as string[];
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed as string[];
    } catch {
      // not valid JSON
    }
    return [];
  }
  return [];
}

function normalizeQuantity(
  quantityType: string | null,
  quantityData: Record<string, unknown> | null,
): NormalizedQuantity | null {
  if (quantityType === null || quantityData === null) return null;
  return quantityData as unknown as NormalizedQuantity;
}

// ---------------------------------------------------------------------------
// Normalize API response to frontend-friendly shape
// ---------------------------------------------------------------------------

export function normalizeRecipeResponse(response: unknown): NormalizedRecipe {
  const data = response as Record<string, unknown>;

  // The API returns { recipe, ingredientGroups, instructionGroups, photos }
  const raw = (data["recipe"] ?? data) as ApiRecipeRow;
  const rawIngredientGroups = (data["ingredientGroups"] ?? []) as readonly ApiIngredientGroupRow[];
  const rawInstructionGroups = (data["instructionGroups"] ??
    []) as readonly ApiInstructionGroupRow[];
  const rawPhotos = (data["photos"] ?? []) as readonly ApiPhotoRow[];

  const ingredientGroups: NormalizedIngredientGroup[] = rawIngredientGroups.map((g) => ({
    label: g.label,
    ingredients: g.ingredients.map((ing) => ({
      id: ing.id,
      quantity: normalizeQuantity(ing.quantity_type, ing.quantity_data),
      unit: ing.unit,
      item: ing.item,
      notes: ing.notes,
    })),
  }));

  const instructionGroups: NormalizedInstructionGroup[] = rawInstructionGroups.map((g) => ({
    label: g.label,
    instructions: g.instructions.map((inst) => ({
      id: inst.id,
      body: inst.body,
    })),
  }));

  const photos: NormalizedPhoto[] = rawPhotos.map((p) => ({
    id: p.id,
    url: p.url,
    alt_text: p.alt_text,
    width: p.width,
    height: p.height,
  }));

  return {
    id: raw.id,
    title: raw.title,
    slug: raw.slug,
    description: raw.description,
    status: raw.status,
    email_ready: raw.email_ready,
    timing: {
      prep_minutes: raw.prep_minutes,
      cook_minutes: raw.cook_minutes,
      total_minutes: raw.total_minutes,
    },
    yield:
      raw.yield_quantity !== null && raw.yield_unit !== null
        ? { quantity: raw.yield_quantity, unit: raw.yield_unit }
        : null,
    notes: raw.notes,
    cuisine: raw.cuisine,
    dietary_tags: parseJsonArrayField(raw.dietary_tags),
    dietary_tags_confirmed: raw.dietary_tags_confirmed,
    meal_types: parseJsonArrayField(raw.meal_types),
    seasons: parseJsonArrayField(raw.seasons),
    ingredientGroups,
    instructionGroups,
    photos,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}
