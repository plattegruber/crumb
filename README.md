# crumb

Recipe intelligence platform for food creators, built on Kit (formerly ConvertKit). Structured recipe library, AI-powered import, email recipe cards, dietary segmentation, digital product generation, and engagement analytics -- all wired into Kit's email infrastructure.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        apps/web                                  │
│                   SvelteKit on Cloudflare Pages                  │
│                                                                  │
│   /library    /products    /grow    /settings    /sign-in        │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           │  REST API
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                        apps/api                                  │
│                  Cloudflare Worker (Hono)                         │
│                                                                  │
│   Routes ─► Services ─► Drizzle ORM ──► D1 (SQLite)             │
│                │                                                 │
│                ├──► R2 (file storage: PDFs, images)              │
│                ├──► KV (subscriber cache, engagement scores)     │
│                ├──► Queues (import pipeline, PDF rendering)      │
│                └──► Kit V4 API (tags, subscribers, broadcasts)   │
└──────────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────────────┐
│                     apps/kit-plugin                               │
│              Kit App Store Editor Plugin (IIFE)                   │
│                                                                  │
│   Recipe search UI ──► Card renderer ──► Email-safe HTML         │
└──────────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────────────┐
│                     packages/shared                               │
│           Branded types, enums, Result<T,E>, models               │
└──────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer           | Technology                                           |
| --------------- | ---------------------------------------------------- |
| Runtime         | Cloudflare Workers (TypeScript)                      |
| Database        | Cloudflare D1 (SQLite) via Drizzle ORM               |
| File storage    | Cloudflare R2                                        |
| Async jobs      | Cloudflare Queues                                    |
| Caching         | Cloudflare KV                                        |
| Rate limiting   | Cloudflare Durable Objects                           |
| Frontend        | SvelteKit 2 + Svelte 5, deployed to Cloudflare Pages |
| Auth            | Clerk (frontend SDK + backend JWT verification)      |
| API framework   | Hono                                                 |
| Email platform  | Kit (ConvertKit) V4 API                              |
| Testing         | Vitest with `@cloudflare/vitest-pool-workers`        |
| Package manager | pnpm (workspaces)                                    |

---

## Project Structure

```
crumb/
├── SPEC.md                          # Authoritative product specification
├── CLAUDE.md                        # Project intelligence / coding standards
├── package.json                     # Root workspace scripts
├── pnpm-workspace.yaml              # Workspace: apps/*, packages/*
│
├── apps/
│   ├── api/                         # Cloudflare Worker — Hono API
│   │   ├── src/
│   │   │   ├── index.ts             # Worker entry + queue consumer
│   │   │   ├── env.ts               # Env interface (D1, R2, KV, Queues, secrets)
│   │   │   ├── routes/              # HTTP handlers, one file per domain
│   │   │   │   ├── recipes.ts       # CRUD, search, scaling, duplicate check
│   │   │   │   ├── collections.ts   # Collection CRUD, recipe membership
│   │   │   │   ├── imports.ts       # Import jobs, WordPress sync
│   │   │   │   ├── products.ts      # Ebook, meal plan, card pack, lead magnet
│   │   │   │   ├── publishing.ts    # Platform publishing, download packages
│   │   │   │   ├── analytics.ts     # Engagement scores, recommendations, webhooks
│   │   │   │   ├── automation.ts    # Save recipe, broadcasts, seasonal drops
│   │   │   │   └── segmentation.ts  # Dietary tag inference, segment profiles
│   │   │   ├── services/            # Business logic (pure, testable)
│   │   │   │   ├── recipe.ts        # Recipe CRUD + search + scaling
│   │   │   │   ├── collection.ts    # Collection management
│   │   │   │   ├── import.ts        # Import pipeline orchestration
│   │   │   │   ├── product.ts       # Product builder logic
│   │   │   │   ├── publishing.ts    # Platform adapters + packaging
│   │   │   │   ├── analytics.ts     # Score computation + recommendations
│   │   │   │   ├── automation.ts    # Kit sequence/broadcast orchestration
│   │   │   │   ├── segmentation.ts  # Dietary inference + segment profiles
│   │   │   │   ├── queue-handlers.ts    # Queue message processing
│   │   │   │   └── webhook-handlers.ts  # Kit webhook event dispatch
│   │   │   ├── db/
│   │   │   │   ├── schema.ts        # Drizzle schema — single source of truth
│   │   │   │   ├── index.ts         # DB factory
│   │   │   │   └── migrations/      # SQL migration files
│   │   │   ├── lib/
│   │   │   │   ├── kit/             # Kit Integration Layer (SPEC §4)
│   │   │   │   │   ├── client.ts    # Typed Kit V4 API client
│   │   │   │   │   ├── oauth.ts     # OAuth 2.0 token flow
│   │   │   │   │   ├── rate-limiter.ts  # 120 req/min rolling window
│   │   │   │   │   ├── token-middleware.ts  # Auto-refresh before expiry
│   │   │   │   │   ├── tag-conventions.ts   # Namespaced tag formatting
│   │   │   │   │   ├── webhooks.ts  # HMAC verification + payload types
│   │   │   │   │   └── types.ts     # Kit API response types
│   │   │   │   ├── slug.ts          # URL-safe slug generation
│   │   │   │   └── jaro-winkler.ts  # String similarity for duplicate detection
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts          # Clerk JWT verification
│   │   │   │   ├── creator-scope.ts # Per-creator DB scoping
│   │   │   │   └── team.ts          # Team member access control
│   │   │   └── types/
│   │   │       └── auth.ts          # AuthContext, branded CreatorId
│   │   ├── test/                    # Mirrors src/ structure
│   │   ├── wrangler.toml            # Worker bindings config
│   │   └── vitest.config.ts         # Workers pool config
│   │
│   ├── web/                         # SvelteKit frontend (Cloudflare Pages)
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── library/         # Recipe list, detail, create, import, collections
│   │   │   │   ├── products/        # Product list, detail, ebook/meal-plan creation
│   │   │   │   ├── grow/            # Dashboard, segments, analytics, automation
│   │   │   │   ├── settings/        # Account, Kit connection, brand kit, team
│   │   │   │   ├── sign-in/         # Clerk sign-in
│   │   │   │   └── sign-up/         # Clerk sign-up
│   │   │   ├── lib/
│   │   │   │   ├── api.ts           # API client for backend requests
│   │   │   │   ├── clerk.ts         # Clerk SDK wrapper
│   │   │   │   └── components/      # RecipeCard, SearchBar, Pagination, DietaryBadge
│   │   │   └── hooks.server.ts      # Server-side auth hook
│   │   ├── svelte.config.js         # Cloudflare adapter
│   │   └── wrangler.toml            # Pages config
│   │
│   └── kit-plugin/                  # Kit App Store editor plugin
│       ├── src/
│       │   ├── index.ts             # CrumbPlugin global (init, renderCard, searchRecipes)
│       │   ├── components/
│       │   │   ├── search.ts        # Recipe search UI
│       │   │   └── preview.ts       # Card preview in editor
│       │   └── lib/
│       │       ├── api-client.ts    # Backend API client
│       │       ├── card-renderer.ts # Email-safe HTML card generation
│       │       ├── cta-generator.ts # Save This Recipe link builder
│       │       ├── dietary-icons.ts # SVG icons for dietary tags
│       │       └── types.ts         # Plugin-specific types
│       ├── vite.config.ts           # IIFE library build
│       └── vitest.config.ts
│
└── packages/
    └── shared/                      # Shared across api, web, and kit-plugin
        ├── src/
        │   ├── index.ts             # Barrel export
        │   ├── result.ts            # Result<T, E> discriminated union
        │   ├── ids.ts               # Branded ID types + factory functions
        │   ├── enums.ts             # Const object enums (DietaryTag, MealType, etc.)
        │   ├── quantity.ts          # Quantity sum type + rational arithmetic
        │   ├── value-types.ts       # KitConnection, RecipeTiming, etc.
        │   └── models.ts           # Recipe, Product, ImportJob, etc.
        └── test/
```

---

## Getting Started

### Prerequisites

- **Node.js** >= 20
- **pnpm** (install: `corepack enable && corepack prepare pnpm@latest --activate`)
- **Wrangler** is a dev dependency -- no global install needed (`npx wrangler`)

### Clone and Install

```bash
git clone https://github.com/plattegruber/crumb.git
cd crumb
pnpm install
```

### Environment Setup

The API worker requires several environment bindings. Non-secret values are in `apps/api/wrangler.toml`. Secret values must be set separately:

| Variable                | Type   | How to set                                  |
| ----------------------- | ------ | ------------------------------------------- |
| `CLERK_PUBLISHABLE_KEY` | var    | Already in `wrangler.toml`                  |
| `CLERK_SECRET_KEY`      | secret | `npx wrangler secret put CLERK_SECRET_KEY`  |
| `KIT_CLIENT_ID`         | var    | Already in `wrangler.toml`                  |
| `KIT_CLIENT_SECRET`     | secret | `npx wrangler secret put KIT_CLIENT_SECRET` |

For local development, Wrangler uses `.dev.vars` for secret values. Create this file in `apps/api/`:

```bash
# apps/api/.dev.vars
CLERK_SECRET_KEY=sk_test_your_clerk_secret
KIT_CLIENT_SECRET=your_kit_client_secret
```

The web app needs Clerk and API config as Vite env vars:

```bash
# apps/web/.env.local
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_key
VITE_API_BASE_URL=http://localhost:8787
```

### Database Setup

D1 databases are created and managed via Wrangler:

```bash
# Create local D1 database (for development)
cd apps/api
npx wrangler d1 execute crumb-db --local --file=src/db/migrations/0001_initial_schema.sql
```

To apply new migrations:

```bash
npx wrangler d1 migrations apply crumb-db --local
```

### Local Development

```bash
# Start the API worker (port 8787)
pnpm dev

# Or start the web frontend separately (port 5173)
cd apps/web && pnpm dev

# Or start the kit-plugin in watch mode
cd apps/kit-plugin && pnpm dev
```

---

## Development Commands

All commands can be run from the project root unless noted.

| Command                                                            | Description                            |
| ------------------------------------------------------------------ | -------------------------------------- |
| `pnpm dev`                                                         | Start the API worker (port 8787)       |
| `pnpm test`                                                        | Run API tests in Workers runtime       |
| `pnpm build`                                                       | Build all packages and apps            |
| `pnpm typecheck`                                                   | Typecheck all packages and apps        |
| `cd apps/web && pnpm dev`                                          | Start SvelteKit dev server (port 5173) |
| `cd apps/web && pnpm build`                                        | Build SvelteKit for Cloudflare Pages   |
| `cd apps/web && pnpm typecheck`                                    | Typecheck web app (svelte-check)       |
| `cd apps/kit-plugin && pnpm dev`                                   | Build kit-plugin in watch mode         |
| `cd apps/kit-plugin && pnpm build`                                 | Build kit-plugin IIFE bundle           |
| `cd apps/kit-plugin && pnpm test`                                  | Run kit-plugin tests                   |
| `cd packages/shared && pnpm test`                                  | Run shared package tests               |
| `cd apps/api && npx vitest run`                                    | Run API tests                          |
| `cd apps/api && npx vitest run --coverage`                         | Run API tests with coverage            |
| `cd apps/api && npx wrangler d1 migrations apply crumb-db --local` | Apply D1 migrations locally            |

---

## Architecture Deep Dive

### API (`apps/api`)

A Cloudflare Worker using **Hono** as the HTTP framework. All routes require Clerk JWT authentication except `/health`, `/webhooks/*`, and `/save/*`.

**Services** contain business logic, separated from HTTP concerns:

| Service               | Responsibility                                                            |
| --------------------- | ------------------------------------------------------------------------- |
| `recipe.ts`           | Recipe CRUD, full-text search, ingredient scaling via rational arithmetic |
| `collection.ts`       | Collection management, recipe membership ordering                         |
| `import.ts`           | Import pipeline: URL scraping, WordPress sync, AI extraction              |
| `product.ts`          | Product builder: ebooks, meal plans, card packs, lead magnets             |
| `publishing.ts`       | Platform publishing (Stan Store, Gumroad, LTK) + download packaging       |
| `analytics.ts`        | Engagement score computation, product recommendations                     |
| `automation.ts`       | Kit broadcast drafts, sequence enrollment, seasonal drops                 |
| `segmentation.ts`     | Dietary tag inference from ingredients, segment profile computation       |
| `queue-handlers.ts`   | Queue consumer for import and render pipelines                            |
| `webhook-handlers.ts` | Kit webhook event dispatch (subscriber, purchase, link click)             |

**Kit Integration Layer** (`src/lib/kit/`) wraps all Kit V4 API access: OAuth flow, automatic token refresh, rate limiting (120 req/min rolling window), namespaced tag conventions, and HMAC webhook verification. No code outside this directory makes direct Kit API calls.

**Middleware** handles JWT verification (`auth.ts`), per-creator database scoping (`creator-scope.ts`), and team member access control (`team.ts`).

### Web (`apps/web`)

A **SvelteKit** app deployed to **Cloudflare Pages** via `@sveltejs/adapter-cloudflare`. Uses Svelte 5 with runes.

**Route groups:**

| Route group            | Purpose                                                 |
| ---------------------- | ------------------------------------------------------- |
| `/library`             | Recipe list, detail view, creation, import, collections |
| `/products`            | Product list, detail, ebook/meal-plan builders          |
| `/grow`                | Dashboard, segments, analytics, automation              |
| `/settings`            | Account, Kit connection, brand kit, team                |
| `/sign-in`, `/sign-up` | Clerk authentication pages                              |

**Shared components** include `RecipeCard`, `SearchBar`, `Pagination`, and `DietaryBadge`.

### Kit Plugin (`apps/kit-plugin`)

A standalone JavaScript bundle (IIFE format via Vite library mode) loaded inside Kit's email editor. Exposes a global `CrumbPlugin` object with three methods:

- `init(config)` -- configure API URL, auth token, creator ID
- `renderCard(recipeId, options)` -- render email-safe HTML recipe card
- `searchRecipes(query, filters)` -- search the creator's recipe library

Supports three display modes: **Compact**, **Standard**, and **Full**. All rendered HTML uses inline styles for email client compatibility. Includes a Save This Recipe CTA button with Kit subscriber tracking.

### Shared (`packages/shared`)

TypeScript package consumed by all three apps. Contains:

- **`Result<T, E>`** -- discriminated union for error handling (no thrown exceptions)
- **Branded ID types** -- `RecipeId`, `CreatorId`, etc. with factory functions
- **Enums** -- `const` object enums (`DIETARY_TAG`, `MEAL_TYPE`, `SEASON`, etc.)
- **Quantity arithmetic** -- `WholeNumber`, `Fraction`, `Mixed`, `Decimal` with rational math
- **Value types** -- `RecipeTiming`, `IngredientGroup`, `KitConnection`, etc.
- **Data models** -- `Recipe`, `Product`, `ImportJob`, `Collection`, and more

---

## API Endpoints

### Public

| Method | Path                           | Description                                     |
| ------ | ------------------------------ | ----------------------------------------------- |
| GET    | `/health`                      | Health check                                    |
| POST   | `/webhooks/kit`                | Kit webhook receiver (HMAC-verified)            |
| GET    | `/save/:creatorId/:recipeSlug` | Save This Recipe redirect (subscriber tracking) |

### Recipes (SPEC SS6)

| Method | Path                           | Description                                 |
| ------ | ------------------------------ | ------------------------------------------- |
| POST   | `/recipes`                     | Create a recipe                             |
| GET    | `/recipes`                     | List/search recipes (filterable, paginated) |
| GET    | `/recipes/:id`                 | Get recipe (supports `?servings=N` scaling) |
| PUT    | `/recipes/:id`                 | Update a recipe                             |
| DELETE | `/recipes/:id`                 | Archive a recipe (soft delete)              |
| POST   | `/recipes/:id/duplicate-check` | Check for duplicate titles                  |

### Collections (SPEC SS6.2)

| Method | Path                                 | Description                   |
| ------ | ------------------------------------ | ----------------------------- |
| POST   | `/collections`                       | Create a collection           |
| GET    | `/collections`                       | List all collections          |
| GET    | `/collections/:id`                   | Get collection with recipes   |
| PUT    | `/collections/:id`                   | Update a collection           |
| DELETE | `/collections/:id`                   | Delete a collection           |
| POST   | `/collections/:id/recipes`           | Add recipe to collection      |
| DELETE | `/collections/:id/recipes/:recipeId` | Remove recipe from collection |

### Import Pipeline (SPEC SS7)

| Method | Path                                 | Description                        |
| ------ | ------------------------------------ | ---------------------------------- |
| POST   | `/imports`                           | Create an import job               |
| GET    | `/imports`                           | List import jobs (paginated)       |
| GET    | `/imports/:id`                       | Get import job with extract        |
| POST   | `/imports/:id/confirm`               | Confirm extract, promote to recipe |
| POST   | `/imports/:id/reject`                | Reject/cancel import               |
| POST   | `/imports/wordpress/test-connection` | Test WordPress API connection      |
| POST   | `/imports/wordpress/sync`            | Trigger WordPress recipe sync      |

### Products (SPEC SS8)

| Method | Path                         | Description                              |
| ------ | ---------------------------- | ---------------------------------------- |
| POST   | `/products/ebook`            | Create an ebook product                  |
| POST   | `/products/meal-plan`        | Create a meal plan product               |
| POST   | `/products/recipe-card-pack` | Create a recipe card pack                |
| POST   | `/products/:id/lead-magnet`  | Generate lead magnet from parent product |
| GET    | `/products`                  | List products (filterable, paginated)    |
| GET    | `/products/:id`              | Get product details                      |
| PUT    | `/products/:id`              | Update product                           |
| POST   | `/products/:id/review-copy`  | Mark AI-generated copy as reviewed       |
| POST   | `/products/:id/render`       | Enqueue PDF rendering                    |
| POST   | `/products/:id/publish`      | Transition to Published status           |

### Publishing Pipeline (SPEC SS12)

| Method | Path                              | Description                      |
| ------ | --------------------------------- | -------------------------------- |
| POST   | `/products/:id/publish/:platform` | Publish to external platform     |
| POST   | `/products/:id/download-package`  | Generate download ZIP (fallback) |
| POST   | `/products/:id/share-assets`      | Generate social share images     |
| GET    | `/products/:id/listings`          | Get published listings           |

### Segmentation (SPEC SS9)

| Method | Path                                | Description                         |
| ------ | ----------------------------------- | ----------------------------------- |
| POST   | `/recipes/:id/dietary-tags/infer`   | Trigger dietary auto-tagging        |
| PUT    | `/recipes/:id/dietary-tags/confirm` | Confirm dietary tags                |
| GET    | `/segments`                         | Get current segment profile         |
| POST   | `/segments/compute`                 | Trigger segment profile computation |
| POST   | `/segments/preference-form`         | Create dietary preference Kit form  |

### Analytics (SPEC SS11)

| Method | Path                                     | Description                 |
| ------ | ---------------------------------------- | --------------------------- |
| GET    | `/analytics/engagement-scores`           | List engagement scores      |
| GET    | `/analytics/engagement-scores/:recipeId` | Get single recipe score     |
| POST   | `/analytics/compute-scores`              | Trigger score computation   |
| GET    | `/analytics/recommendations`             | Get product recommendations |

### Automation (SPEC SS10)

| Method | Path                                          | Description                          |
| ------ | --------------------------------------------- | ------------------------------------ |
| POST   | `/automation/save-recipe`                     | Handle Save This Recipe click        |
| POST   | `/automation/broadcast-draft/:recipeId`       | Create Kit broadcast draft           |
| POST   | `/automation/lead-magnet-sequence/:productId` | Create lead magnet delivery sequence |
| GET    | `/automation/seasonal-drops`                  | List seasonal drop configurations    |
| POST   | `/automation/seasonal-drops`                  | Create a seasonal drop               |
| POST   | `/automation/seasonal-drops/process`          | Process due seasonal drops           |

---

## Testing

Tests run inside the **Cloudflare Workers runtime** using `@cloudflare/vitest-pool-workers` -- no Node.js mocks for D1, KV, or R2. This means tests exercise the same runtime your code runs in production.

```bash
# Run all API tests
pnpm test

# Run with coverage
cd apps/api && npx vitest run --coverage

# Run kit-plugin tests
cd apps/kit-plugin && pnpm test

# Run shared package tests
cd packages/shared && pnpm test
```

Test files mirror the source tree and live in `test/` directories alongside `src/`. Coverage threshold is 80% lines.

### Test structure

```
apps/api/test/
├── health.test.ts                  # Health endpoint
├── db/schema.test.ts               # Schema validation
├── lib/kit/
│   ├── client.test.ts              # Kit API client
│   ├── oauth.test.ts               # OAuth flow
│   ├── rate-limiter.test.ts        # Rate limiter logic
│   ├── tag-conventions.test.ts     # Tag naming
│   └── webhooks.test.ts            # HMAC verification
├── middleware/auth.test.ts         # JWT auth middleware
├── routes/recipes.test.ts          # Recipe HTTP handlers
├── services/
│   ├── recipe.test.ts              # Recipe service
│   ├── collection.test.ts          # Collection service
│   ├── import.test.ts              # Import pipeline
│   ├── product.test.ts             # Product builder
│   ├── publishing.test.ts          # Publishing pipeline
│   ├── analytics.test.ts           # Analytics engine
│   ├── automation.test.ts          # Automation engine
│   ├── segmentation.test.ts        # Segmentation engine
│   └── webhook-handlers.test.ts    # Webhook dispatch
└── fixtures/                       # HTML fixtures for import tests
```

---

## SPEC Coverage

Each section of `SPEC.md` maps to a specific implementation location:

| SPEC Section                           | Implementation                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| SS1 -- System Overview                 | Overall architecture                                                                                   |
| SS2 -- Data Models                     | `packages/shared/src/` + `apps/api/src/db/schema.ts`                                                   |
| SS3 -- System Components               | `apps/api/src/services/`                                                                               |
| SS4 -- Kit Integration Layer           | `apps/api/src/lib/kit/`                                                                                |
| SS5 -- Recipe Card Plugin              | `apps/kit-plugin/`                                                                                     |
| SS6 -- Recipe Library                  | `apps/api/src/services/recipe.ts`, `collection.ts`; `apps/api/src/routes/recipes.ts`, `collections.ts` |
| SS7 -- Import Pipeline                 | `apps/api/src/services/import.ts`, `queue-handlers.ts`; `apps/api/src/routes/imports.ts`               |
| SS8 -- Digital Product Builder         | `apps/api/src/services/product.ts`; `apps/api/src/routes/products.ts`                                  |
| SS9 -- Segmentation Engine             | `apps/api/src/services/segmentation.ts`; `apps/api/src/routes/segmentation.ts`                         |
| SS10 -- Automation Engine              | `apps/api/src/services/automation.ts`; `apps/api/src/routes/automation.ts`                             |
| SS11 -- Analytics Engine               | `apps/api/src/services/analytics.ts`, `webhook-handlers.ts`; `apps/api/src/routes/analytics.ts`        |
| SS12 -- Publishing Pipeline            | `apps/api/src/services/publishing.ts`; `apps/api/src/routes/publishing.ts`                             |
| SS13 -- Authentication & Multi-tenancy | `apps/api/src/middleware/auth.ts`, `team.ts`; `apps/web/src/lib/clerk.ts`                              |
| SS14 -- Error Handling                 | `packages/shared/src/result.ts`; service-level error types throughout                                  |

---

## Contributing

### Branch naming

```
feat/{scope}       # New feature:    feat/recipe-library
fix/{scope}        # Bug fix:        fix/import-timeout
```

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(recipes): add ingredient scaling with rational arithmetic
fix(kit): handle token refresh race condition
docs(readme): add API endpoint table
test(analytics): add engagement score computation tests
```

### PR process

1. Branch from `main`
2. Make changes, ensure `pnpm typecheck` and `pnpm test` pass
3. Push and open a PR with title format: `feat(scope): description`
4. All changes land via PR -- no direct pushes to `main`

### Code standards

- TypeScript strict mode everywhere (`"strict": true`)
- No `any` -- use `unknown` and narrow
- No non-null assertions (`!`) -- handle null explicitly
- Async functions return `Promise<Result<T, E>>` -- no thrown exceptions
- Kit API calls go through `apps/api/src/lib/kit/` only
- Enums use `const` objects with `as const`, not TypeScript `enum`
- IDs are branded types (`RecipeId`, `CreatorId`, etc.) -- not interchangeable strings
