// ---------------------------------------------------------------------------
// Import Pipeline Service (SPEC SS7)
// ---------------------------------------------------------------------------
// Job lifecycle: pending -> processing -> needs_review -> completed
//                                      \-> failed
// ---------------------------------------------------------------------------

import { eq } from "drizzle-orm";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";
import type {
  Result,
  ImportJobId,
  CreatorId,
  RecipeId,
  RecipeExtract,
  ImportError,
  Url,
  Slug,
} from "@crumb/shared";
import { ok, err, createImportJobId, createRecipeId, createUrl, createSlug } from "@crumb/shared";
import { createLogger, type Logger } from "../lib/logger.js";

// ---------------------------------------------------------------------------
// Import status constants
// ---------------------------------------------------------------------------

export const IMPORT_STATUS = {
  Pending: "Pending",
  Processing: "Processing",
  NeedsReview: "NeedsReview",
  Completed: "Completed",
  Failed: "Failed",
} as const;
export type ImportStatusValue = (typeof IMPORT_STATUS)[keyof typeof IMPORT_STATUS];

// ---------------------------------------------------------------------------
// Dependency injection interfaces
// ---------------------------------------------------------------------------

/**
 * AI recipe extractor interface.
 * Implementations can be swapped for testing (mock/fixture-based).
 */
export interface RecipeExtractor {
  extract(text: string): Promise<Result<RecipeExtract, ImportError>>;
}

/**
 * HTTP fetcher interface for testability.
 * Abstracts over global `fetch` so tests can inject fixture responses.
 */
export interface HttpFetcher {
  fetch(
    url: string,
    init?: RequestInit,
  ): Promise<
    Result<{ status: number; text: string; headers: Record<string, string> }, ImportError>
  >;
}

/**
 * WordPress API client interface for testability.
 */
export interface WordPressClient {
  testConnection(siteUrl: string, apiKey: string): Promise<Result<{ name: string }, ImportError>>;

  detectPlugin(
    siteUrl: string,
    apiKey: string,
  ): Promise<Result<"WpRecipeMaker" | "TastyRecipes", ImportError>>;

  fetchRecipes(
    siteUrl: string,
    apiKey: string,
    plugin: "WpRecipeMaker" | "TastyRecipes",
  ): Promise<Result<readonly WordPressRecipe[], ImportError>>;
}

export interface WordPressRecipe {
  readonly wordpress_recipe_id: string;
  readonly title: string;
  readonly description: string | null;
  readonly ingredients: readonly { readonly raw_text: string }[];
  readonly instructions: readonly string[];
  readonly prep_minutes: number | null;
  readonly cook_minutes: number | null;
  readonly total_minutes: number | null;
  readonly yield_quantity: number | null;
  readonly yield_unit: string | null;
  readonly modified: string; // ISO 8601
}

/**
 * Queue interface for enqueueing import jobs.
 */
export interface ImportQueue {
  send(message: { importJobId: string }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Import service error types
// ---------------------------------------------------------------------------

export type ImportServiceError =
  | { readonly type: "NotFound" }
  | { readonly type: "InvalidTransition"; readonly message: string }
  | { readonly type: "ImportError"; readonly error: ImportError }
  | { readonly type: "DatabaseError"; readonly message: string }
  | { readonly type: "ValidationError"; readonly message: string };

// ---------------------------------------------------------------------------
// Schema.org extraction
// ---------------------------------------------------------------------------

interface SchemaOrgRecipe {
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

/**
 * Extract schema.org Recipe JSON-LD from HTML.
 * Returns null if not found or incomplete.
 */
export function extractSchemaOrgRecipe(html: string): SchemaOrgRecipe | null {
  // Find all ld+json script blocks
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

  // Handle arrays (e.g. @graph)
  if (Array.isArray(data)) {
    for (const item of data) {
      const result = findRecipeInLdJson(item);
      if (result !== null) return result;
    }
    return null;
  }

  const obj = data as Record<string, unknown>;

  // Check if this object is a Recipe
  const typeVal = obj["@type"];
  const isRecipe = typeVal === "Recipe" || (Array.isArray(typeVal) && typeVal.includes("Recipe"));

  if (isRecipe) {
    return parseSchemaOrgRecipe(obj);
  }

  // Check @graph
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

/**
 * Check if a schema.org recipe is complete enough to use directly.
 */
function isSchemaOrgComplete(recipe: SchemaOrgRecipe): boolean {
  return (
    recipe.name !== null &&
    recipe.name.length > 0 &&
    recipe.recipeIngredient.length > 0 &&
    recipe.recipeInstructions.length > 0
  );
}

/**
 * Convert a schema.org recipe to a RecipeExtract.
 */
function schemaOrgToExtract(recipe: SchemaOrgRecipe): RecipeExtract {
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

  // Parse yield
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
// HTML text extraction (for AI fallback)
// ---------------------------------------------------------------------------

/**
 * Strip HTML tags and extract visible text content.
 * Truncates to approximately maxTokens * 4 characters.
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

// ---------------------------------------------------------------------------
// Slug generation
// ---------------------------------------------------------------------------

function generateSlug(title: string): Slug {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const created = createSlug(slug || "untitled");
  return created !== null ? created : ("untitled" as Slug);
}

// ---------------------------------------------------------------------------
// Import Service
// ---------------------------------------------------------------------------

export interface ImportServiceDeps {
  readonly db: Database;
  readonly queue: ImportQueue;
  readonly extractor: RecipeExtractor;
  readonly fetcher: HttpFetcher;
  readonly wordpress: WordPressClient;
  readonly generateId?: () => string;
  readonly logger?: Logger;
}

export function createImportService(deps: ImportServiceDeps) {
  const generateId = deps.generateId ?? (() => crypto.randomUUID());
  const logger = deps.logger ?? createLogger("import");

  // -------------------------------------------------------------------------
  // createImportJob
  // -------------------------------------------------------------------------

  async function createImportJob(
    creatorId: CreatorId,
    sourceType: string,
    sourceData: Record<string, unknown>,
  ): Promise<Result<{ id: ImportJobId }, ImportServiceError>> {
    const id = createImportJobId(generateId());
    const now = new Date().toISOString();

    try {
      await deps.db.insert(schema.importJobs).values({
        id,
        creator_id: creatorId,
        status: IMPORT_STATUS.Pending,
        source_type: sourceType,
        source_data: sourceData,
        created_at: now,
        updated_at: now,
      });

      await deps.queue.send({ importJobId: id });

      logger.info("import_job_created", {
        jobId: id,
        sourceType,
        creator: creatorId,
      });

      return ok({ id });
    } catch (e) {
      logger.error("import_job_creation_failed", {
        sourceType,
        creator: creatorId,
        error: e instanceof Error ? e.message : "Unknown error",
      });
      return err({
        type: "DatabaseError",
        message: e instanceof Error ? e.message : "Unknown database error",
      });
    }
  }

  // -------------------------------------------------------------------------
  // getImportJob
  // -------------------------------------------------------------------------

  async function getImportJob(
    jobId: ImportJobId,
    creatorId: CreatorId,
  ): Promise<Result<typeof schema.importJobs.$inferSelect, ImportServiceError>> {
    const rows = await deps.db
      .select()
      .from(schema.importJobs)
      .where(eq(schema.importJobs.id, jobId));

    const row = rows[0];
    if (row === undefined) {
      return err({ type: "NotFound" });
    }

    if (row.creator_id !== creatorId) {
      return err({ type: "NotFound" });
    }

    return ok(row);
  }

  // -------------------------------------------------------------------------
  // listImportJobs
  // -------------------------------------------------------------------------

  async function listImportJobs(
    creatorId: CreatorId,
    limit: number = 50,
    offset: number = 0,
  ): Promise<Result<readonly (typeof schema.importJobs.$inferSelect)[], ImportServiceError>> {
    const rows = await deps.db
      .select()
      .from(schema.importJobs)
      .where(eq(schema.importJobs.creator_id, creatorId))
      .limit(limit)
      .offset(offset);

    return ok(rows);
  }

  // -------------------------------------------------------------------------
  // processImportJob (called by queue consumer)
  // -------------------------------------------------------------------------

  async function processImportJob(jobId: ImportJobId): Promise<Result<void, ImportServiceError>> {
    // Load the job
    const rows = await deps.db
      .select()
      .from(schema.importJobs)
      .where(eq(schema.importJobs.id, jobId));

    const job = rows[0];
    if (job === undefined) {
      return err({ type: "NotFound" });
    }

    // Validate state transition: must be Pending
    if (job.status !== IMPORT_STATUS.Pending) {
      return err({
        type: "InvalidTransition",
        message: `Cannot process job in status ${job.status}. Expected Pending.`,
      });
    }

    const now = new Date().toISOString();

    // Transition to Processing
    logger.info("import_job_state_transition", {
      jobId,
      from: IMPORT_STATUS.Pending,
      to: IMPORT_STATUS.Processing,
    });
    await deps.db
      .update(schema.importJobs)
      .set({
        status: IMPORT_STATUS.Processing,
        processing_started_at: now,
        updated_at: now,
      })
      .where(eq(schema.importJobs.id, jobId));

    // Set up 60-second processing timeout
    const timeoutMs = 60000;
    let timedOut = false;

    const processingPromise = (async (): Promise<Result<void, ImportServiceError>> => {
      const sourceType = job.source_type;

      switch (sourceType) {
        case "FromUrl":
          return processUrlImport(jobId, job.source_data as Record<string, unknown>);

        case "FromInstagramPost":
        case "FromTikTokVideo":
        case "FromYouTubeVideo":
        case "FromScreenshot":
          return handleNotYetImplemented(jobId, sourceType);

        case "FromWordPressSync":
          // WordPress sync is handled separately
          return handleNotYetImplemented(jobId, sourceType);

        case "FromInstagramBulk":
          return handleNotYetImplemented(jobId, sourceType);

        default: {
          const errorNow = new Date().toISOString();
          await deps.db
            .update(schema.importJobs)
            .set({
              status: IMPORT_STATUS.Failed,
              error_type: "ExtractionFailed",
              error_data: { reason: `Unknown source type: ${sourceType}` },
              updated_at: errorNow,
            })
            .where(eq(schema.importJobs.id, jobId));
          return ok(undefined);
        }
      }
    })();

    const timeoutPromise = new Promise<Result<void, ImportServiceError>>((resolve) => {
      setTimeout(() => {
        timedOut = true;
        resolve(ok(undefined));
      }, timeoutMs);
    });

    const result = await Promise.race([processingPromise, timeoutPromise]);

    if (timedOut) {
      logger.error("import_job_timeout", { jobId });
      const timeoutNow = new Date().toISOString();
      await deps.db
        .update(schema.importJobs)
        .set({
          status: IMPORT_STATUS.Failed,
          error_type: "Timeout",
          error_data: {},
          updated_at: timeoutNow,
        })
        .where(eq(schema.importJobs.id, jobId));
      return ok(undefined);
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // URL Import (SS7.3)
  // -------------------------------------------------------------------------

  async function processUrlImport(
    jobId: ImportJobId,
    sourceData: Record<string, unknown>,
  ): Promise<Result<void, ImportServiceError>> {
    const url = sourceData["url"];
    if (typeof url !== "string") {
      await markFailed(jobId, "ExtractionFailed", "Missing URL in source data");
      return ok(undefined);
    }

    // Fetch HTML with retry (SS14.1: retry once after 5s on timeout)
    let fetchResult = await deps.fetcher.fetch(url, {
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });

    if (!fetchResult.ok) {
      // Retry once after 5s
      await new Promise((resolve) => setTimeout(resolve, 5000));
      fetchResult = await deps.fetcher.fetch(url, {
        signal: AbortSignal.timeout(10000),
        redirect: "follow",
      });

      if (!fetchResult.ok) {
        logger.error("import_fetch_failed", { jobId, url });
        await markFailed(
          jobId,
          "FetchFailed",
          "Could not reach this URL. Please try again or paste the recipe text manually.",
        );
        return ok(undefined);
      }
    }

    const html = fetchResult.value.text;

    // Step 1: Try schema.org ld+json extraction
    const schemaOrg = extractSchemaOrgRecipe(html);
    if (schemaOrg !== null && isSchemaOrgComplete(schemaOrg)) {
      const extract = schemaOrgToExtract(schemaOrg);
      await markNeedsReview(jobId, extract);
      return ok(undefined);
    }

    // Step 2: Extract visible text and use AI extraction
    const visibleText = extractVisibleText(html);
    if (visibleText.length === 0) {
      await markFailed(
        jobId,
        "ExtractionFailed",
        "We couldn't extract a recipe from this source. Try pasting the text directly.",
      );
      return ok(undefined);
    }

    const extractResult = await deps.extractor.extract(visibleText);
    if (!extractResult.ok) {
      const importError = extractResult.error;
      await markFailed(
        jobId,
        importError.type,
        "reason" in importError ? importError.reason : "Extraction failed",
      );
      return ok(undefined);
    }

    const extract = extractResult.value;

    logger.info("import_extraction_result", {
      jobId,
      title: extract.title ?? null,
      ingredientGroupCount: extract.ingredients.length,
      confidence: extract.confidence ?? null,
    });

    if (
      extract.confidence !== undefined &&
      extract.confidence !== null &&
      extract.confidence < 0.5
    ) {
      logger.warn("import_low_confidence_extraction", {
        jobId,
        confidence: extract.confidence,
      });
    }

    // SS14.1: AI extraction produces no title or no ingredients -> failed
    if (
      extract.title === null ||
      extract.title.length === 0 ||
      extract.ingredients.length === 0 ||
      extract.ingredients.every((g) => g.ingredients.length === 0)
    ) {
      await markFailed(
        jobId,
        "ExtractionFailed",
        "We couldn't extract a recipe from this source. Try pasting the text directly.",
      );
      return ok(undefined);
    }

    await markNeedsReview(jobId, extract);
    return ok(undefined);
  }

  // -------------------------------------------------------------------------
  // Not-yet-implemented source types
  // -------------------------------------------------------------------------

  async function handleNotYetImplemented(
    jobId: ImportJobId,
    sourceType: string,
  ): Promise<Result<void, ImportServiceError>> {
    await markFailed(
      jobId,
      "ExtractionFailed",
      `Import from ${sourceType} is not yet implemented.`,
    );
    return ok(undefined);
  }

  // -------------------------------------------------------------------------
  // Confirm extract -> promote to recipe
  // -------------------------------------------------------------------------

  async function confirmImport(
    jobId: ImportJobId,
    creatorId: CreatorId,
  ): Promise<Result<{ recipeId: RecipeId }, ImportServiceError>> {
    const rows = await deps.db
      .select()
      .from(schema.importJobs)
      .where(eq(schema.importJobs.id, jobId));

    const job = rows[0];
    if (job === undefined) {
      return err({ type: "NotFound" });
    }

    if (job.creator_id !== creatorId) {
      return err({ type: "NotFound" });
    }

    if (job.status !== IMPORT_STATUS.NeedsReview) {
      return err({
        type: "InvalidTransition",
        message: `Cannot confirm job in status ${job.status}. Expected NeedsReview.`,
      });
    }

    const extractData = job.extract_data as Record<string, unknown> | null;
    if (extractData === null) {
      return err({
        type: "ValidationError",
        message: "No extract data found on job",
      });
    }

    // Build recipe from extract data
    const recipeId = createRecipeId(generateId());
    const title =
      typeof extractData["title"] === "string" ? extractData["title"] : "Untitled Recipe";
    const slug = generateSlug(title);
    const now = new Date().toISOString();

    // Determine recipe source from import source
    const sourceType = job.source_type;
    const sourceData = job.source_data as Record<string, unknown> | null;
    let recipeSourceType = "Manual";
    let recipeSourceData: Record<string, unknown> = {};

    if (sourceType === "FromUrl" && sourceData !== null) {
      recipeSourceType = "ImportedFromUrl";
      recipeSourceData = { url: sourceData["url"] };
    } else if (sourceType === "FromInstagramPost" && sourceData !== null) {
      recipeSourceType = "ImportedFromInstagram";
      recipeSourceData = { post_url: sourceData["url"] };
    } else if (sourceType === "FromTikTokVideo" && sourceData !== null) {
      recipeSourceType = "ImportedFromTikTok";
      recipeSourceData = { video_url: sourceData["url"] };
    } else if (sourceType === "FromYouTubeVideo" && sourceData !== null) {
      recipeSourceType = "ImportedFromYoutube";
      recipeSourceData = { video_url: sourceData["url"] };
    } else if (sourceType === "FromScreenshot" && sourceData !== null) {
      recipeSourceType = "ImportedFromScreenshot";
      recipeSourceData = { upload_id: sourceData["upload_id"] };
    } else if (sourceType === "FromWordPressSync" && sourceData !== null) {
      recipeSourceType = "SyncedFromWordPress";
      recipeSourceData = {
        site_url: sourceData["site_url"],
        wordpress_recipe_id: sourceData["wordpress_recipe_id"] ?? "",
        last_synced_at: Date.now(),
      };
    }

    const description =
      typeof extractData["description"] === "string" ? extractData["description"] : null;
    const notes = typeof extractData["notes"] === "string" ? extractData["notes"] : null;

    // Extract timing
    const timing = extractData["timing"] as Record<string, unknown> | undefined;
    const prepMinutes =
      timing !== undefined && typeof timing["prep_minutes"] === "number"
        ? timing["prep_minutes"]
        : null;
    const cookMinutes =
      timing !== undefined && typeof timing["cook_minutes"] === "number"
        ? timing["cook_minutes"]
        : null;
    const totalMinutes =
      timing !== undefined && typeof timing["total_minutes"] === "number"
        ? timing["total_minutes"]
        : null;

    // Extract yield
    const yieldData = extractData["yield"] as Record<string, unknown> | undefined;
    const yieldQuantity =
      yieldData !== undefined && typeof yieldData["quantity"] === "number"
        ? yieldData["quantity"]
        : null;
    const yieldUnit =
      yieldData !== undefined && typeof yieldData["unit"] === "string" ? yieldData["unit"] : null;

    // Extract dietary tags (stored as array of strings)
    let dietaryTags: string[] = [];
    const rawTags = extractData["dietary_tags"];
    if (Array.isArray(rawTags)) {
      dietaryTags = rawTags.filter((t): t is string => typeof t === "string");
    }

    try {
      // Insert recipe
      await deps.db.insert(schema.recipes).values({
        id: recipeId,
        creator_id: creatorId,
        title,
        slug,
        description,
        source_type: recipeSourceType,
        source_data: recipeSourceData,
        status: "Draft",
        email_ready: false,
        prep_minutes: prepMinutes,
        cook_minutes: cookMinutes,
        total_minutes: totalMinutes,
        yield_quantity: yieldQuantity,
        yield_unit: yieldUnit,
        notes,
        dietary_tags: dietaryTags,
        dietary_tags_confirmed: false,
        meal_types: [],
        seasons: [],
        created_at: now,
        updated_at: now,
      });

      // Insert ingredient groups and ingredients
      const ingredientGroups = extractData["ingredients"];
      if (Array.isArray(ingredientGroups)) {
        for (let groupIdx = 0; groupIdx < ingredientGroups.length; groupIdx++) {
          const group = ingredientGroups[groupIdx] as Record<string, unknown>;
          if (group === undefined) continue;

          // Insert ingredient group using raw SQL to get auto-incremented id
          const groupLabel = typeof group["label"] === "string" ? group["label"] : null;
          const groupResult = await deps.db
            .insert(schema.ingredientGroups)
            .values({
              recipe_id: recipeId,
              label: groupLabel,
              sort_order: groupIdx,
            })
            .returning({ id: schema.ingredientGroups.id });

          const groupRow = groupResult[0];
          if (groupRow === undefined) continue;

          const ingredients = group["ingredients"];
          if (Array.isArray(ingredients)) {
            for (let ingIdx = 0; ingIdx < ingredients.length; ingIdx++) {
              const ing = ingredients[ingIdx] as Record<string, unknown>;
              if (ing === undefined) continue;

              await deps.db.insert(schema.ingredients).values({
                id: generateId(),
                group_id: groupRow.id,
                item:
                  typeof ing["item"] === "string" && ing["item"].length > 0
                    ? ing["item"]
                    : typeof ing["raw_text"] === "string"
                      ? ing["raw_text"]
                      : "Unknown ingredient",
                unit: typeof ing["unit"] === "string" ? ing["unit"] : null,
                quantity_type:
                  ing["quantity"] !== null &&
                  ing["quantity"] !== undefined &&
                  typeof (ing["quantity"] as Record<string, unknown>)["type"] === "string"
                    ? ((ing["quantity"] as Record<string, unknown>)["type"] as string)
                    : null,
                quantity_data:
                  ing["quantity"] !== null && ing["quantity"] !== undefined
                    ? (ing["quantity"] as Record<string, unknown>)
                    : null,
                notes: typeof ing["notes"] === "string" ? ing["notes"] : null,
                sort_order: ingIdx,
              });
            }
          }
        }
      }

      // Insert instruction groups and instructions
      const extractInstructions = extractData["instructions"];
      if (Array.isArray(extractInstructions) && extractInstructions.length > 0) {
        const instrGroupResult = await deps.db
          .insert(schema.instructionGroups)
          .values({
            recipe_id: recipeId,
            label: null,
            sort_order: 0,
          })
          .returning({ id: schema.instructionGroups.id });

        const instrGroupRow = instrGroupResult[0];
        if (instrGroupRow !== undefined) {
          for (let instrIdx = 0; instrIdx < extractInstructions.length; instrIdx++) {
            const instrText = extractInstructions[instrIdx];
            if (typeof instrText !== "string") continue;

            await deps.db.insert(schema.instructions).values({
              id: generateId(),
              group_id: instrGroupRow.id,
              body: instrText,
              sort_order: instrIdx,
            });
          }
        }
      }

      // Update import job -> completed
      await deps.db
        .update(schema.importJobs)
        .set({
          status: IMPORT_STATUS.Completed,
          recipe_id: recipeId,
          updated_at: now,
        })
        .where(eq(schema.importJobs.id, jobId));

      return ok({ recipeId });
    } catch (e) {
      return err({
        type: "DatabaseError",
        message: e instanceof Error ? e.message : "Unknown database error",
      });
    }
  }

  // -------------------------------------------------------------------------
  // Reject import
  // -------------------------------------------------------------------------

  async function rejectImport(
    jobId: ImportJobId,
    creatorId: CreatorId,
  ): Promise<Result<void, ImportServiceError>> {
    const rows = await deps.db
      .select()
      .from(schema.importJobs)
      .where(eq(schema.importJobs.id, jobId));

    const job = rows[0];
    if (job === undefined) {
      return err({ type: "NotFound" });
    }

    if (job.creator_id !== creatorId) {
      return err({ type: "NotFound" });
    }

    // Can reject from Pending, NeedsReview, or Failed
    if (
      job.status !== IMPORT_STATUS.Pending &&
      job.status !== IMPORT_STATUS.NeedsReview &&
      job.status !== IMPORT_STATUS.Failed
    ) {
      return err({
        type: "InvalidTransition",
        message: `Cannot reject job in status ${job.status}.`,
      });
    }

    const now = new Date().toISOString();
    await deps.db
      .update(schema.importJobs)
      .set({
        status: IMPORT_STATUS.Failed,
        error_type: "ExtractionFailed",
        error_data: { reason: "Rejected by creator" },
        updated_at: now,
      })
      .where(eq(schema.importJobs.id, jobId));

    return ok(undefined);
  }

  // -------------------------------------------------------------------------
  // WordPress sync (SS7.6)
  // -------------------------------------------------------------------------

  async function testWordPressConnection(
    siteUrl: string,
    apiKey: string,
  ): Promise<Result<{ name: string; plugin: string }, ImportServiceError>> {
    const connectionResult = await deps.wordpress.testConnection(siteUrl, apiKey);
    if (!connectionResult.ok) {
      return err({
        type: "ImportError",
        error: connectionResult.error,
      });
    }

    const pluginResult = await deps.wordpress.detectPlugin(siteUrl, apiKey);
    if (!pluginResult.ok) {
      return err({
        type: "ImportError",
        error: pluginResult.error,
      });
    }

    return ok({
      name: connectionResult.value.name,
      plugin: pluginResult.value,
    });
  }

  async function syncWordPress(
    creatorId: CreatorId,
    siteUrl: string,
    apiKey: string,
    plugin: "WpRecipeMaker" | "TastyRecipes",
  ): Promise<
    Result<{ created: number; updated: number; flagged_deleted: number }, ImportServiceError>
  > {
    // Fetch all recipes from WordPress
    const recipesResult = await deps.wordpress.fetchRecipes(siteUrl, apiKey, plugin);
    if (!recipesResult.ok) {
      return err({ type: "ImportError", error: recipesResult.error });
    }

    const wpRecipes = recipesResult.value;
    let created = 0;
    let updated = 0;

    const now = new Date().toISOString();

    for (const wpRecipe of wpRecipes) {
      // Check if recipe already exists by wordpress_recipe_id
      const existing = await deps.db
        .select()
        .from(schema.recipes)
        .where(eq(schema.recipes.creator_id, creatorId));

      const existingRecipe = existing.find((r) => {
        const sd = r.source_data as Record<string, unknown> | null;
        return (
          r.source_type === "SyncedFromWordPress" &&
          sd !== null &&
          sd["wordpress_recipe_id"] === wpRecipe.wordpress_recipe_id
        );
      });

      if (existingRecipe === undefined) {
        // Create new recipe
        const recipeId = createRecipeId(generateId());
        const slug = generateSlug(wpRecipe.title);

        await deps.db.insert(schema.recipes).values({
          id: recipeId,
          creator_id: creatorId,
          title: wpRecipe.title,
          slug,
          description: wpRecipe.description,
          source_type: "SyncedFromWordPress",
          source_data: {
            site_url: siteUrl,
            wordpress_recipe_id: wpRecipe.wordpress_recipe_id,
            last_synced_at: Date.now(),
          },
          status: "Draft",
          email_ready: false,
          prep_minutes: wpRecipe.prep_minutes,
          cook_minutes: wpRecipe.cook_minutes,
          total_minutes: wpRecipe.total_minutes,
          yield_quantity: wpRecipe.yield_quantity,
          yield_unit: wpRecipe.yield_unit,
          dietary_tags: [],
          dietary_tags_confirmed: false,
          meal_types: [],
          seasons: [],
          created_at: now,
          updated_at: now,
        });

        // Insert ingredients
        if (wpRecipe.ingredients.length > 0) {
          const groupResult = await deps.db
            .insert(schema.ingredientGroups)
            .values({
              recipe_id: recipeId,
              label: null,
              sort_order: 0,
            })
            .returning({ id: schema.ingredientGroups.id });

          const groupRow = groupResult[0];
          if (groupRow !== undefined) {
            for (let i = 0; i < wpRecipe.ingredients.length; i++) {
              const ing = wpRecipe.ingredients[i];
              if (ing === undefined) continue;
              await deps.db.insert(schema.ingredients).values({
                id: generateId(),
                group_id: groupRow.id,
                item: ing.raw_text,
                sort_order: i,
              });
            }
          }
        }

        // Insert instructions
        if (wpRecipe.instructions.length > 0) {
          const instrGroupResult = await deps.db
            .insert(schema.instructionGroups)
            .values({
              recipe_id: recipeId,
              label: null,
              sort_order: 0,
            })
            .returning({ id: schema.instructionGroups.id });

          const instrGroupRow = instrGroupResult[0];
          if (instrGroupRow !== undefined) {
            for (let i = 0; i < wpRecipe.instructions.length; i++) {
              const instrText = wpRecipe.instructions[i];
              if (instrText === undefined) continue;
              await deps.db.insert(schema.instructions).values({
                id: generateId(),
                group_id: instrGroupRow.id,
                body: instrText,
                sort_order: i,
              });
            }
          }
        }

        created++;
      } else {
        // Check if WordPress version is newer
        const wpModified = new Date(wpRecipe.modified).getTime();
        const existingUpdated = new Date(existingRecipe.updated_at).getTime();

        if (wpModified > existingUpdated) {
          // Update ingredient/instruction/timing fields only
          // Do NOT overwrite title, description, notes, or photos
          await deps.db
            .update(schema.recipes)
            .set({
              prep_minutes: wpRecipe.prep_minutes,
              cook_minutes: wpRecipe.cook_minutes,
              total_minutes: wpRecipe.total_minutes,
              yield_quantity: wpRecipe.yield_quantity,
              yield_unit: wpRecipe.yield_unit,
              source_data: {
                site_url: siteUrl,
                wordpress_recipe_id: wpRecipe.wordpress_recipe_id,
                last_synced_at: Date.now(),
              },
              updated_at: now,
            })
            .where(eq(schema.recipes.id, existingRecipe.id));

          updated++;
        }
      }
    }

    // Flag recipes that exist locally but not in WordPress
    // (those that were deleted from WordPress)
    const allLocalWpRecipes = await deps.db
      .select()
      .from(schema.recipes)
      .where(eq(schema.recipes.creator_id, creatorId));

    const wpRecipeIds = new Set(wpRecipes.map((r) => r.wordpress_recipe_id));

    let flaggedDeleted = 0;
    for (const localRecipe of allLocalWpRecipes) {
      if (localRecipe.source_type !== "SyncedFromWordPress") continue;
      const sd = localRecipe.source_data as Record<string, unknown> | null;
      if (sd === null) continue;
      const wpId = sd["wordpress_recipe_id"];
      if (typeof wpId !== "string") continue;

      if (!wpRecipeIds.has(wpId)) {
        // Flag as wordpress_deleted
        const existingSourceData = (localRecipe.source_data ?? {}) as Record<string, unknown>;
        await deps.db
          .update(schema.recipes)
          .set({
            source_data: {
              ...existingSourceData,
              wordpress_deleted: true,
            },
            updated_at: now,
          })
          .where(eq(schema.recipes.id, localRecipe.id));
        flaggedDeleted++;
      }
    }

    logger.info("wordpress_sync_completed", {
      creator: creatorId,
      created,
      updated,
      flaggedDeleted,
    });

    return ok({ created, updated, flagged_deleted: flaggedDeleted });
  }

  // -------------------------------------------------------------------------
  // Helper: mark job as failed
  // -------------------------------------------------------------------------

  async function markFailed(jobId: ImportJobId, errorType: string, reason: string): Promise<void> {
    logger.info("import_job_state_transition", {
      jobId,
      from: "Processing",
      to: IMPORT_STATUS.Failed,
      errorType,
      reason,
    });
    const now = new Date().toISOString();
    await deps.db
      .update(schema.importJobs)
      .set({
        status: IMPORT_STATUS.Failed,
        error_type: errorType,
        error_data: { reason },
        updated_at: now,
      })
      .where(eq(schema.importJobs.id, jobId));
  }

  // -------------------------------------------------------------------------
  // Helper: mark job as needs_review with extract
  // -------------------------------------------------------------------------

  async function markNeedsReview(jobId: ImportJobId, extract: RecipeExtract): Promise<void> {
    const now = new Date().toISOString();
    // Serialize the extract for storage
    // Convert Set to array for JSON storage
    const serializedExtract: Record<string, unknown> = {
      ...extract,
      dietary_tags: Array.from(extract.dietary_tags),
      photo_urls: Array.from(extract.photo_urls),
    };

    await deps.db
      .update(schema.importJobs)
      .set({
        status: IMPORT_STATUS.NeedsReview,
        extract_data: serializedExtract,
        updated_at: now,
      })
      .where(eq(schema.importJobs.id, jobId));
  }

  return {
    createImportJob,
    getImportJob,
    listImportJobs,
    processImportJob,
    confirmImport,
    rejectImport,
    testWordPressConnection,
    syncWordPress,
  };
}

// ---------------------------------------------------------------------------
// Default HTTP fetcher implementation
// ---------------------------------------------------------------------------

export function createDefaultFetcher(): HttpFetcher {
  return {
    async fetch(
      url: string,
      init?: RequestInit,
    ): Promise<
      Result<{ status: number; text: string; headers: Record<string, string> }, ImportError>
    > {
      try {
        const response = await globalThis.fetch(url, {
          ...init,
          redirect: "follow",
        });
        const text = await response.text();
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });
        return ok({ status: response.status, text, headers });
      } catch (e) {
        if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) {
          return err({ type: "FetchFailed", reason: "Request timed out" });
        }
        return err({
          type: "FetchFailed",
          reason: e instanceof Error ? e.message : "Network error",
        });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Default WordPress client implementation
// ---------------------------------------------------------------------------

export function createDefaultWordPressClient(fetcher: HttpFetcher): WordPressClient {
  function authHeaders(apiKey: string): Record<string, string> {
    return {
      Authorization: `Basic ${btoa(`admin:${apiKey}`)}`,
    };
  }

  return {
    async testConnection(
      siteUrl: string,
      apiKey: string,
    ): Promise<Result<{ name: string }, ImportError>> {
      const result = await fetcher.fetch(`${siteUrl}/wp-json/wp/v2/users/me`, {
        headers: authHeaders(apiKey),
      });

      if (!result.ok) return err(result.error);

      if (result.value.status === 401) {
        return err({ type: "WordPressAuthFailed" });
      }

      if (result.value.status !== 200) {
        return err({
          type: "FetchFailed",
          reason: `WordPress API returned status ${result.value.status}`,
        });
      }

      try {
        const data = JSON.parse(result.value.text) as Record<string, unknown>;
        const name = typeof data["name"] === "string" ? data["name"] : "Unknown";
        return ok({ name });
      } catch {
        return err({
          type: "FetchFailed",
          reason: "Invalid JSON response from WordPress",
        });
      }
    },

    async detectPlugin(
      siteUrl: string,
      apiKey: string,
    ): Promise<Result<"WpRecipeMaker" | "TastyRecipes", ImportError>> {
      // Try WP Recipe Maker
      const wprmResult = await fetcher.fetch(`${siteUrl}/wp-json/wprm/v3/recipe`, {
        headers: authHeaders(apiKey),
      });
      if (wprmResult.ok && wprmResult.value.status === 200) {
        return ok("WpRecipeMaker");
      }

      // Try Tasty Recipes
      const tastyResult = await fetcher.fetch(`${siteUrl}/wp-json/tasty-recipes/v1/recipes`, {
        headers: authHeaders(apiKey),
      });
      if (tastyResult.ok && tastyResult.value.status === 200) {
        return ok("TastyRecipes");
      }

      return err({
        type: "ExtractionFailed",
        reason:
          "No supported recipe plugin detected. Please install WP Recipe Maker or Tasty Recipes.",
      });
    },

    async fetchRecipes(
      siteUrl: string,
      apiKey: string,
      plugin: "WpRecipeMaker" | "TastyRecipes",
    ): Promise<Result<readonly WordPressRecipe[], ImportError>> {
      const endpoint =
        plugin === "WpRecipeMaker"
          ? `${siteUrl}/wp-json/wprm/v3/recipe`
          : `${siteUrl}/wp-json/tasty-recipes/v1/recipes`;

      const result = await fetcher.fetch(endpoint, {
        headers: authHeaders(apiKey),
      });

      if (!result.ok) return err(result.error);

      if (result.value.status === 401) {
        return err({ type: "WordPressAuthFailed" });
      }

      if (result.value.status !== 200) {
        return err({
          type: "FetchFailed",
          reason: `WordPress recipe API returned status ${result.value.status}`,
        });
      }

      try {
        const data = JSON.parse(result.value.text) as unknown[];
        const recipes: WordPressRecipe[] = [];

        for (const item of data) {
          if (item === null || typeof item !== "object") continue;
          const obj = item as Record<string, unknown>;

          recipes.push({
            wordpress_recipe_id: String(obj["id"] ?? ""),
            title: typeof obj["title"] === "string" ? obj["title"] : "Untitled",
            description: typeof obj["description"] === "string" ? obj["description"] : null,
            ingredients: Array.isArray(obj["ingredients"])
              ? (obj["ingredients"] as unknown[])
                  .filter((i): i is Record<string, unknown> => i !== null && typeof i === "object")
                  .map((i) => ({
                    raw_text:
                      typeof i["raw_text"] === "string" ? i["raw_text"] : String(i["text"] ?? ""),
                  }))
              : [],
            instructions: Array.isArray(obj["instructions"])
              ? (obj["instructions"] as unknown[]).filter((i): i is string => typeof i === "string")
              : [],
            prep_minutes: typeof obj["prep_minutes"] === "number" ? obj["prep_minutes"] : null,
            cook_minutes: typeof obj["cook_minutes"] === "number" ? obj["cook_minutes"] : null,
            total_minutes: typeof obj["total_minutes"] === "number" ? obj["total_minutes"] : null,
            yield_quantity:
              typeof obj["yield_quantity"] === "number" ? obj["yield_quantity"] : null,
            yield_unit: typeof obj["yield_unit"] === "string" ? obj["yield_unit"] : null,
            modified:
              typeof obj["modified"] === "string" ? obj["modified"] : new Date().toISOString(),
          });
        }

        return ok(recipes);
      } catch {
        return err({
          type: "FetchFailed",
          reason: "Invalid JSON response from WordPress recipe API",
        });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Bulk Social Import classifier interface (SS7.7)
// ---------------------------------------------------------------------------

/**
 * Classifier interface for scoring social media posts for recipe likelihood.
 */
export interface RecipeLikelihoodClassifier {
  score(post: SocialPost): Promise<number>;
}

export interface SocialPost {
  readonly text: string;
  readonly hashtags: readonly string[];
  readonly media_type: "image" | "video" | "carousel";
}

/**
 * Placeholder classifier that always returns 0.
 * To be implemented when social import is built out.
 */
export function createPlaceholderClassifier(): RecipeLikelihoodClassifier {
  return {
    async score(_post: SocialPost): Promise<number> {
      return 0;
    },
  };
}
