// ---------------------------------------------------------------------------
// Import Pipeline Tests (SPEC SS7)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../../src/db/schema.js";
import {
  createImportService,
  extractSchemaOrgRecipe,
  extractVisibleText,
  parseDuration,
  type RecipeExtractor,
  type HttpFetcher,
  type WordPressClient,
  type ImportQueue,
  type ImportServiceDeps,
  type WordPressRecipe,
} from "../../src/services/import.js";
import { handleImportQueue, type QueueMessage } from "../../src/services/queue-handlers.js";
import type { RecipeExtract, ImportError, Result } from "@crumb/shared";
import { ok, err, createImportJobId, createCreatorId } from "@crumb/shared";
import type { Database } from "../../src/db/index.js";

// @ts-expect-error -- Vite handles ?raw imports at build time
import migrationSql from "../../src/db/migrations/0001_initial_schema.sql?raw";

// ---------------------------------------------------------------------------
// Inline HTML fixtures (workerd runtime cannot use ?raw for non-SQL files)
// ---------------------------------------------------------------------------

const schemaOrgFixture = `<!DOCTYPE html>
<html>
<head>
  <title>Classic Lemon Pasta Recipe</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Recipe",
    "name": "Classic Lemon Pasta",
    "description": "A bright, zesty pasta dish that comes together in minutes.",
    "image": ["https://example.com/photos/lemon-pasta.jpg"],
    "prepTime": "PT10M",
    "cookTime": "PT15M",
    "totalTime": "PT25M",
    "recipeYield": "4 servings",
    "recipeIngredient": [
      "1 pound spaghetti",
      "3 tablespoons olive oil",
      "2 cloves garlic, minced",
      "Zest of 2 lemons",
      "1/4 cup fresh lemon juice",
      "1/2 cup grated Parmesan cheese",
      "Salt and pepper to taste",
      "Fresh basil leaves for garnish"
    ],
    "recipeInstructions": [
      {
        "@type": "HowToStep",
        "text": "Cook spaghetti according to package directions. Reserve 1 cup pasta water before draining."
      },
      {
        "@type": "HowToStep",
        "text": "In a large skillet, heat olive oil over medium heat. Add garlic and cook for 1 minute."
      },
      {
        "@type": "HowToStep",
        "text": "Add lemon zest and lemon juice to the skillet. Toss in the drained pasta."
      },
      {
        "@type": "HowToStep",
        "text": "Add Parmesan cheese and toss to combine. Add pasta water as needed for desired consistency."
      },
      {
        "@type": "HowToStep",
        "text": "Season with salt and pepper. Garnish with fresh basil leaves and serve immediately."
      }
    ]
  }
  </script>
</head>
<body>
  <h1>Classic Lemon Pasta</h1>
  <p>A bright, zesty pasta dish that comes together in minutes.</p>
</body>
</html>`;

const noSchemaFixture = `<!DOCTYPE html>
<html>
<head>
  <title>My Grandma's Chocolate Chip Cookies</title>
</head>
<body>
  <article>
    <h1>My Grandma's Chocolate Chip Cookies</h1>
    <p>These cookies are absolutely the best chocolate chip cookies.</p>
    <h2>Ingredients</h2>
    <ul>
      <li>2 1/4 cups all-purpose flour</li>
      <li>1 teaspoon baking soda</li>
      <li>1 cup butter, softened</li>
      <li>2 cups chocolate chips</li>
    </ul>
    <h2>Instructions</h2>
    <ol>
      <li>Preheat oven to 375 degrees F.</li>
      <li>Combine flour and baking soda.</li>
      <li>Beat butter and sugar until creamy.</li>
      <li>Stir in chocolate chips.</li>
      <li>Bake for 9 to 11 minutes.</li>
    </ol>
  </article>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDb() {
  return drizzle(env.DB, { schema });
}

function parseStatements(sql: string): string[] {
  const cleaned = sql
    .split("\n")
    .filter((line: string) => !line.trimStart().startsWith("--"))
    .join("\n");

  return cleaned
    .split(";")
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0)
    .map((s: string) => s + ";");
}

async function applyMigration() {
  const statements = parseStatements(migrationSql);
  const prepared = statements.map((s: string) => env.DB.prepare(s));
  await env.DB.batch(prepared);
}

async function dropAllTables() {
  const tables = [
    "team_members",
    "segment_profiles",
    "recipe_engagement_events",
    "recipe_engagement_scores",
    "published_listings",
    "lead_magnets",
    "recipe_card_packs",
    "meal_plan_details",
    "ebook_details",
    "product_base",
    "import_jobs",
    "collection_recipes",
    "collections",
    "photos",
    "instructions",
    "instruction_groups",
    "ingredients",
    "ingredient_groups",
    "recipes",
    "brand_kits",
    "creators",
  ];
  for (const table of tables) {
    await env.DB.exec(`DROP TABLE IF EXISTS ${table};`);
  }
}

const now = new Date().toISOString();
const CREATOR_ID = createCreatorId("creator-1");

function makeCreator(overrides: Partial<typeof schema.creators.$inferInsert> = {}) {
  return {
    id: CREATOR_ID as string,
    email: "test@example.com",
    name: "Test Creator",
    password_hash: "$2b$12$fakehash",
    subscription_tier: "Free",
    subscription_started_at: now,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

let idCounter = 0;
function createMockGenerateId(): () => string {
  return () => `mock-id-${++idCounter}`;
}

function createMockQueue(): ImportQueue & {
  sentMessages: { importJobId: string }[];
} {
  const sentMessages: { importJobId: string }[] = [];
  return {
    sentMessages,
    async send(message: { importJobId: string }) {
      sentMessages.push(message);
    },
  };
}

function createMockFetcher(
  responses: Map<
    string,
    Result<{ status: number; text: string; headers: Record<string, string> }, ImportError>
  >,
): HttpFetcher {
  return {
    async fetch(url: string) {
      const response = responses.get(url);
      if (response !== undefined) return response;
      return err({
        type: "FetchFailed",
        reason: `No mock response for URL: ${url}`,
      });
    },
  };
}

function createSuccessExtractor(extract: RecipeExtract): RecipeExtractor {
  return {
    async extract(_text: string) {
      return ok(extract);
    },
  };
}

function createFailingExtractor(error: ImportError): RecipeExtractor {
  return {
    async extract(_text: string) {
      return err(error);
    },
  };
}

function createMockWordPress(
  opts: {
    testConnectionResult?: Result<{ name: string }, ImportError>;
    detectPluginResult?: Result<"WpRecipeMaker" | "TastyRecipes", ImportError>;
    fetchRecipesResult?: Result<readonly WordPressRecipe[], ImportError>;
  } = {},
): WordPressClient {
  return {
    async testConnection() {
      return opts.testConnectionResult ?? ok({ name: "Test User" });
    },
    async detectPlugin() {
      return opts.detectPluginResult ?? ok("WpRecipeMaker" as const);
    },
    async fetchRecipes() {
      return opts.fetchRecipesResult ?? ok([]);
    },
  };
}

function makeExtract(overrides: Partial<RecipeExtract> = {}): RecipeExtract {
  return {
    title: "Test Recipe",
    description: "A test recipe description",
    ingredients: [
      {
        label: null,
        ingredients: [
          {
            raw_text: "1 cup flour",
            quantity: null,
            unit: "cup",
            item: "flour",
            notes: null,
            confidence: 0.9,
          },
        ],
      },
    ],
    instructions: ["Mix ingredients", "Bake at 350F"],
    timing: {
      prep_minutes: 10,
      cook_minutes: 20,
      total_minutes: 30,
    },
    yield: { quantity: 4, unit: "servings" },
    notes: null,
    photo_urls: [],
    dietary_tags: new Set(),
    confidence: {
      overall: 0.9,
      field_scores: { title: 0.95, ingredients: 0.85 },
    },
    ...overrides,
  };
}

function createTestDeps(
  db: Database,
  overrides: Partial<ImportServiceDeps> = {},
): ImportServiceDeps {
  return {
    db,
    queue: createMockQueue(),
    extractor: createSuccessExtractor(makeExtract()),
    fetcher: createMockFetcher(new Map()),
    wordpress: createMockWordPress(),
    generateId: createMockGenerateId(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Import Pipeline", () => {
  beforeEach(async () => {
    idCounter = 0;
    await dropAllTables();
    await applyMigration();
    await getDb().insert(schema.creators).values(makeCreator());
  });

  // -------------------------------------------------------------------------
  // Schema.org extraction
  // -------------------------------------------------------------------------

  describe("extractSchemaOrgRecipe", () => {
    it("extracts recipe from ld+json block", () => {
      const result = extractSchemaOrgRecipe(schemaOrgFixture);
      expect(result).not.toBeNull();
      if (result !== null) {
        expect(result.name).toBe("Classic Lemon Pasta");
        expect(result.recipeIngredient).toHaveLength(8);
        expect(result.recipeInstructions).toHaveLength(5);
        expect(result.prepTime).toBe("PT10M");
        expect(result.cookTime).toBe("PT15M");
        expect(result.totalTime).toBe("PT25M");
        expect(result.recipeYield).toBe("4 servings");
      }
    });

    it("returns null when no ld+json present", () => {
      const result = extractSchemaOrgRecipe(noSchemaFixture);
      expect(result).toBeNull();
    });

    it("returns null for empty HTML", () => {
      const result = extractSchemaOrgRecipe("");
      expect(result).toBeNull();
    });

    it("handles invalid JSON in ld+json block", () => {
      const html = `
        <script type="application/ld+json">
          { invalid json here
        </script>
      `;
      const result = extractSchemaOrgRecipe(html);
      expect(result).toBeNull();
    });

    it("handles @graph structure", () => {
      const html = `
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "WebPage", "name": "My Blog" },
            {
              "@type": "Recipe",
              "name": "Test",
              "recipeIngredient": ["1 cup flour"],
              "recipeInstructions": ["Mix it"]
            }
          ]
        }
        </script>
      `;
      const result = extractSchemaOrgRecipe(html);
      expect(result).not.toBeNull();
      if (result !== null) {
        expect(result.name).toBe("Test");
      }
    });
  });

  // -------------------------------------------------------------------------
  // parseDuration
  // -------------------------------------------------------------------------

  describe("parseDuration", () => {
    it("parses PT30M", () => {
      expect(parseDuration("PT30M")).toBe(30);
    });

    it("parses PT1H30M", () => {
      expect(parseDuration("PT1H30M")).toBe(90);
    });

    it("parses PT2H", () => {
      expect(parseDuration("PT2H")).toBe(120);
    });

    it("returns null for null input", () => {
      expect(parseDuration(null)).toBeNull();
    });

    it("returns null for invalid format", () => {
      expect(parseDuration("30 minutes")).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // extractVisibleText
  // -------------------------------------------------------------------------

  describe("extractVisibleText", () => {
    it("strips HTML tags", () => {
      const result = extractVisibleText("<p>Hello <b>world</b></p>");
      expect(result).toBe("Hello world");
    });

    it("removes script blocks", () => {
      const result = extractVisibleText("<p>Hello</p><script>alert('hi')</script><p>World</p>");
      expect(result).toBe("Hello World");
    });

    it("removes style blocks", () => {
      const result = extractVisibleText("<p>Hello</p><style>body{color:red}</style><p>World</p>");
      expect(result).toBe("Hello World");
    });

    it("decodes HTML entities", () => {
      const result = extractVisibleText("&amp; &lt; &gt; &quot; &#39;");
      expect(result).toBe("& < > \" '");
    });

    it("truncates long text", () => {
      const longHtml = "<p>" + "a".repeat(50000) + "</p>";
      const result = extractVisibleText(longHtml, 100);
      expect(result.length).toBeLessThanOrEqual(100);
    });
  });

  // -------------------------------------------------------------------------
  // Job creation and queue enqueue
  // -------------------------------------------------------------------------

  describe("createImportJob", () => {
    it("creates a pending job and enqueues it", async () => {
      const db = getDb();
      const queue = createMockQueue();
      const service = createImportService(createTestDeps(db, { queue }));

      const result = await service.createImportJob(CREATOR_ID, "FromUrl", {
        url: "https://example.com/recipe",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBeTruthy();
      }

      // Verify job in database
      const jobs = await db
        .select()
        .from(schema.importJobs)
        .where(eq(schema.importJobs.creator_id, CREATOR_ID));
      expect(jobs).toHaveLength(1);
      const job = jobs[0];
      expect(job).toBeDefined();
      if (job) {
        expect(job.status).toBe("Pending");
        expect(job.source_type).toBe("FromUrl");
      }

      // Verify queue message sent
      expect(queue.sentMessages).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Job state machine
  // -------------------------------------------------------------------------

  describe("job state machine", () => {
    it("transitions pending -> processing -> needs_review", async () => {
      const db = getDb();
      const fetcher = createMockFetcher(
        new Map([
          [
            "https://example.com/recipe",
            ok({
              status: 200,
              text: schemaOrgFixture,
              headers: {},
            }),
          ],
        ]),
      );
      const service = createImportService(createTestDeps(db, { fetcher }));

      // Create job
      const createResult = await service.createImportJob(CREATOR_ID, "FromUrl", {
        url: "https://example.com/recipe",
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      // Process job
      const processResult = await service.processImportJob(createResult.value.id);
      expect(processResult.ok).toBe(true);

      // Verify job is now NeedsReview
      const jobs = await db
        .select()
        .from(schema.importJobs)
        .where(eq(schema.importJobs.id, createResult.value.id));
      const job = jobs[0];
      expect(job).toBeDefined();
      if (job) {
        expect(job.status).toBe("NeedsReview");
        expect(job.extract_data).not.toBeNull();
      }
    });

    it("transitions needs_review -> completed on confirm", async () => {
      const db = getDb();
      const fetcher = createMockFetcher(
        new Map([
          [
            "https://example.com/recipe",
            ok({
              status: 200,
              text: schemaOrgFixture,
              headers: {},
            }),
          ],
        ]),
      );
      const service = createImportService(createTestDeps(db, { fetcher }));

      // Create and process
      const createResult = await service.createImportJob(CREATOR_ID, "FromUrl", {
        url: "https://example.com/recipe",
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      await service.processImportJob(createResult.value.id);

      // Confirm
      const confirmResult = await service.confirmImport(createResult.value.id, CREATOR_ID);
      expect(confirmResult.ok).toBe(true);
      if (confirmResult.ok) {
        expect(confirmResult.value.recipeId).toBeTruthy();
      }

      // Verify job status
      const jobs = await db
        .select()
        .from(schema.importJobs)
        .where(eq(schema.importJobs.id, createResult.value.id));
      const job = jobs[0];
      expect(job).toBeDefined();
      if (job) {
        expect(job.status).toBe("Completed");
        expect(job.recipe_id).toBeTruthy();
      }
    });

    it("rejects invalid transition: processing cannot be processed again", async () => {
      const db = getDb();

      // Manually insert a processing job
      const jobId = createImportJobId("processing-job");
      await db.insert(schema.importJobs).values({
        id: jobId,
        creator_id: CREATOR_ID,
        status: "Processing",
        source_type: "FromUrl",
        source_data: { url: "https://example.com" },
        processing_started_at: now,
        created_at: now,
        updated_at: now,
      });

      const service = createImportService(createTestDeps(db));
      const result = await service.processImportJob(jobId);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("InvalidTransition");
      }
    });

    it("rejects confirm on non-NeedsReview jobs", async () => {
      const db = getDb();
      const jobId = createImportJobId("pending-job");
      await db.insert(schema.importJobs).values({
        id: jobId,
        creator_id: CREATOR_ID,
        status: "Pending",
        source_type: "FromUrl",
        source_data: { url: "https://example.com" },
        created_at: now,
        updated_at: now,
      });

      const service = createImportService(createTestDeps(db));
      const result = await service.confirmImport(jobId, CREATOR_ID);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("InvalidTransition");
      }
    });

    it("rejects confirm on completed jobs", async () => {
      const db = getDb();
      const jobId = createImportJobId("completed-job");
      // Create a recipe first to satisfy the FK constraint
      await db.insert(schema.recipes).values({
        id: "some-recipe",
        creator_id: CREATOR_ID,
        title: "Some Recipe",
        slug: "some-recipe",
        source_type: "Manual",
        status: "Draft",
        email_ready: false,
        dietary_tags: [],
        meal_types: [],
        seasons: [],
        created_at: now,
        updated_at: now,
      });
      await db.insert(schema.importJobs).values({
        id: jobId,
        creator_id: CREATOR_ID,
        status: "Completed",
        source_type: "FromUrl",
        source_data: { url: "https://example.com" },
        recipe_id: "some-recipe",
        created_at: now,
        updated_at: now,
      });

      const service = createImportService(createTestDeps(db));
      const result = await service.confirmImport(jobId, CREATOR_ID);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("InvalidTransition");
      }
    });

    it("allows rejection of pending jobs", async () => {
      const db = getDb();
      const jobId = createImportJobId("reject-test");
      await db.insert(schema.importJobs).values({
        id: jobId,
        creator_id: CREATOR_ID,
        status: "Pending",
        source_type: "FromUrl",
        source_data: { url: "https://example.com" },
        created_at: now,
        updated_at: now,
      });

      const service = createImportService(createTestDeps(db));
      const result = await service.rejectImport(jobId, CREATOR_ID);
      expect(result.ok).toBe(true);

      const jobs = await db.select().from(schema.importJobs).where(eq(schema.importJobs.id, jobId));
      const job = jobs[0];
      expect(job).toBeDefined();
      if (job) {
        expect(job.status).toBe("Failed");
      }
    });

    it("allows rejection of needs_review jobs", async () => {
      const db = getDb();
      const jobId = createImportJobId("reject-review-test");
      await db.insert(schema.importJobs).values({
        id: jobId,
        creator_id: CREATOR_ID,
        status: "NeedsReview",
        source_type: "FromUrl",
        source_data: { url: "https://example.com" },
        extract_data: { title: "Test" },
        created_at: now,
        updated_at: now,
      });

      const service = createImportService(createTestDeps(db));
      const result = await service.rejectImport(jobId, CREATOR_ID);
      expect(result.ok).toBe(true);
    });

    it("prevents rejection of processing jobs", async () => {
      const db = getDb();
      const jobId = createImportJobId("reject-processing-test");
      await db.insert(schema.importJobs).values({
        id: jobId,
        creator_id: CREATOR_ID,
        status: "Processing",
        source_type: "FromUrl",
        source_data: { url: "https://example.com" },
        processing_started_at: now,
        created_at: now,
        updated_at: now,
      });

      const service = createImportService(createTestDeps(db));
      const result = await service.rejectImport(jobId, CREATOR_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("InvalidTransition");
      }
    });
  });

  // -------------------------------------------------------------------------
  // URL import with schema.org fixture
  // -------------------------------------------------------------------------

  describe("URL import with schema.org", () => {
    it("extracts recipe from schema.org ld+json", async () => {
      const db = getDb();
      const fetcher = createMockFetcher(
        new Map([
          [
            "https://example.com/recipe",
            ok({
              status: 200,
              text: schemaOrgFixture,
              headers: {},
            }),
          ],
        ]),
      );
      const service = createImportService(createTestDeps(db, { fetcher }));

      const createResult = await service.createImportJob(CREATOR_ID, "FromUrl", {
        url: "https://example.com/recipe",
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      await service.processImportJob(createResult.value.id);

      const jobs = await db
        .select()
        .from(schema.importJobs)
        .where(eq(schema.importJobs.id, createResult.value.id));
      const job = jobs[0];
      expect(job).toBeDefined();
      if (job) {
        expect(job.status).toBe("NeedsReview");
        const extractData = job.extract_data as Record<string, unknown>;
        expect(extractData["title"]).toBe("Classic Lemon Pasta");
        const confidence = extractData["confidence"] as Record<string, unknown>;
        expect(confidence["overall"]).toBe(0.95);
      }
    });
  });

  // -------------------------------------------------------------------------
  // URL import with AI fallback
  // -------------------------------------------------------------------------

  describe("URL import with AI fallback", () => {
    it("falls back to AI extraction when no schema.org", async () => {
      const db = getDb();
      const extract = makeExtract({
        title: "Grandma's Chocolate Chip Cookies",
      });
      const extractor = createSuccessExtractor(extract);
      const fetcher = createMockFetcher(
        new Map([
          [
            "https://example.com/cookies",
            ok({
              status: 200,
              text: noSchemaFixture,
              headers: {},
            }),
          ],
        ]),
      );
      const service = createImportService(createTestDeps(db, { fetcher, extractor }));

      const createResult = await service.createImportJob(CREATOR_ID, "FromUrl", {
        url: "https://example.com/cookies",
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      await service.processImportJob(createResult.value.id);

      const jobs = await db
        .select()
        .from(schema.importJobs)
        .where(eq(schema.importJobs.id, createResult.value.id));
      const job = jobs[0];
      expect(job).toBeDefined();
      if (job) {
        expect(job.status).toBe("NeedsReview");
        const extractData = job.extract_data as Record<string, unknown>;
        expect(extractData["title"]).toBe("Grandma's Chocolate Chip Cookies");
      }
    });

    it("marks job failed when AI extraction fails", async () => {
      const db = getDb();
      const extractor = createFailingExtractor({
        type: "ExtractionFailed",
        reason: "Could not parse recipe",
      });
      const fetcher = createMockFetcher(
        new Map([
          [
            "https://example.com/not-recipe",
            ok({
              status: 200,
              text: "<html><body>Not a recipe page</body></html>",
              headers: {},
            }),
          ],
        ]),
      );
      const service = createImportService(createTestDeps(db, { fetcher, extractor }));

      const createResult = await service.createImportJob(CREATOR_ID, "FromUrl", {
        url: "https://example.com/not-recipe",
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      await service.processImportJob(createResult.value.id);

      const jobs = await db
        .select()
        .from(schema.importJobs)
        .where(eq(schema.importJobs.id, createResult.value.id));
      const job = jobs[0];
      expect(job).toBeDefined();
      if (job) {
        expect(job.status).toBe("Failed");
        expect(job.error_type).toBe("ExtractionFailed");
      }
    });

    it("marks job failed when AI returns no title or ingredients (SS14.1)", async () => {
      const db = getDb();
      const extract = makeExtract({
        title: null,
        ingredients: [],
      });
      const extractor = createSuccessExtractor(extract);
      const fetcher = createMockFetcher(
        new Map([
          [
            "https://example.com/bad-recipe",
            ok({
              status: 200,
              text: "<html><body>Some text but not a recipe</body></html>",
              headers: {},
            }),
          ],
        ]),
      );
      const service = createImportService(createTestDeps(db, { fetcher, extractor }));

      const createResult = await service.createImportJob(CREATOR_ID, "FromUrl", {
        url: "https://example.com/bad-recipe",
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      await service.processImportJob(createResult.value.id);

      const jobs = await db
        .select()
        .from(schema.importJobs)
        .where(eq(schema.importJobs.id, createResult.value.id));
      const job = jobs[0];
      expect(job).toBeDefined();
      if (job) {
        expect(job.status).toBe("Failed");
        expect(job.error_type).toBe("ExtractionFailed");
      }
    });
  });

  // -------------------------------------------------------------------------
  // URL fetch timeout handling (SS14.1)
  // -------------------------------------------------------------------------

  describe("URL fetch timeout handling", () => {
    it("retries once and marks failed on second timeout", async () => {
      const db = getDb();
      let fetchCount = 0;
      const fetcher: HttpFetcher = {
        async fetch() {
          fetchCount++;
          return err({
            type: "FetchFailed",
            reason: "Request timed out",
          });
        },
      };
      const service = createImportService(createTestDeps(db, { fetcher }));

      const createResult = await service.createImportJob(CREATOR_ID, "FromUrl", {
        url: "https://example.com/slow",
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      await service.processImportJob(createResult.value.id);

      // Should have been called twice (original + retry)
      expect(fetchCount).toBe(2);

      const jobs = await db
        .select()
        .from(schema.importJobs)
        .where(eq(schema.importJobs.id, createResult.value.id));
      const job = jobs[0];
      expect(job).toBeDefined();
      if (job) {
        expect(job.status).toBe("Failed");
        expect(job.error_type).toBe("FetchFailed");
      }
    }, 15000);
  });

  // -------------------------------------------------------------------------
  // Extract promotion to recipe
  // -------------------------------------------------------------------------

  describe("extract promotion to recipe", () => {
    it("creates recipe with correct source when confirming URL import", async () => {
      const db = getDb();
      const fetcher = createMockFetcher(
        new Map([
          [
            "https://example.com/recipe",
            ok({
              status: 200,
              text: schemaOrgFixture,
              headers: {},
            }),
          ],
        ]),
      );
      const service = createImportService(createTestDeps(db, { fetcher }));

      const createResult = await service.createImportJob(CREATOR_ID, "FromUrl", {
        url: "https://example.com/recipe",
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      await service.processImportJob(createResult.value.id);
      const confirmResult = await service.confirmImport(createResult.value.id, CREATOR_ID);

      expect(confirmResult.ok).toBe(true);
      if (!confirmResult.ok) return;

      // Verify recipe was created
      const recipes = await db
        .select()
        .from(schema.recipes)
        .where(eq(schema.recipes.id, confirmResult.value.recipeId));
      const recipe = recipes[0];
      expect(recipe).toBeDefined();
      if (recipe) {
        expect(recipe.title).toBe("Classic Lemon Pasta");
        expect(recipe.source_type).toBe("ImportedFromUrl");
        expect(recipe.status).toBe("Draft");
        expect(recipe.dietary_tags_confirmed).toBe(false);

        // Verify timing
        expect(recipe.prep_minutes).toBe(10);
        expect(recipe.cook_minutes).toBe(15);
        expect(recipe.total_minutes).toBe(25);

        // Verify yield
        expect(recipe.yield_quantity).toBe(4);
        expect(recipe.yield_unit).toBe("servings");
      }

      // Verify ingredients were created
      const ingredientGroups = await db
        .select()
        .from(schema.ingredientGroups)
        .where(eq(schema.ingredientGroups.recipe_id, confirmResult.value.recipeId));
      expect(ingredientGroups.length).toBeGreaterThan(0);

      // Verify instructions were created
      const instructionGroups = await db
        .select()
        .from(schema.instructionGroups)
        .where(eq(schema.instructionGroups.recipe_id, confirmResult.value.recipeId));
      expect(instructionGroups.length).toBeGreaterThan(0);
    });

    it("prevents confirming a job owned by a different creator", async () => {
      const db = getDb();
      const jobId = createImportJobId("other-creator-job");
      await db.insert(schema.creators).values(
        makeCreator({
          id: "creator-2",
          email: "other@example.com",
        }),
      );
      await db.insert(schema.importJobs).values({
        id: jobId,
        creator_id: "creator-2",
        status: "NeedsReview",
        source_type: "FromUrl",
        source_data: { url: "https://example.com" },
        extract_data: { title: "Test", ingredients: [], instructions: [] },
        created_at: now,
        updated_at: now,
      });

      const service = createImportService(createTestDeps(db));
      const result = await service.confirmImport(jobId, CREATOR_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("NotFound");
      }
    });
  });

  // -------------------------------------------------------------------------
  // Not-yet-implemented sources
  // -------------------------------------------------------------------------

  describe("not-yet-implemented sources", () => {
    const unsupportedSources = [
      "FromInstagramPost",
      "FromTikTokVideo",
      "FromYouTubeVideo",
      "FromScreenshot",
    ];

    for (const source of unsupportedSources) {
      it(`marks ${source} as failed with not-yet-implemented`, async () => {
        const db = getDb();
        const service = createImportService(createTestDeps(db));

        const createResult = await service.createImportJob(CREATOR_ID, source, {
          url: "https://example.com/content",
        });
        expect(createResult.ok).toBe(true);
        if (!createResult.ok) return;

        await service.processImportJob(createResult.value.id);

        const jobs = await db
          .select()
          .from(schema.importJobs)
          .where(eq(schema.importJobs.id, createResult.value.id));
        const job = jobs[0];
        expect(job).toBeDefined();
        if (job) {
          expect(job.status).toBe("Failed");
          expect(job.error_type).toBe("ExtractionFailed");
          const errorData = job.error_data as Record<string, unknown>;
          expect(errorData["reason"]).toContain("not yet implemented");
        }
      });
    }
  });

  // -------------------------------------------------------------------------
  // WordPress sync
  // -------------------------------------------------------------------------

  describe("WordPress sync", () => {
    it("tests connection successfully", async () => {
      const db = getDb();
      const wordpress = createMockWordPress({
        testConnectionResult: ok({ name: "Test User" }),
        detectPluginResult: ok("WpRecipeMaker" as const),
      });
      const service = createImportService(createTestDeps(db, { wordpress }));

      const result = await service.testWordPressConnection("https://myblog.com", "app-password");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe("Test User");
        expect(result.value.plugin).toBe("WpRecipeMaker");
      }
    });

    it("returns error on WordPress auth failure", async () => {
      const db = getDb();
      const wordpress = createMockWordPress({
        testConnectionResult: err({ type: "WordPressAuthFailed" }),
      });
      const service = createImportService(createTestDeps(db, { wordpress }));

      const result = await service.testWordPressConnection("https://myblog.com", "bad-password");
      expect(result.ok).toBe(false);
    });

    it("syncs new recipes from WordPress", async () => {
      const db = getDb();
      const wpRecipes: WordPressRecipe[] = [
        {
          wordpress_recipe_id: "wp-1",
          title: "Tomato Soup",
          description: "A warming soup",
          ingredients: [{ raw_text: "2 lbs tomatoes" }],
          instructions: ["Roast tomatoes", "Blend"],
          prep_minutes: 10,
          cook_minutes: 30,
          total_minutes: 40,
          yield_quantity: 4,
          yield_unit: "servings",
          modified: "2026-03-15T12:00:00Z",
        },
      ];
      const wordpress = createMockWordPress({
        fetchRecipesResult: ok(wpRecipes),
      });
      const service = createImportService(createTestDeps(db, { wordpress }));

      const result = await service.syncWordPress(
        CREATOR_ID,
        "https://myblog.com",
        "app-password",
        "WpRecipeMaker",
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.created).toBe(1);
        expect(result.value.updated).toBe(0);
      }

      // Verify recipe was created
      const recipes = await db
        .select()
        .from(schema.recipes)
        .where(eq(schema.recipes.creator_id, CREATOR_ID));
      expect(recipes).toHaveLength(1);
      const recipe = recipes[0];
      expect(recipe).toBeDefined();
      if (recipe) {
        expect(recipe.title).toBe("Tomato Soup");
        expect(recipe.source_type).toBe("SyncedFromWordPress");
        expect(recipe.status).toBe("Draft");
        expect(recipe.prep_minutes).toBe(10);
      }
    });

    it("updates existing WordPress recipes without overwriting title/description/notes", async () => {
      const db = getDb();

      // Insert an existing recipe synced from WordPress
      const existingRecipeId = "existing-wp-recipe";
      await db.insert(schema.recipes).values({
        id: existingRecipeId,
        creator_id: CREATOR_ID,
        title: "My Custom Title", // Creator edited this
        slug: "tomato-soup",
        description: "My custom description", // Creator edited this
        source_type: "SyncedFromWordPress",
        source_data: {
          site_url: "https://myblog.com",
          wordpress_recipe_id: "wp-1",
          last_synced_at: Date.now(),
        },
        status: "Active",
        email_ready: true,
        prep_minutes: 10,
        cook_minutes: 25,
        total_minutes: 35,
        dietary_tags: [],
        dietary_tags_confirmed: false,
        meal_types: [],
        seasons: [],
        notes: "My personal notes",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z", // old date
      });

      // WordPress has updated version
      const wpRecipes: WordPressRecipe[] = [
        {
          wordpress_recipe_id: "wp-1",
          title: "Updated Tomato Soup", // Different title
          description: "An updated description",
          ingredients: [{ raw_text: "3 lbs tomatoes" }],
          instructions: ["New step 1", "New step 2"],
          prep_minutes: 15,
          cook_minutes: 35,
          total_minutes: 50,
          yield_quantity: 6,
          yield_unit: "servings",
          modified: "2026-03-16T12:00:00Z", // Newer than updated_at
        },
      ];
      const wordpress = createMockWordPress({
        fetchRecipesResult: ok(wpRecipes),
      });
      const service = createImportService(createTestDeps(db, { wordpress }));

      const result = await service.syncWordPress(
        CREATOR_ID,
        "https://myblog.com",
        "app-password",
        "WpRecipeMaker",
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.created).toBe(0);
        expect(result.value.updated).toBe(1);
      }

      // Verify recipe was updated but title/description/notes preserved
      const recipes = await db
        .select()
        .from(schema.recipes)
        .where(eq(schema.recipes.id, existingRecipeId));
      const recipe = recipes[0];
      expect(recipe).toBeDefined();
      if (recipe) {
        // Title, description, notes should be PRESERVED
        expect(recipe.title).toBe("My Custom Title");
        expect(recipe.description).toBe("My custom description");
        expect(recipe.notes).toBe("My personal notes");

        // Timing/yield should be UPDATED
        expect(recipe.prep_minutes).toBe(15);
        expect(recipe.cook_minutes).toBe(35);
        expect(recipe.total_minutes).toBe(50);
        expect(recipe.yield_quantity).toBe(6);
        expect(recipe.yield_unit).toBe("servings");
      }
    });

    it("flags locally deleted WordPress recipes", async () => {
      const db = getDb();

      // Insert a recipe that was synced from WordPress
      await db.insert(schema.recipes).values({
        id: "local-wp-recipe",
        creator_id: CREATOR_ID,
        title: "Deleted Recipe",
        slug: "deleted-recipe",
        source_type: "SyncedFromWordPress",
        source_data: {
          site_url: "https://myblog.com",
          wordpress_recipe_id: "wp-deleted",
          last_synced_at: Date.now(),
        },
        status: "Draft",
        email_ready: false,
        dietary_tags: [],
        dietary_tags_confirmed: false,
        meal_types: [],
        seasons: [],
        created_at: now,
        updated_at: now,
      });

      // WordPress returns empty (recipe was deleted from WordPress)
      const wordpress = createMockWordPress({
        fetchRecipesResult: ok([]),
      });
      const service = createImportService(createTestDeps(db, { wordpress }));

      const result = await service.syncWordPress(
        CREATOR_ID,
        "https://myblog.com",
        "app-password",
        "WpRecipeMaker",
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.flagged_deleted).toBe(1);
      }

      // Verify recipe is flagged
      const recipes = await db
        .select()
        .from(schema.recipes)
        .where(eq(schema.recipes.id, "local-wp-recipe"));
      const recipe = recipes[0];
      expect(recipe).toBeDefined();
      if (recipe) {
        const sd = recipe.source_data as Record<string, unknown>;
        expect(sd["wordpress_deleted"]).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Queue handler
  // -------------------------------------------------------------------------

  describe("queue handler", () => {
    it("processes valid queue messages and acks", async () => {
      const db = getDb();

      // Create a pending job
      const jobId = createImportJobId("queue-test-job");
      await db.insert(schema.importJobs).values({
        id: jobId,
        creator_id: CREATOR_ID,
        status: "Pending",
        source_type: "FromUrl",
        source_data: { url: "https://example.com/recipe" },
        created_at: now,
        updated_at: now,
      });

      const ack = vi.fn();
      const retry = vi.fn();

      const message: QueueMessage = {
        body: { importJobId: jobId },
        ack,
        retry,
      };

      const _fetcher = createMockFetcher(
        new Map([
          [
            "https://example.com/recipe",
            ok({
              status: 200,
              text: schemaOrgFixture,
              headers: {},
            }),
          ],
        ]),
      );

      const _wordpress = createMockWordPress();
      const extractor = createSuccessExtractor(makeExtract());

      await handleImportQueue(
        { messages: [message] },
        {
          db,
          queue: createMockQueue(),
          extractor,
        },
      );

      expect(ack).toHaveBeenCalled();
      expect(retry).not.toHaveBeenCalled();
    });

    it("acks messages with invalid format", async () => {
      const db = getDb();
      const ack = vi.fn();
      const retry = vi.fn();

      const message: QueueMessage = {
        body: { invalid: "data" },
        ack,
        retry,
      };

      await handleImportQueue(
        { messages: [message] },
        {
          db,
          queue: createMockQueue(),
          extractor: createSuccessExtractor(makeExtract()),
        },
      );

      expect(ack).toHaveBeenCalled();
      expect(retry).not.toHaveBeenCalled();
    });

    it("acks messages for non-existent jobs", async () => {
      const db = getDb();
      const ack = vi.fn();
      const retry = vi.fn();

      const message: QueueMessage = {
        body: { importJobId: "non-existent" },
        ack,
        retry,
      };

      await handleImportQueue(
        { messages: [message] },
        {
          db,
          queue: createMockQueue(),
          extractor: createSuccessExtractor(makeExtract()),
        },
      );

      expect(ack).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getImportJob and listImportJobs
  // -------------------------------------------------------------------------

  describe("getImportJob", () => {
    it("returns NotFound for non-existent job", async () => {
      const db = getDb();
      const service = createImportService(createTestDeps(db));
      const result = await service.getImportJob(createImportJobId("non-existent"), CREATOR_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("NotFound");
      }
    });

    it("returns NotFound when accessing another creator's job", async () => {
      const db = getDb();
      await db
        .insert(schema.creators)
        .values(makeCreator({ id: "creator-2", email: "other@example.com" }));
      const jobId = createImportJobId("other-job");
      await db.insert(schema.importJobs).values({
        id: jobId,
        creator_id: "creator-2",
        status: "Pending",
        source_type: "FromUrl",
        source_data: { url: "https://example.com" },
        created_at: now,
        updated_at: now,
      });

      const service = createImportService(createTestDeps(db));
      const result = await service.getImportJob(jobId, CREATOR_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe("NotFound");
      }
    });
  });

  describe("listImportJobs", () => {
    it("returns only jobs for the specified creator", async () => {
      const db = getDb();
      await db
        .insert(schema.creators)
        .values(makeCreator({ id: "creator-2", email: "other@example.com" }));

      // Creator 1's job
      await db.insert(schema.importJobs).values({
        id: "job-c1",
        creator_id: CREATOR_ID,
        status: "Pending",
        source_type: "FromUrl",
        source_data: { url: "https://example.com" },
        created_at: now,
        updated_at: now,
      });

      // Creator 2's job
      await db.insert(schema.importJobs).values({
        id: "job-c2",
        creator_id: "creator-2",
        status: "Pending",
        source_type: "FromUrl",
        source_data: { url: "https://other.com" },
        created_at: now,
        updated_at: now,
      });

      const service = createImportService(createTestDeps(db));
      const result = await service.listImportJobs(CREATOR_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        const job = result.value[0];
        expect(job).toBeDefined();
        if (job) {
          expect(job.id).toBe("job-c1");
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Error conditions from SPEC SS14.1
  // -------------------------------------------------------------------------

  describe("SPEC SS14.1 error conditions", () => {
    it("handles URL fetch timeout with retry then failure", async () => {
      const db = getDb();
      let callCount = 0;
      const fetcher: HttpFetcher = {
        async fetch() {
          callCount++;
          return err({
            type: "FetchFailed",
            reason: "Request timed out",
          });
        },
      };
      const service = createImportService(createTestDeps(db, { fetcher }));

      const createResult = await service.createImportJob(CREATOR_ID, "FromUrl", {
        url: "https://slow-site.com",
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      await service.processImportJob(createResult.value.id);

      expect(callCount).toBe(2); // Original + 1 retry

      const jobs = await db
        .select()
        .from(schema.importJobs)
        .where(eq(schema.importJobs.id, createResult.value.id));
      const job = jobs[0];
      expect(job).toBeDefined();
      if (job) {
        expect(job.status).toBe("Failed");
        expect(job.error_type).toBe("FetchFailed");
        const errorData = job.error_data as Record<string, unknown>;
        expect(errorData["reason"]).toContain("Could not reach this URL");
      }
    }, 15000);

    it("fails when AI produces empty title and ingredients", async () => {
      const db = getDb();
      const extract = makeExtract({
        title: "",
        ingredients: [],
      });
      const extractor = createSuccessExtractor(extract);
      const fetcher = createMockFetcher(
        new Map([
          [
            "https://example.com/empty",
            ok({
              status: 200,
              text: "<html><body>Some content</body></html>",
              headers: {},
            }),
          ],
        ]),
      );
      const service = createImportService(createTestDeps(db, { fetcher, extractor }));

      const createResult = await service.createImportJob(CREATOR_ID, "FromUrl", {
        url: "https://example.com/empty",
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      await service.processImportJob(createResult.value.id);

      const jobs = await db
        .select()
        .from(schema.importJobs)
        .where(eq(schema.importJobs.id, createResult.value.id));
      const job = jobs[0];
      expect(job).toBeDefined();
      if (job) {
        expect(job.status).toBe("Failed");
        expect(job.error_type).toBe("ExtractionFailed");
        const errorData = job.error_data as Record<string, unknown>;
        expect(errorData["reason"]).toContain("couldn't extract a recipe");
      }
    });
  });
});
