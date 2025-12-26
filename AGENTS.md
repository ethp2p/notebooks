# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ethereum P2P Observatory site that:

1. Fetches telemetry from ClickHouse (EthPandaOps Xatu)
2. Stores as Parquet files with query hash tracking
3. Renders Jupyter notebooks to HTML (papermill + nbconvert)
4. Serves via static Astro site

## Common Commands

```bash
# Development
just dev              # Start Astro dev server (site/)
just install          # Install all dependencies (uv + pnpm)

# Data Pipeline
just fetch               # Fetch all data (missing + stale)
just fetch 2025-12-15    # Fetch specific date

# Staleness Detection
just check-stale         # Report stale data (exit 1 if any)
just show-dates          # Show resolved date range from config
just show-hashes         # Show current query hashes

# Rendering
just render              # Render all dates (cached)
just render latest       # Render latest date only
just render 2025-12-15   # Render specific date

# Build
just build               # Build Astro site
just publish             # render + build
just sync                # Full pipeline: fetch + render + build

# Type check
just typecheck
```

## Architecture

```
pipeline.yaml          # Central config: dates, queries, notebooks
queries/               # ClickHouse query modules -> Parquet
scripts/
├── pipeline.py        # Coordinator: config, hashes, staleness
├── fetch_data.py      # CLI: ClickHouse -> notebooks/data/*.parquet
└── render_notebooks.py # CLI: .ipynb -> site/rendered/*.html
notebooks/
├── *.ipynb            # Jupyter notebooks (Plotly visualizations)
├── loaders.py         # load_parquet() utility
├── templates/         # nbconvert HTML templates
└── data/              # Parquet cache + manifest.json (gitignored)
site/                  # Astro static site
├── rendered/          # Pre-rendered HTML + manifest.json (gitignored)
└── src/
    ├── layouts/BaseLayout.astro
    ├── pages/         # index, [date]/[notebook]
    ├── components/    # Sidebar, DateNav, NotebookEmbed, Icon
    └── styles/global.css  # Theme (OKLCH colors)
```

**Data flow:** ClickHouse -> Parquet (with hash) -> papermill/nbconvert -> HTML -> Astro build

## Rendering Pipeline: Papermill + nbconvert

The project uses both Papermill and nbconvert to handle distinct steps:

1.  **Papermill (Execution)**: Handles parameterized execution of notebooks.
    *   **Isolation**: Treats source notebooks as read-only templates, preventing race conditions during parallel renders.
    *   **Parameter Injection**: Automatically injects `target_date` into the `parameters` cell.
    *   **Metadata**: Adds `injected-parameters` tags for traceability and debugging.
2.  **nbconvert (Formatting)**: Converts executed notebooks to clean, production-ready HTML.
    *   **Custom Templates**: Uses `notebooks/templates/minimal` to remove UI clutter (like input/output prompts).
    *   **Plotly Support**: Works with `pio.renderers.default = "notebook"` (auto-injected during rendering) to ensure charts are embedded correctly in the static output.

Using Papermill ensures that developers can keep `target_date = None` in their source notebooks for local experimentation while the production pipeline overrides it safely for any historical date.


## Pipeline Configuration

`pipeline.yaml` is the central configuration file:

```yaml
# Date range modes
dates:
  mode: rolling # rolling | range | list
  rolling:
    window: 14 # Last N days

# Query registry
queries:
  blobs_per_slot:
    module: queries.blob_inclusion
    function: fetch_blobs_per_slot
    output_file: blobs_per_slot.parquet

# Notebook registry
notebooks:
  - id: blob-inclusion
    title: Blob Inclusion
    icon: Layers
    source: notebooks/01-blob-inclusion.ipynb
    queries: [blobs_per_slot, blocks_blob_epoch, ...]
```

## Staleness Detection

The pipeline tracks query source code hashes to detect when queries change:

1. **Query hash**: SHA256 of function AST (excludes docstrings)
2. **Stored in manifest**: `notebooks/data/manifest.json` has `query_hashes` and per-date metadata
3. **Check**: `just check-stale` compares current hashes to stored hashes
4. **Auto-fix**: `just fetch` re-fetches stale query/date combinations automatically

## Design Preferences

- **Simplicity** - Prefer removing features over adding complexity. When in doubt, simplify.
- **No rounded corners** - `--radius: 0` globally; never use `rounded-*` classes
- **No inline SVG** - Use `Icon.tsx` or `NotebookIcon.tsx` with Lucide icon names
- **No date pickers** - Use prev/next navigation instead
- **No emojis** unless explicitly requested
- **Centralized config** - All pipeline config in `pipeline.yaml`
- **Explicit skip logging** - Data pipeline should explicitly log `SKIP` vs `Fetching` for transparency.
- **Rebasing preference** - Prefer rebasing work on `main` before PR creation for clean history.

## Import Strategy

- **Alias imports** - Use `@/` alias for all internal imports within the `site/` directory (e.g., `@/components/...`, `@/lib/...`). Avoid long relative paths.

## Theme

- **Light mode**: Clean whites with purple/teal accents
- **Dark mode**: Deep blue-purple with glowing accents
- **Fonts**: Public Sans (body), Instrument Serif (headings), JetBrains Mono (code)
- **Colors**: OKLCH color space, defined in `site/src/styles/global.css`

## Icon Usage

Two React components wrap Lucide icons:

```tsx
// Generic icon
<Icon name="Calendar" size={14} client:load />

// Notebook icon from config
<NotebookIcon icon={notebook.icon} size={14} client:load />
```

**Important**: Always use `client:load` directive for these React components in Astro files.

## Adding a New Notebook

1. Create query function in `queries/new_query.py`:

   ```python
   def fetch_my_query(client, target_date: str, output_path: Path, network: str) -> int:
       # Execute SQL, write to Parquet, return row count
   ```

2. Register in `pipeline.yaml`:

   ```yaml
   queries:
     my_query:
       module: queries.new_query
       function: fetch_my_query
       output_file: my_query.parquet

   notebooks:
     - id: my-notebook
       title: My Notebook
       icon: FileText
       source: notebooks/04-my-notebook.ipynb
       queries: [my_query]
   ```

3. Create `notebooks/04-my-notebook.ipynb` with parameters cell tagged "parameters":

   ```python
   target_date = None  # Set via papermill
   ```

4. Run `just sync`

## Code Conventions

### Python

- Use type hints
- Query functions return row count
- Use `Path` objects for file paths
- Date format: `YYYY-MM-DD`

### TypeScript/Astro

- Astro components (`.astro`) for static content
- React components (`.tsx`) for interactive elements or Lucide icons
- Prefer CSS variables over hardcoded colors
- **DRY utilities**: Before adding helper functions (date formatting, path conversion, etc.), check `site/src/lib/utils.ts` first. Add new utilities there if they'll be used in multiple components. Never define the same helper inline in multiple files.

### Adding shadcn/ui Components

```bash
cd site && npx shadcn@latest add <component-name>
```

## Package Managers

- **Python:** uv (`uv sync`, `uv run python ...`)
- **Node.js:** pnpm (in site/ directory)

## URL Structure

- `/` - Home
- `/latest/{id}` - Latest notebook
- `/{YYYY}/{MM}/{DD}` - Date landing
- `/{YYYY}/{MM}/{DD}/{id}` - Notebook for date

## Manifests

### Data Manifest (`notebooks/data/manifest.json`)

```json
{
  "schema_version": "2.0",
  "dates": ["2025-12-17", ...],
  "latest": "2025-12-17",
  "query_hashes": {
    "blobs_per_slot": "7779ed745ea1"
  },
  "date_queries": {
    "2025-12-17": {
      "blobs_per_slot": {
        "fetched_at": "2025-12-18T01:00:00Z",
        "query_hash": "7779ed745ea1",
        "row_count": 7200
      }
    }
  }
}
```

### Rendered Manifest (`site/rendered/manifest.json`)

```json
{
  "latest_date": "2025-12-17",
  "dates": {
    "2025-12-17": {
      "blob-inclusion": {
        "rendered_at": "...",
        "notebook_hash": "abc123",
        "html_path": "2025-12-17/blob-inclusion.html"
      }
    }
  }
}
```

## Debugging

### Notebook rendering issues

- Check `notebooks/data/` has Parquet files for target date
- Verify `notebooks/data/manifest.json` lists the date
- Delete `site/rendered/` and re-run `just render`

### Stale data issues

- Run `just check-stale` to see what's outdated
- Run `just fetch` to sync (handles stale automatically)
- Check `just show-hashes` vs stored hashes in manifest

### Site build issues

- Check `site/rendered/manifest.json` exists
- Verify HTML files in `site/rendered/{date}/`
- Run `pnpm run build` from `site/` for detailed errors

### Data fetch issues

- Verify `.env` has valid ClickHouse credentials
- Check network connectivity to ClickHouse host

## CI/CD

Single unified workflow (`sync.yml`) handles everything:

- **Schedule**: Daily at 1am UTC
- **Push to main**: Full sync and deploy to production
- **Pull requests**: Preview deploy to staging

Caching: Data and rendered artifacts are cached in GitHub Actions cache (keyed by query/notebook hashes and date) to avoid redundant fetching and rendering.

## R2 Deployment

Site deployed to Cloudflare R2 with content-addressed storage (CAS):

```
r2-bucket/
├── blobs/                    # Immutable content-addressed files
│   ├── {sha256}.html
│   └── {sha256}.js
└── manifests/
    ├── main.json             # Production manifest
    └── pr-14.json            # PR preview manifest
```

**Serving logic:**
1. Worker receives request for a path (e.g., `/`)
2. Loads `manifests/main.json` (cached 60s in worker)
3. Resolves path → blob key (e.g., `blobs/abc.html`)
4. Serves blob with appropriate headers:
   - **HTML**: `Cache-Control: public, max-age=0, must-revalidate` (Browser always checks for manifest updates)
   - **Assets**: `Cache-Control: public, max-age=31536000, immutable` (Permanent cache for content-addressed files)

**Domains:**
- Production: `observatory.ethp2p.dev`
- PR previews: `observatory-staging.ethp2p.dev/pr-{number}/`

**Key files:**
- `scripts/upload_r2.py` - CAS upload script (parallel blob uploads, deduplication)
- `worker/src/index.ts` - Cloudflare Worker (manifest resolution, blob serving)
- `worker/wrangler.toml` - Worker config (routes, R2 binding)
