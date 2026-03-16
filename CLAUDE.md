# [PRODUCT] — Project Intelligence

## Stack

- **Runtime:** Cloudflare Workers (TypeScript)
- **Database:** Cloudflare D1 (SQLite via Drizzle ORM)
- **File storage:** Cloudflare R2
- **Async jobs:** Cloudflare Queues
- **Caching:** Cloudflare KV
- **Frontend:** SvelteKit, deployed to Cloudflare Pages
- **Auth:** Clerk (frontend SDK + backend JWT verification)
- **CLI:** `npx wrangler` — never assume a global `wrangler` install

## Documentation policy — MANDATORY

Before implementing any integration with an external service or
Cloudflare primitive, fetch the current official documentation.
Do not rely on training data. APIs, SDK shapes, and Wrangler
config syntax change frequently.

Required fetches before first use:
- Cloudflare Workers: https://developers.cloudflare.com/workers/
- Cloudflare D1: https://developers.cloudflare.com/d1/
- Cloudflare R2: https://developers.cloudflare.com/r2/
- Cloudflare Queues: https://developers.cloudflare.com/queues/
- Cloudflare KV: https://developers.cloudflare.com/kv/
- Cloudflare Pages + SvelteKit: https://developers.cloudflare.com/pages/framework-guides/deploy-a-svelte-site/
- Clerk Workers SDK: https://clerk.com/docs/references/backend/overview
- Clerk SvelteKit SDK: https://clerk.com/docs/references/svelte/overview
- Kit V4 API: https://developers.kit.com/v4
- Drizzle + D1: https://orm.drizzle.team/docs/get-started/d1-new

If documentation contradicts your training data, documentation wins.
If you are unsure of the current shape of any API or config option,
fetch the docs before writing code. Never guess.

## Architecture — SPEC.md mapping to Cloudflare

Read SPEC.md at the project root for the authoritative specification.
The Cloudflare service mapping is:

| SPEC component              | Cloudflare primitive          |
|-----------------------------|-------------------------------|
| Application core API        | Workers (Hono router)         |
| All entity persistence      | D1 via Drizzle ORM            |
| PDF/EPUB/photo file storage | R2                            |
| Import pipeline jobs        | Queues (consumer Workers)     |
| PDF rendering jobs          | Queues (consumer Workers)     |
| Kit subscriber cache        | KV (TTL: 5 minutes)           |
| Engagement score cache      | KV (TTL: 24 hours)            |
| Rate-limit state (Kit API)  | Durable Objects               |
| Frontend                    | SvelteKit on Pages            |
| Auth session verification   | Clerk JWT middleware on Worker|

## File structure
```
/
├── SPEC.md
├── CLAUDE.md
├── apps/
│   ├── api/                  # Cloudflare Worker — Hono API
│   │   ├── src/
│   │   │   ├── index.ts      # Worker entry point
│   │   │   ├── routes/       # One file per SPEC section
│   │   │   ├── services/     # Business logic, one file per SPEC component
│   │   │   ├── db/
│   │   │   │   ├── schema.ts # Drizzle schema — source of truth
│   │   │   │   └── migrations/
│   │   │   ├── lib/
│   │   │   │   ├── kit/      # Kit Integration Layer (SPEC §4)
│   │   │   │   └── ai/       # AI extraction helpers
│   │   │   └── types/        # Newtype aliases, enums, sum types
│   │   ├── test/
│   │   ├── wrangler.toml
│   │   └── package.json
│   ├── web/                  # SvelteKit frontend
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── lib/
│   │   │   └── app.d.ts
│   │   ├── wrangler.toml
│   │   └── package.json
│   └── kit-plugin/           # Kit App Store plugin — standalone JS bundle
│       ├── src/
│       │   ├── index.ts      # Plugin entry point
│       │   ├── components/   # Search UI, card renderer, preview
│       │   └── lib/          # API client, card HTML generation
│       ├── vite.config.ts
│       └── package.json
└── packages/
    └── shared/               # Shared types used by api, web, and kit-plugin
```

## Database

- Schema lives in `apps/api/src/db/schema.ts` using Drizzle's D1 dialect.
- Migrations are generated with `npx wrangler d1 migrations create` and
  applied with `npx wrangler d1 migrations apply`.
- Never mutate the database directly. All schema changes go through
  migrations.
- The data model in SPEC.md §2 is the source of truth for schema design.
  Implement joined-table inheritance for `Product` exactly as specified.

## Type system

- Newtype aliases are implemented as branded types:
  `type RecipeId = string & { readonly __brand: 'RecipeId' }`
- Sum types / discriminated unions use a `type` discriminant field.
- `Option<T>` maps to `T | null` in TypeScript. Use `null`, never
  `undefined`, for absent optional values.
- All enums in the spec map to TypeScript `const` objects with
  `as const`, not TypeScript `enum`.

## Testing

- Framework: Vitest with `@cloudflare/vitest-pool-workers`
- All tests run inside the Workers runtime — no Node mocks for D1, KV, R2.
- Test files live in `test/` alongside `src/`, mirroring the source tree.
- Every public function in `services/` and `lib/` must have tests before
  the implementation is considered complete.
- Integration tests use D1 in-process via `wrangler.toml` `[dev]` config.
- Run all tests: `npx vitest run`
- Run with coverage: `npx vitest run --coverage`
- Minimum coverage threshold: 80% lines. Enforced in CI.

## Code style

- TypeScript strict mode: `"strict": true` in all tsconfigs.
- No `any`. Use `unknown` and narrow explicitly.
- No non-null assertion (`!`). Handle null explicitly.
- Imports are absolute within a package using the `$lib` alias (SvelteKit)
  or path aliases in the API.
- All async functions return `Promise<Result<T, E>>` using a simple
  `Result` type rather than throwing. Exceptions are reserved for
  unrecoverable programming errors.
- Kit API calls go through the Kit Integration Layer only (SPEC §4).
  No direct `fetch` to Kit API outside of `apps/api/src/lib/kit/`.

## Environment and secrets

- Secrets are bound via `wrangler.toml` `[vars]` (non-secret) or
  `npx wrangler secret put` (secret values).
- No secrets in source code or `.env` files committed to the repo.
- Required bindings are declared in `wrangler.toml` and typed in
  the `Env` interface in `src/index.ts`.
- Clerk publishable key: `CLERK_PUBLISHABLE_KEY` (var)
- Clerk secret key: `CLERK_SECRET_KEY` (secret)
- Kit OAuth credentials: `KIT_CLIENT_ID` (var), `KIT_CLIENT_SECRET` (secret)

## Git

- Main branch: `main` — protected, no direct pushes.
- Feature branches: `feat/{scope}` — e.g. `feat/recipe-library`
- All changes land via PR.
- PR title format: `feat(scope): description` or `fix(scope): description`
- Commit messages follow Conventional Commits.
- `gh` CLI is available and authenticated.
