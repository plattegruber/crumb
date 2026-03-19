// ---------------------------------------------------------------------------
// Tests for AI extraction agent loop
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import {
  runExtractionAgent,
  type AgentConfig,
  type AgentInput,
} from "../../../src/lib/ai/agent.js";
import type { AiRunFn, FetchFn } from "../../../src/lib/ai/tools.js";
import {
  createFetchUrlTool,
  createExtractSchemaOrgTool,
  createExtractVisibleTextTool,
  createFindLinksTool,
  createExtractRecipeTool,
} from "../../../src/lib/ai/tools.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const SCHEMA_ORG_HTML = `<!doctype html>
<html>
<head>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Recipe",
    "name": "Test Pasta",
    "description": "A test pasta recipe.",
    "recipeIngredient": ["1 pound pasta", "2 tbsp olive oil"],
    "recipeInstructions": [
      {"@type": "HowToStep", "text": "Boil pasta."},
      {"@type": "HowToStep", "text": "Add oil and serve."}
    ],
    "prepTime": "PT5M",
    "cookTime": "PT10M",
    "totalTime": "PT15M",
    "recipeYield": "2 servings",
    "image": ["https://example.com/pasta.jpg"]
  }
  </script>
</head>
<body><h1>Test Pasta</h1></body>
</html>`;

const NO_SCHEMA_HTML = `<!doctype html>
<html>
<body>
  <h1>Simple Cookies</h1>
  <p>Easy cookie recipe</p>
  <h2>Ingredients</h2>
  <ul>
    <li>2 cups flour</li>
    <li>1 cup sugar</li>
  </ul>
  <h2>Instructions</h2>
  <ol>
    <li>Mix ingredients</li>
    <li>Bake at 350F</li>
  </ol>
</body>
</html>`;

const LINK_IN_BIO_HTML = `<!doctype html>
<html>
<body>
  <h1>My Links</h1>
  <a href="https://example.com/recipe-page">Check out my recipe!</a>
  <a href="https://instagram.com/me">Instagram</a>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Mock AI model that returns scripted tool calls
// ---------------------------------------------------------------------------

interface ScriptedResponse {
  tool_calls?: { name: string; arguments: Record<string, unknown> }[];
  response?: string;
}

/**
 * Create a mock AI run function that returns scripted responses
 * based on the turn number.
 */
function createScriptedAiRunFn(script: ScriptedResponse[]): {
  aiRunFn: AiRunFn;
  callCount: () => number;
} {
  let callIdx = 0;

  return {
    aiRunFn: async (_model: string, _inputs: Record<string, unknown>): Promise<unknown> => {
      const response = script[callIdx];
      callIdx++;
      if (response === undefined) {
        return { response: "No more scripted responses" };
      }
      return response;
    },
    callCount: () => callIdx,
  };
}

/**
 * Create a mock fetch function that returns different HTML for different URLs.
 */
function createScriptedFetchFn(pages: Map<string, string>): FetchFn {
  return async (url: string, _init?: RequestInit): Promise<Response> => {
    const content = pages.get(url);
    if (content === undefined) {
      return new Response("Not Found", { status: 404 });
    }
    return new Response(content, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  };
}

// ---------------------------------------------------------------------------
// Test: URL with schema.org -> agent calls fetch_url, extract_schema_org, extract_recipe
// ---------------------------------------------------------------------------

describe("runExtractionAgent", () => {
  it("extracts recipe from URL with schema.org markup", async () => {
    const pages = new Map([["https://example.com/recipe", SCHEMA_ORG_HTML]]);

    const fetchFn = createScriptedFetchFn(pages);

    // Script the AI to: 1) fetch_url, 2) extract_schema_org, 3) extract_recipe
    const { aiRunFn } = createScriptedAiRunFn([
      {
        tool_calls: [
          {
            name: "fetch_url",
            arguments: { url: "https://example.com/recipe" },
          },
        ],
      },
      {
        tool_calls: [
          {
            name: "extract_schema_org",
            arguments: { html: SCHEMA_ORG_HTML },
          },
        ],
      },
      {
        tool_calls: [
          {
            name: "extract_recipe",
            arguments: {
              title: "Test Pasta",
              description: "A test pasta recipe.",
              ingredients: JSON.stringify([
                {
                  label: null,
                  ingredients: [
                    { raw_text: "1 pound pasta", confidence: 0.95 },
                    { raw_text: "2 tbsp olive oil", confidence: 0.95 },
                  ],
                },
              ]),
              instructions: JSON.stringify(["Boil pasta.", "Add oil and serve."]),
              prep_minutes: 5,
              cook_minutes: 10,
              total_minutes: 15,
              yield_quantity: 2,
              yield_unit: "servings",
              photo_urls: JSON.stringify(["https://example.com/pasta.jpg"]),
              dietary_tags: JSON.stringify([]),
              overall_confidence: 0.95,
              field_scores: JSON.stringify({ title: 0.95, ingredients: 0.95 }),
            },
          },
        ],
      },
    ]);

    const tools = [
      createFetchUrlTool({ fetchFn, aiRunFn }),
      createExtractSchemaOrgTool(),
      createExtractVisibleTextTool(),
      createFindLinksTool(),
      createExtractRecipeTool(),
    ];

    const config: AgentConfig = {
      aiRunFn,
      fetchFn,
      maxTurns: 10,
      timeoutMs: 30000,
      tools,
    };

    const input: AgentInput = {
      type: "url",
      content: "https://example.com/recipe",
    };

    const result = await runExtractionAgent(config, input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.title).toBe("Test Pasta");
    expect(result.value.description).toBe("A test pasta recipe.");
    expect(result.value.ingredients).toHaveLength(1);
    expect(result.value.instructions).toHaveLength(2);
    expect(result.value.timing.prep_minutes).toBe(5);
    expect(result.value.timing.cook_minutes).toBe(10);
    expect(result.value.yield?.quantity).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Test: URL without schema.org -> agent calls fetch_url, extract_visible_text, extract_recipe
  // ---------------------------------------------------------------------------

  it("extracts recipe from URL without schema.org markup", async () => {
    const pages = new Map([["https://example.com/blog-recipe", NO_SCHEMA_HTML]]);

    const fetchFn = createScriptedFetchFn(pages);

    const { aiRunFn } = createScriptedAiRunFn([
      // Turn 1: fetch the URL
      {
        tool_calls: [
          {
            name: "fetch_url",
            arguments: { url: "https://example.com/blog-recipe" },
          },
        ],
      },
      // Turn 2: try schema.org (will find none)
      {
        tool_calls: [
          {
            name: "extract_schema_org",
            arguments: { html: NO_SCHEMA_HTML },
          },
        ],
      },
      // Turn 3: extract visible text
      {
        tool_calls: [
          {
            name: "extract_visible_text",
            arguments: { html: NO_SCHEMA_HTML },
          },
        ],
      },
      // Turn 4: produce the final extract
      {
        tool_calls: [
          {
            name: "extract_recipe",
            arguments: {
              title: "Simple Cookies",
              description: "Easy cookie recipe",
              ingredients: JSON.stringify([
                {
                  label: null,
                  ingredients: [
                    { raw_text: "2 cups flour", confidence: 0.8 },
                    { raw_text: "1 cup sugar", confidence: 0.8 },
                  ],
                },
              ]),
              instructions: JSON.stringify(["Mix ingredients", "Bake at 350F"]),
              overall_confidence: 0.75,
            },
          },
        ],
      },
    ]);

    const tools = [
      createFetchUrlTool({ fetchFn, aiRunFn }),
      createExtractSchemaOrgTool(),
      createExtractVisibleTextTool(),
      createFindLinksTool(),
      createExtractRecipeTool(),
    ];

    const config: AgentConfig = {
      aiRunFn,
      fetchFn,
      maxTurns: 10,
      timeoutMs: 30000,
      tools,
    };

    const input: AgentInput = {
      type: "url",
      content: "https://example.com/blog-recipe",
    };

    const result = await runExtractionAgent(config, input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.title).toBe("Simple Cookies");
    expect(result.value.ingredients).toHaveLength(1);
    expect(result.value.instructions).toHaveLength(2);
    expect(result.value.confidence.overall).toBe(0.75);
  });

  // ---------------------------------------------------------------------------
  // Test: max turns safety limit
  // ---------------------------------------------------------------------------

  it("returns error when max turns is exceeded", async () => {
    const fetchFn = createScriptedFetchFn(new Map());

    // Script the AI to always call fetch_url (never terminates)
    const infiniteScript: ScriptedResponse[] = Array.from({ length: 5 }, () => ({
      tool_calls: [
        {
          name: "fetch_url",
          arguments: { url: "https://example.com/loop" },
        },
      ],
    }));

    const { aiRunFn } = createScriptedAiRunFn(infiniteScript);

    const tools = [createFetchUrlTool({ fetchFn, aiRunFn }), createExtractRecipeTool()];

    const config: AgentConfig = {
      aiRunFn,
      fetchFn,
      maxTurns: 3,
      timeoutMs: 30000,
      tools,
    };

    const input: AgentInput = {
      type: "url",
      content: "https://example.com/loop",
    };

    const result = await runExtractionAgent(config, input);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.type).toBe("ExtractionFailed");
    if (result.error.type === "ExtractionFailed") {
      expect(result.error.reason).toContain("exceeded maximum number of turns");
    }
  });

  // ---------------------------------------------------------------------------
  // Test: agent follows a link when first page has no recipe
  // ---------------------------------------------------------------------------

  it("follows link when first page has no recipe", async () => {
    const pages = new Map([
      ["https://example.com/linktree", LINK_IN_BIO_HTML],
      ["https://example.com/recipe-page", SCHEMA_ORG_HTML],
    ]);

    const fetchFn = createScriptedFetchFn(pages);

    const { aiRunFn } = createScriptedAiRunFn([
      // Turn 1: fetch the linktree page
      {
        tool_calls: [
          {
            name: "fetch_url",
            arguments: { url: "https://example.com/linktree" },
          },
        ],
      },
      // Turn 2: find links with keyword "recipe"
      {
        tool_calls: [
          {
            name: "find_links",
            arguments: { html: LINK_IN_BIO_HTML, keyword: "recipe" },
          },
        ],
      },
      // Turn 3: follow the recipe link
      {
        tool_calls: [
          {
            name: "fetch_url",
            arguments: { url: "https://example.com/recipe-page" },
          },
        ],
      },
      // Turn 4: extract schema.org from the recipe page
      {
        tool_calls: [
          {
            name: "extract_schema_org",
            arguments: { html: SCHEMA_ORG_HTML },
          },
        ],
      },
      // Turn 5: produce final extract
      {
        tool_calls: [
          {
            name: "extract_recipe",
            arguments: {
              title: "Test Pasta",
              ingredients: JSON.stringify([
                {
                  label: null,
                  ingredients: [
                    { raw_text: "1 pound pasta", confidence: 0.95 },
                    { raw_text: "2 tbsp olive oil", confidence: 0.95 },
                  ],
                },
              ]),
              instructions: JSON.stringify(["Boil pasta.", "Add oil and serve."]),
              overall_confidence: 0.9,
            },
          },
        ],
      },
    ]);

    const tools = [
      createFetchUrlTool({ fetchFn, aiRunFn }),
      createExtractSchemaOrgTool(),
      createExtractVisibleTextTool(),
      createFindLinksTool(),
      createExtractRecipeTool(),
    ];

    const config: AgentConfig = {
      aiRunFn,
      fetchFn,
      maxTurns: 10,
      timeoutMs: 30000,
      tools,
    };

    const input: AgentInput = {
      type: "url",
      content: "https://example.com/linktree",
    };

    const result = await runExtractionAgent(config, input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.title).toBe("Test Pasta");
    expect(result.value.ingredients).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // Test: text input goes directly to extract_recipe
  // ---------------------------------------------------------------------------

  it("handles plain text input", async () => {
    const fetchFn = createScriptedFetchFn(new Map());

    const { aiRunFn } = createScriptedAiRunFn([
      {
        tool_calls: [
          {
            name: "extract_recipe",
            arguments: {
              title: "Pasted Recipe",
              ingredients: JSON.stringify([
                {
                  label: null,
                  ingredients: [{ raw_text: "Some ingredient", confidence: 0.7 }],
                },
              ]),
              instructions: JSON.stringify(["Do the thing"]),
              overall_confidence: 0.7,
            },
          },
        ],
      },
    ]);

    const tools = [createFetchUrlTool({ fetchFn, aiRunFn }), createExtractRecipeTool()];

    const config: AgentConfig = {
      aiRunFn,
      fetchFn,
      maxTurns: 10,
      timeoutMs: 30000,
      tools,
    };

    const input: AgentInput = {
      type: "text",
      content: "Some recipe text pasted by user",
    };

    const result = await runExtractionAgent(config, input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.title).toBe("Pasted Recipe");
  });

  // ---------------------------------------------------------------------------
  // Test: AI model error
  // ---------------------------------------------------------------------------

  it("returns error when AI model call fails", async () => {
    const fetchFn = createScriptedFetchFn(new Map());
    const aiRunFn: AiRunFn = async () => {
      throw new Error("Model unavailable");
    };

    const config: AgentConfig = {
      aiRunFn,
      fetchFn,
      maxTurns: 10,
      timeoutMs: 30000,
      tools: [createExtractRecipeTool()],
    };

    const input: AgentInput = {
      type: "text",
      content: "Some text",
    };

    const result = await runExtractionAgent(config, input);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.type).toBe("ExtractionFailed");
    if (result.error.type === "ExtractionFailed") {
      expect(result.error.reason).toContain("AI model call failed");
    }
  });

  // ---------------------------------------------------------------------------
  // Test: unknown tool called by model
  // ---------------------------------------------------------------------------

  it("handles unknown tool call gracefully", async () => {
    const fetchFn = createScriptedFetchFn(new Map());

    const { aiRunFn } = createScriptedAiRunFn([
      // Turn 1: model calls an unknown tool
      {
        tool_calls: [
          {
            name: "nonexistent_tool",
            arguments: {},
          },
        ],
      },
      // Turn 2: model calls extract_recipe after getting error
      {
        tool_calls: [
          {
            name: "extract_recipe",
            arguments: {
              title: "Recovered Recipe",
              ingredients: JSON.stringify([
                { label: null, ingredients: [{ raw_text: "1 item", confidence: 0.5 }] },
              ]),
              instructions: JSON.stringify(["Step 1"]),
              overall_confidence: 0.5,
            },
          },
        ],
      },
    ]);

    const config: AgentConfig = {
      aiRunFn,
      fetchFn,
      maxTurns: 10,
      timeoutMs: 30000,
      tools: [createExtractRecipeTool()],
    };

    const input: AgentInput = {
      type: "text",
      content: "Some text",
    };

    const result = await runExtractionAgent(config, input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("Recovered Recipe");
  });

  // ---------------------------------------------------------------------------
  // Test: model returns text response, agent tries to parse
  // ---------------------------------------------------------------------------

  it("handles text response from model and asks to use tool", async () => {
    const fetchFn = createScriptedFetchFn(new Map());

    const { aiRunFn } = createScriptedAiRunFn([
      // Turn 1: model returns text instead of tool call
      {
        response: "I found a recipe for pasta but let me format it properly.",
      },
      // Turn 2: after being prompted, model calls extract_recipe
      {
        tool_calls: [
          {
            name: "extract_recipe",
            arguments: {
              title: "Text Response Recipe",
              ingredients: JSON.stringify([
                { label: null, ingredients: [{ raw_text: "1 item", confidence: 0.6 }] },
              ]),
              instructions: JSON.stringify(["Make it"]),
              overall_confidence: 0.6,
            },
          },
        ],
      },
    ]);

    const config: AgentConfig = {
      aiRunFn,
      fetchFn,
      maxTurns: 10,
      timeoutMs: 30000,
      tools: [createExtractRecipeTool()],
    };

    const result = await runExtractionAgent(config, {
      type: "text",
      content: "A recipe",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("Text Response Recipe");
  });

  // ---------------------------------------------------------------------------
  // Test: empty response from model
  // ---------------------------------------------------------------------------

  it("returns error on empty AI response", async () => {
    const fetchFn = createScriptedFetchFn(new Map());

    const { aiRunFn } = createScriptedAiRunFn([
      {}, // Empty response — no tool_calls, no response
    ]);

    const config: AgentConfig = {
      aiRunFn,
      fetchFn,
      maxTurns: 10,
      timeoutMs: 30000,
      tools: [createExtractRecipeTool()],
    };

    const result = await runExtractionAgent(config, {
      type: "text",
      content: "Some text",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.type).toBe("ExtractionFailed");
    if (result.error.type === "ExtractionFailed") {
      expect(result.error.reason).toContain("empty response");
    }
  });

  // ---------------------------------------------------------------------------
  // Test: Claude agent retries when model returns text instead of tool call
  // ---------------------------------------------------------------------------

  it("Claude path retries with tool-use prompt when model returns text", async () => {
    let callCount = 0;

    // Mock fetch intercepting SDK requests to Anthropic API.
    // The SDK passes a Request object (or URL string) as the first argument.
    const mockFetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/v1/messages")) {
        callCount++;
        if (callCount === 1) {
          // First call: model returns text (end_turn)
          return new Response(
            JSON.stringify({
              id: "msg_1",
              type: "message",
              role: "assistant",
              model: "claude-sonnet-4-0",
              content: [
                {
                  type: "text",
                  text: "I could not find a recipe on this Instagram page.",
                },
              ],
              stop_reason: "end_turn",
              usage: { input_tokens: 100, output_tokens: 50 },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        // Second call: after retry prompt, model calls extract_recipe
        return new Response(
          JSON.stringify({
            id: "msg_2",
            type: "message",
            role: "assistant",
            model: "claude-sonnet-4-0",
            content: [
              {
                type: "tool_use",
                id: "tu_1",
                name: "extract_recipe",
                input: {
                  title: "Instagram Recipe",
                  ingredients: JSON.stringify([
                    {
                      label: null,
                      ingredients: [{ raw_text: "1 cup flour", confidence: 0.6 }],
                    },
                  ]),
                  instructions: JSON.stringify(["Mix and bake"]),
                  overall_confidence: 0.4,
                },
              },
            ],
            stop_reason: "tool_use",
            usage: { input_tokens: 200, output_tokens: 80 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      // Non-API fetches (e.g., tool fetch_url calls)
      return new Response("Not Found", { status: 404 });
    };

    const dummyFetchFn: FetchFn = async () => new Response("Not Found", { status: 404 });

    const config: AgentConfig = {
      anthropicApiKey: "test-key",
      fetchFn: dummyFetchFn,
      anthropicFetchFn: mockFetch,
      maxTurns: 10,
      timeoutMs: 30000,
      tools: [createExtractRecipeTool()],
    };

    const result = await runExtractionAgent(config, {
      type: "url",
      content: "https://www.instagram.com/reels/test123/",
    });

    expect(callCount).toBe(2); // Verifies the retry happened
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("Instagram Recipe");
    expect(result.value.confidence.overall).toBe(0.4);
  });

  // ---------------------------------------------------------------------------
  // Test: Claude agent handles tool_use blocks when stop_reason is max_tokens
  // ---------------------------------------------------------------------------

  it("Claude path processes tool_use blocks even when stop_reason is max_tokens", async () => {
    let callCount = 0;

    const mockFetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/v1/messages")) {
        callCount++;
        if (callCount === 1) {
          // Response hit max_tokens but includes a completed tool_use block
          return new Response(
            JSON.stringify({
              id: "msg_1",
              type: "message",
              role: "assistant",
              model: "claude-sonnet-4-0",
              content: [
                {
                  type: "text",
                  text: "Let me fetch the page to extract the recipe.",
                },
                {
                  type: "tool_use",
                  id: "tu_fetch",
                  name: "fetch_url",
                  input: { url: "https://example.com/recipe" },
                },
              ],
              stop_reason: "max_tokens",
              usage: { input_tokens: 100, output_tokens: 4096 },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        // Second call: model calls extract_recipe with the fetched data
        return new Response(
          JSON.stringify({
            id: "msg_2",
            type: "message",
            role: "assistant",
            model: "claude-sonnet-4-0",
            content: [
              {
                type: "tool_use",
                id: "tu_extract",
                name: "extract_recipe",
                input: {
                  title: "Max Tokens Recipe",
                  ingredients: JSON.stringify([
                    {
                      label: null,
                      ingredients: [{ raw_text: "2 cups rice", confidence: 0.9 }],
                    },
                  ]),
                  instructions: JSON.stringify(["Cook the rice"]),
                  overall_confidence: 0.8,
                },
              },
            ],
            stop_reason: "tool_use",
            usage: { input_tokens: 300, output_tokens: 100 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      // Tool fetch_url returns recipe HTML
      return new Response("<html><body><h1>Rice Recipe</h1><p>2 cups rice</p></body></html>", {
        status: 200,
      });
    };

    const dummyFetchFn: FetchFn = async () =>
      new Response("<html><body>Rice Recipe</body></html>", { status: 200 });

    const config: AgentConfig = {
      anthropicApiKey: "test-key",
      fetchFn: dummyFetchFn,
      anthropicFetchFn: mockFetch,
      maxTurns: 10,
      timeoutMs: 30000,
      tools: [
        createFetchUrlTool({ fetchFn: dummyFetchFn, aiRunFn: async () => ({}) }),
        createExtractRecipeTool(),
      ],
    };

    const result = await runExtractionAgent(config, {
      type: "url",
      content: "https://example.com/recipe",
    });

    // Should have made 2 API calls: first with tool_use in max_tokens response,
    // second where model extracts the recipe. Without the fix, the second call
    // would fail with a 400 because tool_result was missing.
    expect(callCount).toBe(2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("Max Tokens Recipe");
  });
});
