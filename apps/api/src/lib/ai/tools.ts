// ---------------------------------------------------------------------------
// Agent tools for AI recipe extraction (SPEC SS7)
// ---------------------------------------------------------------------------
// Each tool is dependency-injected for testability. The agent loop calls
// these tools based on AI model decisions.
// ---------------------------------------------------------------------------

import type { RecipeExtract, ImportError, Result, Url } from "@dough/shared";
import { ok, createUrl } from "@dough/shared";
import { extractSchemaOrgRecipe, extractVisibleText } from "./schema-org.js";

// ---------------------------------------------------------------------------
// Tool definition types
// ---------------------------------------------------------------------------

/**
 * JSON Schema-compatible tool parameter definition for Workers AI.
 */
export interface ToolParameterProperty {
  readonly type: string;
  readonly description: string;
  readonly enum?: readonly string[];
}

/**
 * A tool the agent can invoke. The execute function receives validated
 * parameters and returns a string result for the agent to reason about.
 */
export interface AgentTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: {
    readonly type: "object";
    readonly properties: Record<string, ToolParameterProperty>;
    readonly required: readonly string[];
  };
  execute(params: Record<string, unknown>): Promise<string>;
}

// ---------------------------------------------------------------------------
// Tool dependency interfaces (for injection / mocking)
// ---------------------------------------------------------------------------

/**
 * HTTP fetch function signature. Matches the global fetch API.
 */
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Workers AI run function signature.
 */
export type AiRunFn = (model: string, inputs: Record<string, unknown>) => Promise<unknown>;

/**
 * Dependencies injected into tool factories for testability.
 */
export interface ToolDeps {
  readonly fetchFn: FetchFn;
  readonly aiRunFn: AiRunFn;
}

// ---------------------------------------------------------------------------
// fetch_url tool
// ---------------------------------------------------------------------------

export function createFetchUrlTool(deps: ToolDeps): AgentTool {
  return {
    name: "fetch_url",
    description:
      "Fetch a URL, following up to 5 redirects. Returns the HTML content (trimmed to ~8000 tokens), the final URL after redirects, and the HTTP status code.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to fetch" },
      },
      required: ["url"],
    },
    async execute(params: Record<string, unknown>): Promise<string> {
      const url = params["url"];
      if (typeof url !== "string") {
        return JSON.stringify({ error: "url parameter is required and must be a string" });
      }

      try {
        const response = await deps.fetchFn(url, {
          redirect: "follow",
          signal: AbortSignal.timeout(10000),
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; DoughBot/1.0; +https://makedough.app)",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        });

        const text = await response.text();
        // Trim to ~8000 tokens (roughly 32000 chars)
        const trimmed = text.length > 32000 ? text.slice(0, 32000) : text;

        return JSON.stringify({
          status: response.status,
          url: response.url || url,
          content_length: text.length,
          content: trimmed,
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown fetch error";
        return JSON.stringify({ error: `Failed to fetch URL: ${message}` });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// extract_schema_org tool
// ---------------------------------------------------------------------------

export function createExtractSchemaOrgTool(): AgentTool {
  return {
    name: "extract_schema_org",
    description:
      "Parse schema.org JSON-LD from HTML content. Returns structured recipe data if a Recipe schema is found, or an error message if not found.",
    parameters: {
      type: "object",
      properties: {
        html: {
          type: "string",
          description: "The HTML content to search for schema.org Recipe markup",
        },
      },
      required: ["html"],
    },
    async execute(params: Record<string, unknown>): Promise<string> {
      const html = params["html"];
      if (typeof html !== "string") {
        return JSON.stringify({ error: "html parameter is required and must be a string" });
      }

      const recipe = extractSchemaOrgRecipe(html);
      if (recipe === null) {
        return JSON.stringify({
          found: false,
          message: "No schema.org Recipe markup found in the HTML.",
        });
      }

      return JSON.stringify({
        found: true,
        recipe: {
          name: recipe.name,
          description: recipe.description,
          ingredients: recipe.recipeIngredient,
          instructions: recipe.recipeInstructions.map((inst) =>
            typeof inst === "string" ? inst : inst.text,
          ),
          prep_time: recipe.prepTime,
          cook_time: recipe.cookTime,
          total_time: recipe.totalTime,
          yield: recipe.recipeYield,
          image: recipe.image,
        },
      });
    },
  };
}

// ---------------------------------------------------------------------------
// extract_visible_text tool
// ---------------------------------------------------------------------------

export function createExtractVisibleTextTool(): AgentTool {
  return {
    name: "extract_visible_text",
    description:
      "Strip HTML tags from content and return clean visible text. Useful for reading page content when there is no schema.org markup.",
    parameters: {
      type: "object",
      properties: {
        html: {
          type: "string",
          description: "The HTML content to extract text from",
        },
        max_length: {
          type: "number",
          description: "Maximum character length of output (default 32000)",
        },
      },
      required: ["html"],
    },
    async execute(params: Record<string, unknown>): Promise<string> {
      const html = params["html"];
      if (typeof html !== "string") {
        return JSON.stringify({ error: "html parameter is required and must be a string" });
      }

      const maxLength = typeof params["max_length"] === "number" ? params["max_length"] : 32000;

      const text = extractVisibleText(html, maxLength);
      return JSON.stringify({ text, length: text.length });
    },
  };
}

// ---------------------------------------------------------------------------
// find_links tool
// ---------------------------------------------------------------------------

export function createFindLinksTool(): AgentTool {
  return {
    name: "find_links",
    description:
      "Find all links (<a> tags) on an HTML page. Optionally filter by a keyword in the link text or href. Useful for finding recipe links on link-in-bio pages or social media profiles.",
    parameters: {
      type: "object",
      properties: {
        html: {
          type: "string",
          description: "The HTML content to search for links",
        },
        keyword: {
          type: "string",
          description:
            "Optional keyword to filter links by (matches against link text and href, case-insensitive)",
        },
      },
      required: ["html"],
    },
    async execute(params: Record<string, unknown>): Promise<string> {
      const html = params["html"];
      if (typeof html !== "string") {
        return JSON.stringify({ error: "html parameter is required and must be a string" });
      }

      const keyword =
        typeof params["keyword"] === "string" ? params["keyword"].toLowerCase() : null;

      const links = extractLinks(html);

      const filtered =
        keyword !== null
          ? links.filter(
              (l) =>
                l.text.toLowerCase().includes(keyword) || l.href.toLowerCase().includes(keyword),
            )
          : links;

      // Limit to 50 links to avoid overwhelming the model
      const limited = filtered.slice(0, 50);

      return JSON.stringify({ links: limited, total: filtered.length });
    },
  };
}

/**
 * Extract all links from HTML using regex.
 * Returns array of { text, href } objects.
 */
export function extractLinks(html: string): readonly { text: string; href: string }[] {
  const linkRegex = /<a\s[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const links: { text: string; href: string }[] = [];
  let match = linkRegex.exec(html);

  while (match !== null) {
    const href = match[1];
    const rawText = match[2];
    if (href !== undefined && rawText !== undefined) {
      // Strip inner HTML tags from link text
      const text = rawText.replace(/<[^>]+>/g, "").trim();
      links.push({ text, href });
    }
    match = linkRegex.exec(html);
  }

  return links;
}

// ---------------------------------------------------------------------------
// analyze_image tool
// ---------------------------------------------------------------------------

export function createAnalyzeImageTool(deps: ToolDeps, visionModel: string): AgentTool {
  return {
    name: "analyze_image",
    description:
      "Use an AI vision model to understand an image. Can analyze recipe photos, screenshots of recipes, handwritten recipe cards, etc. Provide either an image URL or base64-encoded image data.",
    parameters: {
      type: "object",
      properties: {
        image_url: {
          type: "string",
          description: "URL of the image to analyze",
        },
        image_base64: {
          type: "string",
          description: "Base64-encoded image data",
        },
        question: {
          type: "string",
          description:
            "What to look for in the image (e.g., 'Extract the recipe text from this image')",
        },
      },
      required: ["question"],
    },
    async execute(params: Record<string, unknown>): Promise<string> {
      const question = params["question"];
      if (typeof question !== "string") {
        return JSON.stringify({
          error: "question parameter is required and must be a string",
        });
      }

      const imageUrl = params["image_url"];
      const imageBase64 = params["image_base64"];

      if (typeof imageUrl !== "string" && typeof imageBase64 !== "string") {
        return JSON.stringify({
          error: "Either image_url or image_base64 must be provided",
        });
      }

      try {
        const image =
          typeof imageUrl === "string" ? { url: imageUrl } : { base64: imageBase64 as string };

        const result = await deps.aiRunFn(visionModel, {
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: question },
                {
                  type: "image_url",
                  image_url: typeof imageUrl === "string" ? { url: imageUrl } : image,
                },
              ],
            },
          ],
          max_tokens: 2048,
        });

        const response = result as { response?: string } | undefined;
        return JSON.stringify({
          answer: response?.response ?? "No response from vision model",
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown vision model error";
        return JSON.stringify({ error: `Vision analysis failed: ${message}` });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// transcribe_audio tool
// ---------------------------------------------------------------------------

export function createTranscribeAudioTool(deps: ToolDeps, transcriptionModel: string): AgentTool {
  return {
    name: "transcribe_audio",
    description:
      "Transcribe audio from a URL using a speech-to-text model. Useful for extracting recipe instructions from podcast episodes or video narration.",
    parameters: {
      type: "object",
      properties: {
        audio_url: {
          type: "string",
          description: "URL of the audio file to transcribe",
        },
      },
      required: ["audio_url"],
    },
    async execute(params: Record<string, unknown>): Promise<string> {
      const audioUrl = params["audio_url"];
      if (typeof audioUrl !== "string") {
        return JSON.stringify({
          error: "audio_url parameter is required and must be a string",
        });
      }

      try {
        // Fetch the audio file
        const response = await deps.fetchFn(audioUrl, {
          signal: AbortSignal.timeout(30000),
        });
        const audioBuffer = await response.arrayBuffer();

        const result = await deps.aiRunFn(transcriptionModel, {
          audio: [...new Uint8Array(audioBuffer)],
        });

        const transcription = result as { text?: string } | undefined;
        return JSON.stringify({
          text: transcription?.text ?? "No transcription produced",
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown transcription error";
        return JSON.stringify({
          error: `Audio transcription failed: ${message}`,
        });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// get_youtube_info tool
// ---------------------------------------------------------------------------

export function createGetYoutubeInfoTool(deps: ToolDeps): AgentTool {
  return {
    name: "get_youtube_info",
    description:
      "Extract YouTube video title, author, and description using the oEmbed API. Returns video metadata that may contain recipe information.",
    parameters: {
      type: "object",
      properties: {
        video_url: {
          type: "string",
          description: "The YouTube video URL",
        },
      },
      required: ["video_url"],
    },
    async execute(params: Record<string, unknown>): Promise<string> {
      const videoUrl = params["video_url"];
      if (typeof videoUrl !== "string") {
        return JSON.stringify({
          error: "video_url parameter is required and must be a string",
        });
      }

      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
        const response = await deps.fetchFn(oembedUrl, {
          signal: AbortSignal.timeout(10000),
        });
        const text = await response.text();
        const data = JSON.parse(text) as Record<string, unknown>;

        return JSON.stringify({
          title: data["title"] ?? null,
          author_name: data["author_name"] ?? null,
          author_url: data["author_url"] ?? null,
          thumbnail_url: data["thumbnail_url"] ?? null,
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown YouTube API error";
        return JSON.stringify({
          error: `Failed to get YouTube info: ${message}`,
        });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// get_social_post tool
// ---------------------------------------------------------------------------

export function createGetSocialPostTool(deps: ToolDeps): AgentTool {
  return {
    name: "get_social_post",
    description:
      "Extract social media post content using oEmbed APIs where available. Works for Instagram and TikTok. Returns post caption/text and any embedded links.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The social media post URL",
        },
        platform: {
          type: "string",
          description: "The platform: instagram, tiktok, or youtube",
          enum: ["instagram", "tiktok", "youtube"],
        },
      },
      required: ["url", "platform"],
    },
    async execute(params: Record<string, unknown>): Promise<string> {
      const url = params["url"];
      const platform = params["platform"];
      if (typeof url !== "string" || typeof platform !== "string") {
        return JSON.stringify({
          error: "url and platform parameters are required",
        });
      }

      try {
        let oembedUrl: string;
        switch (platform) {
          case "instagram":
            oembedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(url)}`;
            break;
          case "tiktok":
            oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
            break;
          case "youtube":
            oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
            break;
          default:
            return JSON.stringify({
              error: `Unsupported platform: ${platform}`,
            });
        }

        const response = await deps.fetchFn(oembedUrl, {
          signal: AbortSignal.timeout(10000),
        });
        const text = await response.text();
        const data = JSON.parse(text) as Record<string, unknown>;

        return JSON.stringify({
          title: data["title"] ?? null,
          author_name: data["author_name"] ?? null,
          html: data["html"] ?? null,
          thumbnail_url: data["thumbnail_url"] ?? null,
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown social API error";
        return JSON.stringify({
          error: `Failed to get social post: ${message}`,
        });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// extract_recipe tool (terminal tool)
// ---------------------------------------------------------------------------

/**
 * The extract_recipe tool is the terminal tool that ends the agent loop.
 * When the agent calls this, the extracted recipe is validated and returned.
 */
export function createExtractRecipeTool(): AgentTool {
  return {
    name: "extract_recipe",
    description:
      "Submit the final extracted recipe. Call this when you have gathered enough information to produce a structured recipe. This ends the extraction process.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Recipe title" },
        description: {
          type: "string",
          description: "Recipe description (null if not available)",
        },
        ingredients: {
          type: "string",
          description:
            'JSON array of ingredient groups: [{"label": null, "ingredients": [{"raw_text": "...", "quantity": null, "unit": null, "item": null, "notes": null, "confidence": 0.9}]}]',
        },
        instructions: {
          type: "string",
          description: 'JSON array of instruction strings: ["Step 1...", "Step 2..."]',
        },
        prep_minutes: {
          type: "number",
          description: "Prep time in minutes (null if unknown)",
        },
        cook_minutes: {
          type: "number",
          description: "Cook time in minutes (null if unknown)",
        },
        total_minutes: {
          type: "number",
          description: "Total time in minutes (null if unknown)",
        },
        yield_quantity: {
          type: "number",
          description: "Yield quantity (null if unknown)",
        },
        yield_unit: {
          type: "string",
          description: 'Yield unit, e.g. "servings" (null if unknown)',
        },
        notes: {
          type: "string",
          description: "Recipe notes (null if none)",
        },
        photo_urls: {
          type: "string",
          description: 'JSON array of photo URLs: ["url1", "url2"]',
        },
        dietary_tags: {
          type: "string",
          description:
            'JSON array of dietary tags: ["GlutenFree", "Vegan"]. Valid: GlutenFree, DairyFree, Vegan, Vegetarian, Keto, Paleo, NutFree, EggFree, SoyFree',
        },
        overall_confidence: {
          type: "number",
          description: "Overall confidence score (0.0-1.0)",
        },
        field_scores: {
          type: "string",
          description:
            'JSON object of per-field confidence scores: {"title": 0.9, "ingredients": 0.8}',
        },
      },
      required: ["title", "ingredients", "instructions", "overall_confidence"],
    },
    async execute(params: Record<string, unknown>): Promise<string> {
      // This tool's result is processed specially by the agent loop.
      // We just validate and return the structured data as JSON.
      return JSON.stringify({ __terminal: true, data: params });
    },
  };
}

// ---------------------------------------------------------------------------
// Parse extract_recipe output into a RecipeExtract
// ---------------------------------------------------------------------------

/**
 * Valid dietary tag strings from the SPEC.
 */
const VALID_DIETARY_TAGS = new Set([
  "GlutenFree",
  "DairyFree",
  "Vegan",
  "Vegetarian",
  "Keto",
  "Paleo",
  "NutFree",
  "EggFree",
  "SoyFree",
]);

/**
 * Parse the output of the extract_recipe tool into a RecipeExtract.
 */
export function parseExtractRecipeOutput(
  params: Record<string, unknown>,
): Result<RecipeExtract, ImportError> {
  const title =
    typeof params["title"] === "string" && params["title"].length > 0 ? params["title"] : null;

  const description = typeof params["description"] === "string" ? params["description"] : null;

  // Parse ingredients
  let ingredientGroups: RecipeExtract["ingredients"] = [];
  const rawIngredients = params["ingredients"];
  if (typeof rawIngredients === "string") {
    try {
      const parsed = JSON.parse(rawIngredients) as unknown;
      if (Array.isArray(parsed)) {
        ingredientGroups = parseIngredientGroups(parsed);
      }
    } catch {
      // If JSON parse fails, treat as a single ingredient
      ingredientGroups = [
        {
          label: null,
          ingredients: [
            {
              raw_text: rawIngredients,
              quantity: null,
              unit: null,
              item: null,
              notes: null,
              confidence: 0.5,
            },
          ],
        },
      ];
    }
  } else if (Array.isArray(rawIngredients)) {
    ingredientGroups = parseIngredientGroups(rawIngredients);
  }

  // Parse instructions
  let instructions: readonly string[] = [];
  const rawInstructions = params["instructions"];
  if (typeof rawInstructions === "string") {
    try {
      const parsed = JSON.parse(rawInstructions) as unknown;
      if (Array.isArray(parsed)) {
        instructions = parsed.filter((i): i is string => typeof i === "string");
      }
    } catch {
      instructions = [rawInstructions];
    }
  } else if (Array.isArray(rawInstructions)) {
    instructions = (rawInstructions as unknown[]).filter((i): i is string => typeof i === "string");
  }

  // Parse timing
  const prepMinutes = typeof params["prep_minutes"] === "number" ? params["prep_minutes"] : null;
  const cookMinutes = typeof params["cook_minutes"] === "number" ? params["cook_minutes"] : null;
  const totalMinutes = typeof params["total_minutes"] === "number" ? params["total_minutes"] : null;

  // Parse yield
  const yieldQuantity =
    typeof params["yield_quantity"] === "number" ? params["yield_quantity"] : null;
  const yieldUnit = typeof params["yield_unit"] === "string" ? params["yield_unit"] : null;
  const recipeYield =
    yieldQuantity !== null ? { quantity: yieldQuantity, unit: yieldUnit ?? "servings" } : null;

  // Parse notes
  const notes = typeof params["notes"] === "string" ? params["notes"] : null;

  // Parse photo URLs
  let photoUrls: Url[] = [];
  const rawPhotoUrls = params["photo_urls"];
  if (typeof rawPhotoUrls === "string") {
    try {
      const parsed = JSON.parse(rawPhotoUrls) as unknown;
      if (Array.isArray(parsed)) {
        photoUrls = parsed
          .filter((u): u is string => typeof u === "string")
          .map((u) => createUrl(u))
          .filter((u): u is Url => u !== null);
      }
    } catch {
      // Ignore parse errors
    }
  } else if (Array.isArray(rawPhotoUrls)) {
    photoUrls = (rawPhotoUrls as unknown[])
      .filter((u): u is string => typeof u === "string")
      .map((u) => createUrl(u))
      .filter((u): u is Url => u !== null);
  }

  // Parse dietary tags
  const dietaryTags = new Set<string>();
  const rawDietaryTags = params["dietary_tags"];
  if (typeof rawDietaryTags === "string") {
    try {
      const parsed = JSON.parse(rawDietaryTags) as unknown;
      if (Array.isArray(parsed)) {
        for (const tag of parsed) {
          if (typeof tag === "string" && VALID_DIETARY_TAGS.has(tag)) {
            dietaryTags.add(tag);
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  } else if (Array.isArray(rawDietaryTags)) {
    for (const tag of rawDietaryTags) {
      if (typeof tag === "string" && VALID_DIETARY_TAGS.has(tag)) {
        dietaryTags.add(tag);
      }
    }
  }

  // Parse confidence
  const overallConfidence =
    typeof params["overall_confidence"] === "number" ? params["overall_confidence"] : 0.5;

  const fieldScores: Record<string, number> = {};
  const rawFieldScores = params["field_scores"];
  if (typeof rawFieldScores === "string") {
    try {
      const parsed = JSON.parse(rawFieldScores) as unknown;
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        for (const [key, value] of Object.entries(obj)) {
          if (typeof value === "number") {
            fieldScores[key] = value;
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  } else if (
    rawFieldScores !== null &&
    typeof rawFieldScores === "object" &&
    !Array.isArray(rawFieldScores)
  ) {
    const obj = rawFieldScores as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "number") {
        fieldScores[key] = value;
      }
    }
  }

  const extract: RecipeExtract = {
    title,
    description,
    ingredients: ingredientGroups,
    instructions,
    timing: {
      prep_minutes: prepMinutes,
      cook_minutes: cookMinutes,
      total_minutes: totalMinutes,
    },
    yield: recipeYield,
    notes,
    photo_urls: photoUrls,
    dietary_tags: dietaryTags as ReadonlySet<string> as RecipeExtract["dietary_tags"],
    confidence: {
      overall: overallConfidence,
      field_scores: fieldScores,
    },
  };

  return ok(extract);
}

// ---------------------------------------------------------------------------
// Ingredient group parsing helpers
// ---------------------------------------------------------------------------

function parseIngredientGroups(groups: unknown[]): RecipeExtract["ingredients"] {
  const result: {
    label: string | null;
    ingredients: readonly {
      raw_text: string;
      quantity: null;
      unit: string | null;
      item: string | null;
      notes: string | null;
      confidence: number;
    }[];
  }[] = [];

  for (const group of groups) {
    if (group === null || typeof group !== "object") continue;
    const g = group as Record<string, unknown>;
    const label = typeof g["label"] === "string" ? g["label"] : null;
    const rawIngs = g["ingredients"];

    if (!Array.isArray(rawIngs)) continue;

    const ingredients: {
      raw_text: string;
      quantity: null;
      unit: string | null;
      item: string | null;
      notes: string | null;
      confidence: number;
    }[] = [];

    for (const ing of rawIngs) {
      if (typeof ing === "string") {
        ingredients.push({
          raw_text: ing,
          quantity: null,
          unit: null,
          item: null,
          notes: null,
          confidence: 0.7,
        });
      } else if (ing !== null && typeof ing === "object") {
        const i = ing as Record<string, unknown>;
        ingredients.push({
          raw_text: typeof i["raw_text"] === "string" ? i["raw_text"] : String(ing),
          quantity: null,
          unit: typeof i["unit"] === "string" ? i["unit"] : null,
          item: typeof i["item"] === "string" ? i["item"] : null,
          notes: typeof i["notes"] === "string" ? i["notes"] : null,
          confidence: typeof i["confidence"] === "number" ? i["confidence"] : 0.7,
        });
      }
    }

    result.push({ label, ingredients });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Create all tools for the agent
// ---------------------------------------------------------------------------

export interface CreateAllToolsConfig {
  readonly deps: ToolDeps;
  readonly visionModel: string;
  readonly transcriptionModel: string;
}

/**
 * Create all agent tools with injected dependencies.
 */
export function createAllTools(config: CreateAllToolsConfig): AgentTool[] {
  return [
    createFetchUrlTool(config.deps),
    createExtractSchemaOrgTool(),
    createExtractVisibleTextTool(),
    createFindLinksTool(),
    createAnalyzeImageTool(config.deps, config.visionModel),
    createTranscribeAudioTool(config.deps, config.transcriptionModel),
    createGetYoutubeInfoTool(config.deps),
    createGetSocialPostTool(config.deps),
    createExtractRecipeTool(),
  ];
}
