# Deploying Dough

## How deployments work

All deployments are automated via GitHub Actions. Pushing to `main` (or merging a PR into `main`) triggers the **Deploy** workflow (`.github/workflows/deploy.yml`), which deploys all apps in parallel:

| App              | Target                               | Custom domain      |
| ---------------- | ------------------------------------ | ------------------ |
| `apps/api`       | Cloudflare Worker (`dough-api`)      | api.makedough.app  |
| `apps/web`       | Cloudflare Pages (`dough-web`)       | dash.makedough.app |
| `apps/docs`      | Cloudflare Pages (`dough-docs`)      | docs.makedough.app |
| `apps/marketing` | Cloudflare Pages (`dough-marketing`) | makedough.app      |

The marketing site job is gated on `apps/marketing/package.json` existing. It will be skipped until that app is created.

CI (`.github/workflows/ci.yml`) only runs tests, linting, and typechecking. It does **not** deploy anything.

## Manual deploys

You can trigger a deploy manually from the GitHub Actions tab using the **workflow_dispatch** trigger:

1. Go to **Actions** > **Deploy** in the GitHub repository.
2. Click **Run workflow**.
3. Select the `main` branch (or any branch you want to deploy from).
4. Click **Run workflow**.

## Required GitHub secrets

The following secret must be configured in the repository settings under **Settings > Secrets and variables > Actions**:

### `CLOUDFLARE_API_TOKEN`

A Cloudflare API token with the following permissions:

- **Workers Scripts**: Edit
- **Workers Routes**: Edit
- **Pages**: Edit
- **D1**: Edit
- **R2**: Edit
- **KV Storage**: Edit
- **Queues**: Edit

To create this token:

1. Go to [Cloudflare Dashboard > API Tokens](https://dash.cloudflare.com/profile/api-tokens).
2. Click **Create Token**.
3. Use the **Custom token** template.
4. Add the permissions listed above.
5. Under **Account Resources**, select the account `6f9565cb51f0bb050c420ca18dfff22f`.
6. Under **Zone Resources**, include all zones (or restrict to `makedough.app`).
7. Click **Continue to summary**, then **Create Token**.
8. Copy the token and add it as a GitHub repository secret named `CLOUDFLARE_API_TOKEN`.

## Deploying from local machine

For one-off deploys or debugging, you can deploy directly from your machine:

```bash
# API Worker
cd apps/api
npx wrangler deploy

# Dashboard (Pages)
cd apps/web
pnpm build
npx wrangler pages deploy .svelte-kit/cloudflare --project-name=dough-web

# Docs (Pages)
cd apps/docs
pnpm build
npx wrangler pages deploy dist --project-name=dough-docs
```

You will need `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` set as environment variables, or be logged in via `npx wrangler login`.

## Custom domains

Custom domains are configured in the Cloudflare dashboard:

- **makedough.app** -- Marketing site (Cloudflare Pages: `dough-marketing`)
- **dash.makedough.app** -- Dashboard (Cloudflare Pages: `dough-web`)
- **docs.makedough.app** -- Documentation (Cloudflare Pages: `dough-docs`)
- **api.makedough.app** -- API (Cloudflare Worker route or Custom Domain)

To add a custom domain to a Pages project:

1. Go to **Cloudflare Dashboard > Workers & Pages > [project]**.
2. Click **Custom domains**.
3. Add the domain and follow the DNS verification steps.

## First-time setup

On the first deploy, Cloudflare Pages projects are created automatically by Wrangler. No manual project creation is needed. However, you should:

1. Ensure the `CLOUDFLARE_API_TOKEN` secret is configured in GitHub.
2. Ensure D1 databases, KV namespaces, R2 buckets, and Queues referenced in `apps/api/wrangler.toml` exist in your Cloudflare account (replace placeholder IDs with real ones for production).
3. Set Worker secrets via `npx wrangler secret put <NAME>` for sensitive values like `CLERK_SECRET_KEY` and `KIT_CLIENT_SECRET`.
