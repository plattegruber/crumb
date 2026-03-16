/**
 * Digital Product Builder service (SPEC §8).
 *
 * Handles product assembly (ebook, meal plan, recipe card pack, lead magnet),
 * shopping list generation, AI-assisted copy, template rendering, PDF
 * rendering queue dispatch, and Kit form generation.
 *
 * All public functions return Promise<Result<T, E>>.
 */
import { eq, and, sql, desc, asc } from "drizzle-orm";
import type { Database } from "../db/index.js";
import {
  productBase,
  ebookDetails,
  mealPlanDetails,
  recipeCardPacks,
  leadMagnets,
  recipes,
  ingredientGroups,
  ingredients,
  creators,
  recipeEngagementScores,
  brandKits,
} from "../db/schema.js";
import type { CreatorScopedDb } from "../middleware/creator-scope.js";
import type { Result } from "@crumb/shared";
import { ok, err } from "@crumb/shared";
import type { EbookFormat, ProductId, RecipeId, BrandKitId } from "@crumb/shared";
import type { Env } from "../env.js";
import { createLogger, type Logger } from "../lib/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProductError =
  | { readonly type: "not_found" }
  | { readonly type: "invalid_input"; readonly message: string }
  | { readonly type: "invariant_violation"; readonly message: string }
  | { readonly type: "free_tier_limit"; readonly message: string }
  | { readonly type: "database_error"; readonly message: string };

/** Product type discriminant */
export const PRODUCT_TYPE = {
  Ebook: "Ebook",
  MealPlan: "MealPlan",
  RecipeCardPack: "RecipeCardPack",
  LeadMagnet: "LeadMagnet",
} as const;
export type ProductType = (typeof PRODUCT_TYPE)[keyof typeof PRODUCT_TYPE];

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface ChapterInput {
  readonly title: string;
  readonly intro_copy: string | null;
  readonly recipe_ids: readonly string[];
}

export interface CreateEbookInput {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly brand_kit_id: string;
  readonly template_id: string;
  readonly recipe_ids: readonly string[];
  readonly chapters: readonly ChapterInput[];
  readonly intro_copy: string | null;
  readonly author_bio: string | null;
  readonly format: EbookFormat;
  readonly suggested_price_cents: number | null;
  readonly currency?: string;
}

export interface MealPlanDayInput {
  readonly day_number: number;
  readonly breakfast: string | null;
  readonly lunch: string | null;
  readonly dinner: string | null;
  readonly snacks: readonly string[];
}

export interface CreateMealPlanInput {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly brand_kit_id: string;
  readonly template_id: string;
  readonly days: readonly MealPlanDayInput[];
  readonly suggested_price_cents: number | null;
  readonly currency?: string;
}

export interface CreateRecipeCardPackInput {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly brand_kit_id: string;
  readonly template_id: string;
  readonly recipe_ids: readonly string[];
  readonly suggested_price_cents: number | null;
  readonly currency?: string;
}

export interface ListProductsParams {
  readonly status?: string;
  readonly product_type?: string;
  readonly page?: number;
  readonly perPage?: number;
}

export interface UpdateProductInput {
  readonly title?: string;
  readonly description?: string | null;
  readonly suggested_price_cents?: number | null;
}

// ---------------------------------------------------------------------------
// Row types for return values
// ---------------------------------------------------------------------------

export interface ProductBaseRow {
  readonly id: string;
  readonly creator_id: string;
  readonly product_type: string;
  readonly status: string;
  readonly title: string;
  readonly description: string | null;
  readonly brand_kit_id: string;
  readonly template_id: string;
  readonly pdf_url: string | null;
  readonly epub_url: string | null;
  readonly kit_form_id: string | null;
  readonly kit_sequence_id: string | null;
  readonly suggested_price_cents: number | null;
  readonly currency: string;
  readonly ai_copy_reviewed: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ProductWithDetail {
  readonly base: ProductBaseRow;
  readonly detail: Record<string, unknown> | null;
}

export interface PaginatedResult<T> {
  readonly data: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly totalPages: number;
}

// ---------------------------------------------------------------------------
// AI Assistance interfaces — dependency-injected for testability
// ---------------------------------------------------------------------------

export interface ChapterGrouping {
  readonly chapter_title: string;
  readonly recipe_indices: readonly number[];
}

export interface ChapterOrganizer {
  organize(
    recipes: readonly { title: string; dietary_tags: readonly string[]; meal_types: readonly string[]; cuisine: string | null; cook_minutes: number | null }[],
  ): Promise<Result<readonly ChapterGrouping[], ProductError>>;
}

export interface GeneratedCopy {
  readonly ebook_intro: string;
  readonly chapters: readonly { title: string; intro: string }[];
}

export interface CopyGenerator {
  generate(
    metadata: { title: string; description: string | null },
    chapters: readonly ChapterInput[],
    recipe_titles: readonly string[],
  ): Promise<Result<GeneratedCopy, ProductError>>;
}

// ---------------------------------------------------------------------------
// Shopping list types
// ---------------------------------------------------------------------------

export const GROCERY_SECTIONS = [
  "Produce",
  "Dairy",
  "Meat",
  "Pantry",
  "Frozen",
  "Bakery",
  "Spices",
  "Other",
] as const;
export type GrocerySection = (typeof GROCERY_SECTIONS)[number];

export interface ShoppingListItem {
  readonly item: string;
  readonly recipe_refs: readonly string[];
}

export interface ShoppingListSection {
  readonly label: string;
  readonly items: readonly ShoppingListItem[];
}

export interface ShoppingListResult {
  readonly sections: readonly ShoppingListSection[];
  readonly generated_at: string;
}

// ---------------------------------------------------------------------------
// Ingredient → grocery section mapping
// ---------------------------------------------------------------------------

const SECTION_KEYWORDS: Record<string, GrocerySection> = {
  // Produce
  lettuce: "Produce",
  tomato: "Produce",
  tomatoes: "Produce",
  onion: "Produce",
  onions: "Produce",
  garlic: "Produce",
  lemon: "Produce",
  lemons: "Produce",
  lime: "Produce",
  limes: "Produce",
  potato: "Produce",
  potatoes: "Produce",
  carrot: "Produce",
  carrots: "Produce",
  celery: "Produce",
  broccoli: "Produce",
  spinach: "Produce",
  kale: "Produce",
  peppers: "Produce",
  cucumber: "Produce",
  avocado: "Produce",
  apple: "Produce",
  apples: "Produce",
  banana: "Produce",
  bananas: "Produce",
  berries: "Produce",
  strawberries: "Produce",
  blueberries: "Produce",
  mushroom: "Produce",
  mushrooms: "Produce",
  zucchini: "Produce",
  squash: "Produce",
  ginger: "Produce",
  herbs: "Produce",
  basil: "Produce",
  cilantro: "Produce",
  parsley: "Produce",
  mint: "Produce",
  rosemary: "Produce",
  thyme: "Produce",
  dill: "Produce",
  scallion: "Produce",
  scallions: "Produce",
  "green onion": "Produce",
  "green onions": "Produce",
  // Dairy
  milk: "Dairy",
  cream: "Dairy",
  butter: "Dairy",
  cheese: "Dairy",
  yogurt: "Dairy",
  "sour cream": "Dairy",
  egg: "Dairy",
  eggs: "Dairy",
  // Meat
  chicken: "Meat",
  beef: "Meat",
  pork: "Meat",
  lamb: "Meat",
  turkey: "Meat",
  sausage: "Meat",
  bacon: "Meat",
  ham: "Meat",
  steak: "Meat",
  shrimp: "Meat",
  salmon: "Meat",
  fish: "Meat",
  tuna: "Meat",
  // Pantry
  flour: "Pantry",
  sugar: "Pantry",
  rice: "Pantry",
  pasta: "Pantry",
  spaghetti: "Pantry",
  noodles: "Pantry",
  oil: "Pantry",
  "olive oil": "Pantry",
  "vegetable oil": "Pantry",
  vinegar: "Pantry",
  "soy sauce": "Pantry",
  broth: "Pantry",
  stock: "Pantry",
  "baking powder": "Pantry",
  "baking soda": "Pantry",
  honey: "Pantry",
  "maple syrup": "Pantry",
  beans: "Pantry",
  lentils: "Pantry",
  "canned tomatoes": "Pantry",
  "tomato paste": "Pantry",
  "coconut milk": "Pantry",
  oats: "Pantry",
  nuts: "Pantry",
  almonds: "Pantry",
  walnuts: "Pantry",
  "peanut butter": "Pantry",
  chocolate: "Pantry",
  "chocolate chips": "Pantry",
  vanilla: "Pantry",
  "vanilla extract": "Pantry",
  cornstarch: "Pantry",
  // Frozen
  "frozen peas": "Frozen",
  "frozen corn": "Frozen",
  "frozen berries": "Frozen",
  "ice cream": "Frozen",
  // Bakery
  bread: "Bakery",
  tortillas: "Bakery",
  buns: "Bakery",
  rolls: "Bakery",
  pita: "Bakery",
  // Spices
  salt: "Spices",
  pepper: "Spices",
  cinnamon: "Spices",
  cumin: "Spices",
  paprika: "Spices",
  "chili powder": "Spices",
  oregano: "Spices",
  "garlic powder": "Spices",
  "onion powder": "Spices",
  turmeric: "Spices",
  cayenne: "Spices",
  nutmeg: "Spices",
  "black pepper": "Spices",
  "red pepper flakes": "Spices",
  "bay leaves": "Spices",
  "curry powder": "Spices",
};

function categorizeIngredient(item: string): GrocerySection {
  const lower = item.toLowerCase().trim();

  // Try exact match first
  const exact = SECTION_KEYWORDS[lower];
  if (exact !== undefined) return exact;

  // Try partial match
  for (const [keyword, section] of Object.entries(SECTION_KEYWORDS)) {
    if (lower.includes(keyword)) return section;
  }

  return "Other";
}

// ---------------------------------------------------------------------------
// Shopping List Generation (§8.2)
// ---------------------------------------------------------------------------

export interface RecipeIngredientData {
  readonly recipe_id: string;
  readonly recipe_title: string;
  readonly ingredients: readonly {
    readonly item: string;
    readonly quantity_type: string | null;
    readonly quantity_data: Record<string, unknown> | null;
    readonly unit: string | null;
  }[];
}

/**
 * Consolidate ingredients across recipes into a shopping list.
 * - Merges duplicate items (same ingredient name, case-insensitive)
 * - Organizes by grocery section
 * - Tracks which recipes need each item
 */
export function generateShoppingList(
  recipeIngredients: readonly RecipeIngredientData[],
): ShoppingListResult {
  // Collect all ingredients with recipe refs, merging by lowercase item name
  const merged = new Map<string, { item: string; recipe_refs: Set<string> }>();

  for (const recipe of recipeIngredients) {
    for (const ing of recipe.ingredients) {
      const key = ing.item.toLowerCase().trim();
      const existing = merged.get(key);
      if (existing !== undefined) {
        existing.recipe_refs.add(recipe.recipe_id);
      } else {
        merged.set(key, {
          item: ing.item,
          recipe_refs: new Set([recipe.recipe_id]),
        });
      }
    }
  }

  // Group by grocery section
  const sectionMap = new Map<string, ShoppingListItem[]>();

  for (const entry of merged.values()) {
    const section = categorizeIngredient(entry.item);
    const existing = sectionMap.get(section);
    const listItem: ShoppingListItem = {
      item: entry.item,
      recipe_refs: Array.from(entry.recipe_refs),
    };
    if (existing !== undefined) {
      existing.push(listItem);
    } else {
      sectionMap.set(section, [listItem]);
    }
  }

  // Build sections in standard order
  const sections: ShoppingListSection[] = [];
  for (const sectionName of GROCERY_SECTIONS) {
    const items = sectionMap.get(sectionName);
    if (items !== undefined && items.length > 0) {
      sections.push({ label: sectionName, items });
    }
  }

  return {
    sections,
    generated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Template System
// ---------------------------------------------------------------------------

export interface BrandKitValues {
  readonly primary_color: string;
  readonly secondary_color: string | null;
  readonly accent_color: string | null;
  readonly heading_font_family: string;
  readonly body_font_family: string;
  readonly logo_url: string | null;
}

const BASIC_EBOOK_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
<style>
:root {
  --primary-color: {{brandKit.primary_color}};
  --secondary-color: {{brandKit.secondary_color}};
  --accent-color: {{brandKit.accent_color}};
  --heading-font: {{brandKit.heading_font_family}};
  --body-font: {{brandKit.body_font_family}};
}
body { font-family: var(--body-font), sans-serif; color: #333; }
h1, h2, h3 { font-family: var(--heading-font), sans-serif; color: var(--primary-color); }
.cover { text-align: center; padding: 100px 40px; }
.cover h1 { font-size: 2.5em; }
.chapter { page-break-before: always; padding: 40px; }
.recipe { margin: 20px 0; }
</style>
</head>
<body>
<div class="cover">
  <h1>{{product.title}}</h1>
  <p>{{product.description}}</p>
</div>
{{content}}
</body>
</html>`;

const BASIC_RECIPE_CARD_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
<style>
:root {
  --primary-color: {{brandKit.primary_color}};
  --secondary-color: {{brandKit.secondary_color}};
  --accent-color: {{brandKit.accent_color}};
  --heading-font: {{brandKit.heading_font_family}};
  --body-font: {{brandKit.body_font_family}};
}
body { font-family: var(--body-font), sans-serif; }
h2 { font-family: var(--heading-font), sans-serif; color: var(--primary-color); }
.card { border: 1px solid #ddd; padding: 20px; margin: 20px; page-break-after: always; }
</style>
</head>
<body>
{{content}}
</body>
</html>`;

export const TEMPLATES: Record<string, string> = {
  "ebook-basic": BASIC_EBOOK_TEMPLATE,
  "recipe-card-basic": BASIC_RECIPE_CARD_TEMPLATE,
};

/**
 * Render a template with Mustache-style variable substitution.
 * Injects BrandKit values as CSS custom properties.
 */
export function renderTemplate(
  templateId: string,
  data: Record<string, string>,
  brandKit: BrandKitValues,
): Result<string, ProductError> {
  const template = TEMPLATES[templateId];
  if (template === undefined) {
    return err({ type: "not_found" });
  }

  let rendered = template;

  // Replace brandKit variables
  rendered = rendered.replace(/\{\{brandKit\.(\w+)\}\}/g, (_match, key: string) => {
    const bkRecord = brandKit as unknown as Record<string, string | null>;
    return bkRecord[key] ?? "";
  });

  // Replace data variables
  rendered = rendered.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, key: string) => {
    return data[key] ?? "";
  });

  return ok(rendered);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;
const FREE_TIER_PUBLISHED_PRODUCT_LIMIT = 1;
const defaultLogger = createLogger("product");

// ---------------------------------------------------------------------------
// Product Assembly
// ---------------------------------------------------------------------------

/**
 * Create an ebook product with recipe list, chapters, and copy.
 */
export async function createEbook(
  scopedDb: CreatorScopedDb<Database>,
  input: CreateEbookInput,
  logger: Logger = defaultLogger,
): Promise<Result<ProductWithDetail, ProductError>> {
  const { db, creatorId } = scopedDb;

  if (input.recipe_ids.length === 0) {
    return err({ type: "invalid_input", message: "Ebook must have at least one recipe" });
  }

  if (input.chapters.length === 0) {
    return err({ type: "invalid_input", message: "Ebook must have at least one chapter" });
  }

  const now = new Date().toISOString();

  await db.insert(productBase).values({
    id: input.id,
    creator_id: creatorId,
    product_type: PRODUCT_TYPE.Ebook,
    status: "Draft",
    title: input.title,
    description: input.description,
    brand_kit_id: input.brand_kit_id,
    template_id: input.template_id,
    pdf_url: null,
    epub_url: null,
    kit_form_id: null,
    kit_sequence_id: null,
    suggested_price_cents: input.suggested_price_cents,
    currency: input.currency ?? "USD",
    ai_copy_reviewed: false,
    created_at: now,
    updated_at: now,
  });

  await db.insert(ebookDetails).values({
    product_id: input.id,
    recipe_ids: input.recipe_ids as unknown as readonly string[],
    chapters: input.chapters as unknown as ReadonlyArray<{
      title: string;
      intro_copy: string | null;
      recipe_ids: ReadonlyArray<string>;
    }>,
    intro_copy: input.intro_copy,
    author_bio: input.author_bio,
    format: input.format,
  });

  logger.info("product_created", {
    productId: input.id,
    type: PRODUCT_TYPE.Ebook,
    recipeCount: input.recipe_ids.length,
  });

  return getProduct(scopedDb, input.id);
}

/**
 * Create a meal plan product with day grid.
 */
export async function createMealPlan(
  scopedDb: CreatorScopedDb<Database>,
  input: CreateMealPlanInput,
): Promise<Result<ProductWithDetail, ProductError>> {
  const { db, creatorId } = scopedDb;

  if (input.days.length === 0) {
    return err({ type: "invalid_input", message: "Meal plan must have at least one day" });
  }

  const now = new Date().toISOString();

  await db.insert(productBase).values({
    id: input.id,
    creator_id: creatorId,
    product_type: PRODUCT_TYPE.MealPlan,
    status: "Draft",
    title: input.title,
    description: input.description,
    brand_kit_id: input.brand_kit_id,
    template_id: input.template_id,
    pdf_url: null,
    epub_url: null,
    kit_form_id: null,
    kit_sequence_id: null,
    suggested_price_cents: input.suggested_price_cents,
    currency: input.currency ?? "USD",
    ai_copy_reviewed: false,
    created_at: now,
    updated_at: now,
  });

  // Gather all recipe IDs from the day grid for shopping list generation
  const allRecipeIds = new Set<string>();
  for (const day of input.days) {
    if (day.breakfast !== null) allRecipeIds.add(day.breakfast);
    if (day.lunch !== null) allRecipeIds.add(day.lunch);
    if (day.dinner !== null) allRecipeIds.add(day.dinner);
    for (const snack of day.snacks) {
      allRecipeIds.add(snack);
    }
  }

  // Generate shopping list from assigned recipes
  let shoppingList: ShoppingListResult | null = null;
  if (allRecipeIds.size > 0) {
    const recipeData = await getRecipeIngredientData(db, creatorId, Array.from(allRecipeIds));
    shoppingList = generateShoppingList(recipeData);
  }

  await db.insert(mealPlanDetails).values({
    product_id: input.id,
    days: input.days as unknown as ReadonlyArray<{
      day_number: number;
      breakfast: string | null;
      lunch: string | null;
      dinner: string | null;
      snacks: ReadonlyArray<string>;
    }>,
    shopping_list: shoppingList !== null
      ? {
          sections: shoppingList.sections.map((s) => ({
            label: s.label,
            items: s.items.map((i) => ({
              quantity: null,
              unit: null,
              item: i.item,
              recipe_refs: i.recipe_refs,
            })),
          })),
          generated_at: shoppingList.generated_at,
        }
      : null,
  });

  return getProduct(scopedDb, input.id);
}

/**
 * Create a recipe card pack product.
 */
export async function createRecipeCardPack(
  scopedDb: CreatorScopedDb<Database>,
  input: CreateRecipeCardPackInput,
): Promise<Result<ProductWithDetail, ProductError>> {
  const { db, creatorId } = scopedDb;

  if (input.recipe_ids.length === 0) {
    return err({ type: "invalid_input", message: "Recipe card pack must have at least one recipe" });
  }

  const now = new Date().toISOString();

  await db.insert(productBase).values({
    id: input.id,
    creator_id: creatorId,
    product_type: PRODUCT_TYPE.RecipeCardPack,
    status: "Draft",
    title: input.title,
    description: input.description,
    brand_kit_id: input.brand_kit_id,
    template_id: input.template_id,
    pdf_url: null,
    epub_url: null,
    kit_form_id: null,
    kit_sequence_id: null,
    suggested_price_cents: input.suggested_price_cents,
    currency: input.currency ?? "USD",
    ai_copy_reviewed: false,
    created_at: now,
    updated_at: now,
  });

  await db.insert(recipeCardPacks).values({
    product_id: input.id,
    recipe_ids: input.recipe_ids as unknown as readonly string[],
  });

  return getProduct(scopedDb, input.id);
}

/**
 * Auto-generate a lead magnet from a parent product.
 * Selects top 3-5 recipes by engagement score, falls back to first 5.
 * Enforces invariant: LeadMagnet cannot reference another LeadMagnet.
 */
export async function createLeadMagnet(
  scopedDb: CreatorScopedDb<Database>,
  parentProductId: string,
  leadMagnetId: string,
): Promise<Result<ProductWithDetail, ProductError>> {
  const { db, creatorId } = scopedDb;

  // Fetch parent product
  const parentRows = await db
    .select()
    .from(productBase)
    .where(and(eq(productBase.id, parentProductId), eq(productBase.creator_id, creatorId)))
    .limit(1);

  if (parentRows.length === 0 || !parentRows[0]) {
    return err({ type: "not_found" });
  }

  const parent = parentRows[0];

  // Invariant §2.20.4: LeadMagnet cannot reference another LeadMagnet
  if (parent.product_type === PRODUCT_TYPE.LeadMagnet) {
    return err({
      type: "invariant_violation",
      message: "A LeadMagnet cannot reference another LeadMagnet",
    });
  }

  // Get recipe IDs from parent product
  const parentRecipeIds = await getParentRecipeIds(db, parentProductId, parent.product_type);

  if (parentRecipeIds.length === 0) {
    return err({
      type: "invalid_input",
      message: "Parent product has no recipes to create a lead magnet from",
    });
  }

  // Select top 3-5 recipes by engagement score
  const selectedRecipeIds = await selectLeadMagnetRecipes(
    db,
    creatorId,
    parentRecipeIds,
  );

  const now = new Date().toISOString();

  await db.insert(productBase).values({
    id: leadMagnetId,
    creator_id: creatorId,
    product_type: PRODUCT_TYPE.LeadMagnet,
    status: "Draft",
    title: `${parent.title} — Free Sample`,
    description: `A preview of ${parent.title}`,
    brand_kit_id: parent.brand_kit_id,
    template_id: parent.template_id,
    pdf_url: null,
    epub_url: null,
    kit_form_id: null,
    kit_sequence_id: null,
    suggested_price_cents: null,
    currency: parent.currency,
    ai_copy_reviewed: false,
    created_at: now,
    updated_at: now,
  });

  await db.insert(leadMagnets).values({
    product_id: leadMagnetId,
    parent_product_id: parentProductId,
    recipe_ids: selectedRecipeIds as unknown as readonly string[],
  });

  return getProduct(scopedDb, leadMagnetId);
}

// ---------------------------------------------------------------------------
// Product CRUD
// ---------------------------------------------------------------------------

/**
 * Get a product with its joined detail table data.
 */
export async function getProduct(
  scopedDb: CreatorScopedDb<Database>,
  productId: string,
): Promise<Result<ProductWithDetail, ProductError>> {
  const { db, creatorId } = scopedDb;

  const baseRows = await db
    .select()
    .from(productBase)
    .where(and(eq(productBase.id, productId), eq(productBase.creator_id, creatorId)))
    .limit(1);

  if (baseRows.length === 0 || !baseRows[0]) {
    return err({ type: "not_found" });
  }

  const base = baseRows[0];
  let detail: Record<string, unknown> | null = null;

  switch (base.product_type) {
    case PRODUCT_TYPE.Ebook: {
      const detailRows = await db
        .select()
        .from(ebookDetails)
        .where(eq(ebookDetails.product_id, productId))
        .limit(1);
      detail = detailRows[0] ? (detailRows[0] as unknown as Record<string, unknown>) : null;
      break;
    }
    case PRODUCT_TYPE.MealPlan: {
      const detailRows = await db
        .select()
        .from(mealPlanDetails)
        .where(eq(mealPlanDetails.product_id, productId))
        .limit(1);
      detail = detailRows[0] ? (detailRows[0] as unknown as Record<string, unknown>) : null;
      break;
    }
    case PRODUCT_TYPE.RecipeCardPack: {
      const detailRows = await db
        .select()
        .from(recipeCardPacks)
        .where(eq(recipeCardPacks.product_id, productId))
        .limit(1);
      detail = detailRows[0] ? (detailRows[0] as unknown as Record<string, unknown>) : null;
      break;
    }
    case PRODUCT_TYPE.LeadMagnet: {
      const detailRows = await db
        .select()
        .from(leadMagnets)
        .where(eq(leadMagnets.product_id, productId))
        .limit(1);
      detail = detailRows[0] ? (detailRows[0] as unknown as Record<string, unknown>) : null;
      break;
    }
  }

  return ok({ base, detail });
}

/**
 * List products with optional filters and pagination.
 */
export async function listProducts(
  scopedDb: CreatorScopedDb<Database>,
  params: ListProductsParams,
): Promise<Result<PaginatedResult<ProductBaseRow>, ProductError>> {
  const { db, creatorId } = scopedDb;

  const page = Math.max(1, params.page ?? 1);
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, params.perPage ?? DEFAULT_PER_PAGE));
  const offset = (page - 1) * perPage;

  const conditions = [eq(productBase.creator_id, creatorId)];

  if (params.status !== undefined) {
    conditions.push(eq(productBase.status, params.status));
  }
  if (params.product_type !== undefined) {
    conditions.push(eq(productBase.product_type, params.product_type));
  }

  const whereClause = and(...conditions);

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(productBase)
    .where(whereClause);

  const total = countResult[0]?.count ?? 0;

  const rows = await db
    .select()
    .from(productBase)
    .where(whereClause)
    .orderBy(desc(productBase.created_at))
    .limit(perPage)
    .offset(offset);

  return ok({
    data: rows,
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
  });
}

/**
 * Update base fields of a product.
 */
export async function updateProduct(
  scopedDb: CreatorScopedDb<Database>,
  productId: string,
  updates: UpdateProductInput,
): Promise<Result<ProductWithDetail, ProductError>> {
  const { db, creatorId } = scopedDb;

  const existing = await db
    .select()
    .from(productBase)
    .where(and(eq(productBase.id, productId), eq(productBase.creator_id, creatorId)))
    .limit(1);

  if (existing.length === 0) {
    return err({ type: "not_found" });
  }

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = { updated_at: now };

  if (updates.title !== undefined) updateData["title"] = updates.title;
  if (updates.description !== undefined) updateData["description"] = updates.description;
  if (updates.suggested_price_cents !== undefined) {
    updateData["suggested_price_cents"] = updates.suggested_price_cents;
  }

  await db
    .update(productBase)
    .set(updateData)
    .where(and(eq(productBase.id, productId), eq(productBase.creator_id, creatorId)));

  return getProduct(scopedDb, productId);
}

/**
 * Mark AI copy as reviewed on a product.
 */
export async function reviewAiCopy(
  scopedDb: CreatorScopedDb<Database>,
  productId: string,
): Promise<Result<ProductWithDetail, ProductError>> {
  const { db, creatorId } = scopedDb;

  const existing = await db
    .select()
    .from(productBase)
    .where(and(eq(productBase.id, productId), eq(productBase.creator_id, creatorId)))
    .limit(1);

  if (existing.length === 0) {
    return err({ type: "not_found" });
  }

  await db
    .update(productBase)
    .set({ ai_copy_reviewed: true, updated_at: new Date().toISOString() })
    .where(and(eq(productBase.id, productId), eq(productBase.creator_id, creatorId)));

  return getProduct(scopedDb, productId);
}

/**
 * Transition a product to Published status.
 * Guards: pdf_url must be non-null, ai_copy_reviewed must be true.
 * Free tier: max 1 published product.
 */
export async function publishProduct(
  scopedDb: CreatorScopedDb<Database>,
  productId: string,
): Promise<Result<ProductWithDetail, ProductError>> {
  const { db, creatorId } = scopedDb;

  const existing = await db
    .select()
    .from(productBase)
    .where(and(eq(productBase.id, productId), eq(productBase.creator_id, creatorId)))
    .limit(1);

  if (existing.length === 0 || !existing[0]) {
    return err({ type: "not_found" });
  }

  const product = existing[0];

  // Invariant §2.20.3: Published products must have non-null pdf_url
  if (product.pdf_url === null) {
    return err({
      type: "invariant_violation",
      message: "Cannot publish a product without a rendered PDF",
    });
  }

  // Invariant §2.20.5: ai_copy_reviewed must be true before publishing
  if (!product.ai_copy_reviewed) {
    return err({
      type: "invariant_violation",
      message: "AI copy must be reviewed before publishing",
    });
  }

  // Invariant §2.20.10: Free tier limited to 1 published product
  const tierCheck = await checkFreeTierPublishLimit(scopedDb, productId);
  if (!tierCheck.ok) return tierCheck;

  await db
    .update(productBase)
    .set({ status: "Published", updated_at: new Date().toISOString() })
    .where(and(eq(productBase.id, productId), eq(productBase.creator_id, creatorId)));

  return getProduct(scopedDb, productId);
}

// ---------------------------------------------------------------------------
// PDF Rendering — enqueue only
// ---------------------------------------------------------------------------

/**
 * Enqueue a product for PDF rendering.
 * Actual Chromium rendering is out of scope — just the queue interface.
 */
export async function enqueueRender(
  productId: string,
  env: Env,
  logger: Logger = defaultLogger,
): Promise<Result<{ queued: true }, ProductError>> {
  await env.RENDER_QUEUE.send({ productId });
  logger.info("render_enqueued", { productId });
  return ok({ queued: true });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getParentRecipeIds(
  db: Database,
  productId: string,
  productType: string,
): Promise<string[]> {
  switch (productType) {
    case PRODUCT_TYPE.Ebook: {
      const rows = await db
        .select({ recipe_ids: ebookDetails.recipe_ids })
        .from(ebookDetails)
        .where(eq(ebookDetails.product_id, productId))
        .limit(1);
      if (rows[0]) return Array.from(rows[0].recipe_ids);
      return [];
    }
    case PRODUCT_TYPE.RecipeCardPack: {
      const rows = await db
        .select({ recipe_ids: recipeCardPacks.recipe_ids })
        .from(recipeCardPacks)
        .where(eq(recipeCardPacks.product_id, productId))
        .limit(1);
      if (rows[0]) return Array.from(rows[0].recipe_ids);
      return [];
    }
    case PRODUCT_TYPE.MealPlan: {
      const rows = await db
        .select({ days: mealPlanDetails.days })
        .from(mealPlanDetails)
        .where(eq(mealPlanDetails.product_id, productId))
        .limit(1);
      if (!rows[0]) return [];
      const ids = new Set<string>();
      for (const day of rows[0].days) {
        if (day.breakfast !== null) ids.add(day.breakfast);
        if (day.lunch !== null) ids.add(day.lunch);
        if (day.dinner !== null) ids.add(day.dinner);
        for (const snack of day.snacks) ids.add(snack);
      }
      return Array.from(ids);
    }
    default:
      return [];
  }
}

/**
 * Select 3-5 recipes by engagement score (highest first).
 * Falls back to first 5 if engagement scores are unavailable.
 */
async function selectLeadMagnetRecipes(
  db: Database,
  creatorId: string,
  recipeIds: readonly string[],
): Promise<string[]> {
  if (recipeIds.length <= 5) return Array.from(recipeIds);

  // Try to get engagement scores
  const scores = await db
    .select({
      recipe_id: recipeEngagementScores.recipe_id,
      score: recipeEngagementScores.score,
    })
    .from(recipeEngagementScores)
    .where(
      and(
        eq(recipeEngagementScores.creator_id, creatorId),
        sql`${recipeEngagementScores.recipe_id} IN (${sql.join(
          recipeIds.map((id) => sql`${id}`),
          sql`,`,
        )})`,
      ),
    )
    .orderBy(desc(recipeEngagementScores.score));

  if (scores.length >= 3) {
    // Take top 3-5 (cap at 5)
    return scores.slice(0, 5).map((s) => s.recipe_id);
  }

  // Fallback: first 5 recipes
  return Array.from(recipeIds).slice(0, 5);
}

/**
 * Get ingredient data for recipes (used for shopping list generation).
 */
async function getRecipeIngredientData(
  db: Database,
  creatorId: string,
  recipeIds: readonly string[],
): Promise<RecipeIngredientData[]> {
  const result: RecipeIngredientData[] = [];

  for (const recipeId of recipeIds) {
    const recipeRows = await db
      .select({ id: recipes.id, title: recipes.title })
      .from(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.creator_id, creatorId)))
      .limit(1);

    if (recipeRows.length === 0 || !recipeRows[0]) continue;

    const recipe = recipeRows[0];

    const groups = await db
      .select()
      .from(ingredientGroups)
      .where(eq(ingredientGroups.recipe_id, recipeId))
      .orderBy(asc(ingredientGroups.sort_order));

    const allIngredients: {
      item: string;
      quantity_type: string | null;
      quantity_data: Record<string, unknown> | null;
      unit: string | null;
    }[] = [];

    for (const group of groups) {
      const ings = await db
        .select()
        .from(ingredients)
        .where(eq(ingredients.group_id, group.id))
        .orderBy(asc(ingredients.sort_order));

      for (const ing of ings) {
        allIngredients.push({
          item: ing.item,
          quantity_type: ing.quantity_type,
          quantity_data: ing.quantity_data,
          unit: ing.unit,
        });
      }
    }

    result.push({
      recipe_id: recipe.id,
      recipe_title: recipe.title,
      ingredients: allIngredients,
    });
  }

  return result;
}

/**
 * Check free tier published product limit.
 */
async function checkFreeTierPublishLimit(
  scopedDb: CreatorScopedDb<Database>,
  excludeProductId: string,
): Promise<Result<void, ProductError>> {
  const { db, creatorId } = scopedDb;

  const creatorRows = await db
    .select({ tier: creators.subscription_tier })
    .from(creators)
    .where(eq(creators.id, creatorId))
    .limit(1);

  const tier = creatorRows[0]?.tier ?? "Free";

  if (tier !== "Free") {
    return ok(undefined);
  }

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(productBase)
    .where(
      and(
        eq(productBase.creator_id, creatorId),
        eq(productBase.status, "Published"),
        sql`${productBase.id} != ${excludeProductId}`,
      ),
    );

  const count = countResult[0]?.count ?? 0;

  if (count >= FREE_TIER_PUBLISHED_PRODUCT_LIMIT) {
    return err({
      type: "free_tier_limit",
      message: `Free tier is limited to ${FREE_TIER_PUBLISHED_PRODUCT_LIMIT} published product. Upgrade to publish more.`,
    });
  }

  return ok(undefined);
}
