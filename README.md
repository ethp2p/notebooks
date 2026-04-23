# Ethereum P2P Observatory

Real-time insights into Ethereum's peer-to-peer layer. Tracking blob propagation, node connectivity, and network health across mainnet.

## Requirements

- [`bun`](https://bun.sh/) v1.1 or later
- [`just`](https://github.com/casey/just) command runner

## Quickstart

```bash
# Install dependencies
just install

# Create .env with ClickHouse credentials
cat > .env << 'EOF'
CLICKHOUSE_URL=https://your-host:8443
CLICKHOUSE_USERNAME=your-user
CLICKHOUSE_PASSWORD=your-password
EOF

# Fetch data and build
just fetch
just build

# Start dev server
just dev
```

## Architecture

The stack is Bun throughout. Data flows from ClickHouse through an observatory pipeline into a Vite + React + ECharts site, then deploys to Cloudflare R2.

```
pipeline.v2.yaml               # Central config: dates, parallelism, settings
observatory/                   # Bun pipeline
├── src/fetch.ts               # CLI: ClickHouse -> build/data/*.arrow
├── src/registry-manifest.ts   # CLI: scan chart topics -> site/public/registry.json
├── src/upload.ts              # CLI: site/dist -> Cloudflare R2 (CAS)
└── src/queries/               # Query definitions per topic
site/                          # Vite + React static site
├── src/workspace/charts/      # ECharts chart definitions (defineChart)
├── src/components/            # React UI (shadcn/ui primitives)
└── public/registry.json       # Chart registry (generated)
worker/                        # Cloudflare Worker: manifest resolution + blob serving
```

Data flow: ClickHouse -> Arrow files (`build/data/`) -> site fetches at runtime -> static build -> Cloudflare R2

## Common commands

```bash
# Development
just install          # Install all Bun dependencies
just dev              # Start Vite dev server

# Data pipeline
just fetch            # Fetch all data (missing + stale)
just fetch 2025-12-15 # Fetch a specific date

# Build
just manifest         # Generate site/public/registry.json
just build            # manifest + Vite build
just upload           # Upload site/dist to Cloudflare R2

# Quality
just typecheck        # TypeScript in both packages
just lint             # ESLint in site/
just test             # Unit tests in both packages
just test-e2e         # Playwright e2e in site/
just verify           # typecheck + lint + test
```

## Staleness detection

The pipeline tracks each query function's AST hash (Babel parse, comments stripped). On `just fetch`, current hashes are compared to hashes stored in `build/data/manifest.json`. Any changed query is re-fetched for all dates in the window.

## CI/CD

Two GitHub Actions workflows:

- **`ci.yml`**: runs on push to main and all PRs; typechecks, lints, tests, and builds.
- **`deploy.yml`**: runs on push to main and manually; fetches data, builds, and uploads to R2.

## R2 deployment

Site is deployed to Cloudflare R2 with content-addressed storage. Blobs are stored at `blobs/{sha256}.{ext}` (immutable, cached forever). A manifest at `manifests/main.json` maps request paths to blob keys. A Cloudflare Worker resolves requests at the edge.

Domains:
- Production: `observatory.ethp2p.dev`
- PR previews: `observatory-staging.ethp2p.dev/pr-{number}/`

## Environment variables

| Variable              | Description                        |
| --------------------- | ---------------------------------- |
| `CLICKHOUSE_URL`      | ClickHouse server URL (with port)  |
| `CLICKHOUSE_USERNAME` | ClickHouse username                |
| `CLICKHOUSE_PASSWORD` | ClickHouse password                |
| `R2_ACCOUNT_ID`       | Cloudflare account ID              |
| `R2_ACCESS_KEY`       | R2 access key                      |
| `R2_SECRET_KEY`       | R2 secret key                      |
| `R2_BUCKET`           | R2 bucket name                     |
| `R2_MANIFEST_KEY`     | Manifest key (e.g. `manifests/main.json`) |
