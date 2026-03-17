// ---------------------------------------------------------------------------
// Tests for AI extraction agent tools
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import {
  createFetchUrlTool,
  createExtractSchemaOrgTool,
  createExtractVisibleTextTool,
  createFindLinksTool,
  createAnalyzeImageTool,
  createGetYoutubeInfoTool,
  createGetSocialPostTool,
  createExtractRecipeTool,
  parseExtractRecipeOutput,
  extractLinks,
  type ToolDeps,
  type FetchFn,
  type AiRunFn,
} from "../../../src/lib/ai/tools.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const SCHEMA_ORG_HTML = `<!doctype html>
<html>
<head>
  <title>Test Recipe</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Recipe",
    "name": "Test Pasta",
    "description": "A simple test pasta recipe.",
    "image": ["https://example.com/pasta.jpg"],
    "prepTime": "PT10M",
    "cookTime": "PT20M",
    "totalTime": "PT30M",
    "recipeYield": "4 servings",
    "recipeIngredient": [
      "1 pound pasta",
      "2 tablespoons olive oil",
      "3 cloves garlic"
    ],
    "recipeInstructions": [
      {"@type": "HowToStep", "text": "Boil the pasta."},
      {"@type": "HowToStep", "text": "Heat oil and garlic."},
      {"@type": "HowToStep", "text": "Combine and serve."}
    ]
  }
  </script>
</head>
<body><h1>Test Pasta</h1></body>
</html>`;

const NO_SCHEMA_HTML = `<!doctype html>
<html>
<head><title>My Recipe Blog</title></head>
<body>
  <h1>Grandma's Cookies</h1>
  <p>These are the best cookies ever.</p>
  <h2>Ingredients</h2>
  <ul>
    <li>2 cups flour</li>
    <li>1 cup sugar</li>
    <li>2 eggs</li>
  </ul>
  <h2>Instructions</h2>
  <ol>
    <li>Mix dry ingredients.</li>
    <li>Add eggs.</li>
    <li>Bake at 350F for 12 minutes.</li>
  </ol>
  <script>console.log("tracking");</script>
  <style>.hidden { display: none; }</style>
</body>
</html>`;

const LINK_PAGE_HTML = `<!doctype html>
<html>
<body>
  <h1>My Links</h1>
  <a href="https://example.com/recipe1">My Best Recipe</a>
  <a href="https://example.com/about">About Me</a>
  <a href="https://example.com/recipe2">Chocolate Cake Recipe</a>
  <a href="https://instagram.com/me">Follow me on Instagram</a>
  <a href="https://example.com/shop">Shop</a>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockFetchFn(
  responses: Map<string, { status: number; text: string; url?: string }>,
): FetchFn {
  return async (url: string, _init?: RequestInit): Promise<Response> => {
    const response = responses.get(url);
    if (response === undefined) {
      throw new Error(`No mock response for URL: ${url}`);
    }
    return new Response(response.text, {
      status: response.status,
      headers: { "Content-Type": "text/html" },
    });
  };
}

function createMockAiRunFn(responses: Map<string, unknown>): AiRunFn {
  return async (model: string, _inputs: Record<string, unknown>): Promise<unknown> => {
    const response = responses.get(model);
    if (response === undefined) {
      throw new Error(`No mock response for model: ${model}`);
    }
    return response;
  };
}

function createMockDeps(overrides?: Partial<ToolDeps>): ToolDeps {
  return {
    fetchFn: overrides?.fetchFn ?? createMockFetchFn(new Map()),
    aiRunFn: overrides?.aiRunFn ?? createMockAiRunFn(new Map()),
  };
}

// ---------------------------------------------------------------------------
// fetch_url tool tests
// ---------------------------------------------------------------------------

describe("fetch_url tool", () => {
  it("fetches a URL and returns content", async () => {
    const responses = new Map([
      [
        "https://example.com/recipe",
        { status: 200, text: "<html><body>Recipe content</body></html>" },
      ],
    ]);
    const deps = createMockDeps({ fetchFn: createMockFetchFn(responses) });
    const tool = createFetchUrlTool(deps);

    const result = await tool.execute({ url: "https://example.com/recipe" });
    const parsed = JSON.parse(result) as Record<string, unknown>;

    expect(parsed["status"]).toBe(200);
    expect(parsed["content"]).toContain("Recipe content");
  });

  it("returns error for missing url parameter", async () => {
    const deps = createMockDeps();
    const tool = createFetchUrlTool(deps);

    const result = await tool.execute({});
    const parsed = JSON.parse(result) as Record<string, unknown>;

    expect(parsed["error"]).toContain("url parameter is required");
  });

  it("returns error on fetch failure", async () => {
    const fetchFn: FetchFn = async () => {
      throw new Error("Network unreachable");
    };
    const deps = createMockDeps({ fetchFn });
    const tool = createFetchUrlTool(deps);

    const result = await tool.execute({ url: "https://unreachable.example.com" });
    const parsed = JSON.parse(result) as Record<string, unknown>;

    expect(parsed["error"]).toContain("Failed to fetch URL");
    expect(parsed["error"]).toContain("Network unreachable");
  });

  it("trims content exceeding 32000 characters", async () => {
    const longContent = "x".repeat(50000);
    const responses = new Map([["https://example.com/long", { status: 200, text: longContent }]]);
    const deps = createMockDeps({ fetchFn: createMockFetchFn(responses) });
    const tool = createFetchUrlTool(deps);

    const result = await tool.execute({ url: "https://example.com/long" });
    const parsed = JSON.parse(result) as Record<string, unknown>;
    const content = parsed["content"] as string;

    expect(content.length).toBe(32000);
    expect(parsed["content_length"]).toBe(50000);
  });
});

// ---------------------------------------------------------------------------
// extract_schema_org tool tests
// ---------------------------------------------------------------------------

describe("extract_schema_org tool", () => {
  it("extracts schema.org Recipe from HTML", async () => {
    const tool = createExtractSchemaOrgTool();
    const result = await tool.execute({ html: SCHEMA_ORG_HTML });
    const parsed = JSON.parse(result) as Record<string, unknown>;

    expect(parsed["found"]).toBe(true);
    const recipe = parsed["recipe"] as Record<string, unknown>;
    expect(recipe["name"]).toBe("Test Pasta");
    expect(recipe["description"]).toBe("A simple test pasta recipe.");
    expect(recipe["ingredients"]).toHaveLength(3);
    expect(recipe["instructions"]).toHaveLength(3);
    expect(recipe["prep_time"]).toBe("PT10M");
    expect(recipe["cook_time"]).toBe("PT20M");
    expect(recipe["yield"]).toBe("4 servings");
  });

  it("returns not found for HTML without schema.org", async () => {
    const tool = createExtractSchemaOrgTool();
    const result = await tool.execute({ html: NO_SCHEMA_HTML });
    const parsed = JSON.parse(result) as Record<string, unknown>;

    expect(parsed["found"]).toBe(false);
    expect(parsed["message"]).toContain("No schema.org");
  });

  it("returns error for missing html parameter", async () => {
    const tool = createExtractSchemaOrgTool();
    const result = await tool.execute({});
    const parsed = JSON.parse(result) as Record<string, unknown>;

    expect(parsed["error"]).toContain("html parameter is required");
  });
});

// ---------------------------------------------------------------------------
// extract_visible_text tool tests
// ---------------------------------------------------------------------------

describe("extract_visible_text tool", () => {
  it("strips HTML tags and returns visible text", async () => {
    const tool = createExtractVisibleTextTool();
    const result = await tool.execute({ html: NO_SCHEMA_HTML });
    const parsed = JSON.parse(result) as Record<string, unknown>;
    const text = parsed["text"] as string;

    expect(text).toContain("Grandma's Cookies");
    expect(text).toContain("2 cups flour");
    expect(text).toContain("Bake at 350F");
    // Script and style content should be removed
    expect(text).not.toContain("tracking");
    expect(text).not.toContain("display: none");
    // HTML tags should be removed
    expect(text).not.toContain("<h1>");
    expect(text).not.toContain("<li>");
  });

  it("respects max_length parameter", async () => {
    const tool = createExtractVisibleTextTool();
    const result = await tool.execute({ html: NO_SCHEMA_HTML, max_length: 50 });
    const parsed = JSON.parse(result) as Record<string, unknown>;
    const text = parsed["text"] as string;

    expect(text.length).toBeLessThanOrEqual(50);
  });

  it("returns error for missing html parameter", async () => {
    const tool = createExtractVisibleTextTool();
    const result = await tool.execute({});
    const parsed = JSON.parse(result) as Record<string, unknown>;

    expect(parsed["error"]).toContain("html parameter is required");
  });
});

// ---------------------------------------------------------------------------
// find_links tool tests
// ---------------------------------------------------------------------------

describe("find_links tool", () => {
  it("extracts all links from HTML", async () => {
    const tool = createFindLinksTool();
    const result = await tool.execute({ html: LINK_PAGE_HTML });
    const parsed = JSON.parse(result) as Record<string, unknown>;
    const links = parsed["links"] as { text: string; href: string }[];

    expect(links.length).toBe(5);
    expect(links[0]?.text).toBe("My Best Recipe");
    expect(links[0]?.href).toBe("https://example.com/recipe1");
  });

  it("filters links by keyword", async () => {
    const tool = createFindLinksTool();
    const result = await tool.execute({ html: LINK_PAGE_HTML, keyword: "recipe" });
    const parsed = JSON.parse(result) as Record<string, unknown>;
    const links = parsed["links"] as { text: string; href: string }[];

    expect(links.length).toBe(2);
    expect(links[0]?.text).toBe("My Best Recipe");
    expect(links[1]?.text).toBe("Chocolate Cake Recipe");
  });

  it("keyword filter is case-insensitive", async () => {
    const tool = createFindLinksTool();
    const result = await tool.execute({ html: LINK_PAGE_HTML, keyword: "RECIPE" });
    const parsed = JSON.parse(result) as Record<string, unknown>;
    const links = parsed["links"] as { text: string; href: string }[];

    expect(links.length).toBe(2);
  });

  it("returns empty array when no links match keyword", async () => {
    const tool = createFindLinksTool();
    const result = await tool.execute({ html: LINK_PAGE_HTML, keyword: "nonexistent" });
    const parsed = JSON.parse(result) as Record<string, unknown>;
    const links = parsed["links"] as { text: string; href: string }[];

    expect(links.length).toBe(0);
  });

  it("returns error for missing html parameter", async () => {
    const tool = createFindLinksTool();
    const result = await tool.execute({});
    const parsed = JSON.parse(result) as Record<string, unknown>;

    expect(parsed["error"]).toContain("html parameter is required");
  });
});

// ---------------------------------------------------------------------------
// extractLinks helper tests
// ---------------------------------------------------------------------------

describe("extractLinks", () => {
  it("extracts links with nested HTML in link text", () => {
    const html = '<a href="/page"><span class="bold">Click Here</span></a>';
    const links = extractLinks(html);
    expect(links.length).toBe(1);
    expect(links[0]?.text).toBe("Click Here");
    expect(links[0]?.href).toBe("/page");
  });

  it("returns empty array for HTML with no links", () => {
    const links = extractLinks("<p>No links here</p>");
    expect(links.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// analyze_image tool tests
// ---------------------------------------------------------------------------

describe("analyze_image tool", () => {
  it("calls vision model with image URL", async () => {
    const aiRunFn = createMockAiRunFn(
      new Map([
        ["@cf/meta/llama-3.2-11b-vision-instruct", { response: "This is a recipe for pasta." }],
      ]),
    );
    const deps = createMockDeps({ aiRunFn });
    const tool = createAnalyzeImageTool(deps, "@cf/meta/llama-3.2-11b-vision-instruct");

    const result = await tool.execute({
      image_url: "https://example.com/recipe.jpg",
      question: "What recipe is shown in this image?",
    });
    const parsed = JSON.parse(result) as Record<string, unknown>;

    expect(parsed["answer"]).toBe("This is a recipe for pasta.");
  });

  it("returns error when no image source provided", async () => {
    const deps = createMockDeps();
    const tool = createAnalyzeImageTool(deps, "@cf/meta/llama-3.2-11b-vision-instruct");

    const result = await tool.execute({
      question: "What is this?",
    });
    const parsed = JSON.parse(result) as Record<string, unknown>;

    expect(parsed["error"]).toContain("Either image_url or image_base64 must be provided");
  });

  it("returns error when question is missing", async () => {
    const deps = createMockDeps();
    const tool = createAnalyzeImageTool(deps, "@cf/meta/llama-3.2-11b-vision-instruct");

    const result = await tool.execute({
      image_url: "https://example.com/recipe.jpg",
    });
    const parsed = JSON.parse(result) as Record<string, unknown>;

    expect(parsed["error"]).toContain("question parameter is required");
  });

  it("handles vision model error", async () => {
    const aiRunFn: AiRunFn = async () => {
      throw new Error("Model overloaded");
    };
    const deps = createMockDeps({ aiRunFn });
    const tool = createAnalyzeImageTool(deps, "@cf/meta/llama-3.2-11b-vision-instruct");

    const result = await tool.execute({
      image_url: "https://example.com/recipe.jpg",
      question: "What recipe?",
    });
    const parsed = JSON.parse(result) as Record<string, unknown>;

    expect(parsed["error"]).toContain("Vision analysis failed");
  });
});

// ---------------------------------------------------------------------------
// get_youtube_info tool tests
// ---------------------------------------------------------------------------

describe("get_youtube_info tool", () => {
  it("fetches YouTube oEmbed data", async () => {
    const oembedResponse = JSON.stringify({
      title: "Easy Pasta Recipe",
      author_name: "Chef Test",
      author_url: "https://youtube.com/@cheftest",
      thumbnail_url: "https://img.youtube.com/vi/abc123/0.jpg",
    });

    const fetchFn: FetchFn = async (_url: string) => {
      return new Response(oembedResponse, { status: 200 });
    };
    const deps = createMockDeps({ fetchFn });
    const tool = createGetYoutubeInfoTool(deps);

    const result = await tool.execute({
      video_url: "https://youtube.com/watch?v=abc123",
    });
    const parsed = JSON.parse(result) as Record<string, unknown>;

    expect(parsed["title"]).toBe("Easy Pasta Recipe");
    expect(parsed["author_name"]).toBe("Chef Test");
  });

  it("returns error for missing video_url", async () => {
    const deps = createMockDeps();
    const tool = createGetYoutubeInfoTool(deps);

    const result = await tool.execute({});
    const parsed = JSON.parse(result) as Record<string, unknown>;

    expect(parsed["error"]).toContain("video_url parameter is required");
  });
});

// ---------------------------------------------------------------------------
// get_social_post tool tests
// ---------------------------------------------------------------------------

describe("get_social_post tool", () => {
  it("fetches Instagram oEmbed data", async () => {
    const oembedResponse = JSON.stringify({
      title: "My recipe post",
      author_name: "foodcreator",
      html: "<blockquote>Recipe content</blockquote>",
    });

    const fetchFn: FetchFn = async (_url: string) => {
      return new Response(oembedResponse, { status: 200 });
    };
    const deps = createMockDeps({ fetchFn });
    const tool = createGetSocialPostTool(deps);

    const result = await tool.execute({
      url: "https://instagram.com/p/abc123",
      platform: "instagram",
    });
    const parsed = JSON.parse(result) as Record<string, unknown>;

    expect(parsed["title"]).toBe("My recipe post");
    expect(parsed["author_name"]).toBe("foodcreator");
  });

  it("returns error for missing parameters", async () => {
    const deps = createMockDeps();
    const tool = createGetSocialPostTool(deps);

    const result = await tool.execute({});
    const parsed = JSON.parse(result) as Record<string, unknown>;

    expect(parsed["error"]).toContain("url and platform parameters are required");
  });
});

// ---------------------------------------------------------------------------
// extract_recipe tool tests
// ---------------------------------------------------------------------------

describe("extract_recipe tool", () => {
  it("returns terminal marker with data", async () => {
    const tool = createExtractRecipeTool();
    const result = await tool.execute({
      title: "Test Recipe",
      ingredients: '[{"label": null, "ingredients": [{"raw_text": "1 cup flour"}]}]',
      instructions: '["Mix ingredients", "Bake"]',
      overall_confidence: 0.9,
    });
    const parsed = JSON.parse(result) as Record<string, unknown>;

    expect(parsed["__terminal"]).toBe(true);
    expect(parsed["data"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// parseExtractRecipeOutput tests
// ---------------------------------------------------------------------------

describe("parseExtractRecipeOutput", () => {
  it("parses a complete recipe extract", () => {
    const result = parseExtractRecipeOutput({
      title: "Chocolate Cake",
      description: "A rich chocolate cake",
      ingredients: JSON.stringify([
        {
          label: null,
          ingredients: [
            { raw_text: "2 cups flour", item: "flour", unit: "cups", confidence: 0.95 },
            { raw_text: "1 cup sugar", item: "sugar", unit: "cups", confidence: 0.9 },
          ],
        },
      ]),
      instructions: JSON.stringify([
        "Preheat oven to 350F",
        "Mix dry ingredients",
        "Bake for 30 minutes",
      ]),
      prep_minutes: 15,
      cook_minutes: 30,
      total_minutes: 45,
      yield_quantity: 8,
      yield_unit: "servings",
      notes: "Best served warm",
      photo_urls: JSON.stringify(["https://example.com/cake.jpg"]),
      dietary_tags: JSON.stringify(["GlutenFree"]),
      overall_confidence: 0.9,
      field_scores: JSON.stringify({ title: 0.95, ingredients: 0.9 }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.title).toBe("Chocolate Cake");
    expect(result.value.description).toBe("A rich chocolate cake");
    expect(result.value.ingredients).toHaveLength(1);
    expect(result.value.ingredients[0]?.ingredients).toHaveLength(2);
    expect(result.value.instructions).toHaveLength(3);
    expect(result.value.timing.prep_minutes).toBe(15);
    expect(result.value.timing.cook_minutes).toBe(30);
    expect(result.value.timing.total_minutes).toBe(45);
    expect(result.value.yield?.quantity).toBe(8);
    expect(result.value.yield?.unit).toBe("servings");
    expect(result.value.notes).toBe("Best served warm");
    expect(result.value.photo_urls).toHaveLength(1);
    expect(result.value.dietary_tags.has("GlutenFree")).toBe(true);
    expect(result.value.confidence.overall).toBe(0.9);
    expect(result.value.confidence.field_scores["title"]).toBe(0.95);
  });

  it("handles minimal input gracefully", () => {
    const result = parseExtractRecipeOutput({
      title: "Simple Recipe",
      ingredients: JSON.stringify([{ label: null, ingredients: [{ raw_text: "1 egg" }] }]),
      instructions: JSON.stringify(["Cook the egg"]),
      overall_confidence: 0.7,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.title).toBe("Simple Recipe");
    expect(result.value.description).toBeNull();
    expect(result.value.timing.prep_minutes).toBeNull();
    expect(result.value.yield).toBeNull();
    expect(result.value.notes).toBeNull();
  });

  it("handles null title", () => {
    const result = parseExtractRecipeOutput({
      ingredients: "[]",
      instructions: "[]",
      overall_confidence: 0.3,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBeNull();
  });

  it("filters invalid dietary tags", () => {
    const result = parseExtractRecipeOutput({
      title: "Test",
      ingredients: "[]",
      instructions: "[]",
      overall_confidence: 0.5,
      dietary_tags: JSON.stringify(["GlutenFree", "InvalidTag", "Vegan"]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.dietary_tags.has("GlutenFree")).toBe(true);
    expect(result.value.dietary_tags.has("Vegan")).toBe(true);
    expect(result.value.dietary_tags.size).toBe(2);
  });

  it("filters invalid photo URLs", () => {
    const result = parseExtractRecipeOutput({
      title: "Test",
      ingredients: "[]",
      instructions: "[]",
      overall_confidence: 0.5,
      photo_urls: JSON.stringify(["https://example.com/photo.jpg", "not-a-url", "ftp://bad"]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.photo_urls).toHaveLength(1);
  });

  it("handles instructions as array directly", () => {
    const result = parseExtractRecipeOutput({
      title: "Test",
      ingredients: "[]",
      instructions: ["Step 1", "Step 2"],
      overall_confidence: 0.5,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.instructions).toEqual(["Step 1", "Step 2"]);
  });
});
