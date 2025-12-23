# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ethereum P2P Network Analysis site that:
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
just fetch            # Fetch yesterday's data from ClickHouse
just fetch-date 2025-01-15    # Fetch specific date
just fetch-regen      # Auto-regenerate stale data

# Staleness Detection
just check-stale      # Report stale data (exit 1 if any)
just show-dates       # Show resolved date range from config
just show-hashes      # Show current query hashes

# Rendering
just render           # Render notebooks for latest date
just render-all       # Render all available dates
just render-force     # Force re-render (bypass cache)
just render-notebook blob-inclusion  # Render single notebook

# Build
just build            # Build Astro site
just publish          # render + build
just daily            # Full pipeline: fetch + render + build

# CI Commands (called by GitHub Actions)
just ci-daily         # fetch -> render -> build
just ci-rebuild       # fetch-regen -> render-all -> build
just ci-preview       # render-stale -> build

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
└── render_notebooks.py # CLI: .ipynb -> site/public/rendered/*.html
notebooks/
├── *.ipynb            # Jupyter notebooks (Plotly visualizations)
├── loaders.py         # load_parquet() utility
├── templates/         # nbconvert HTML templates
└── data/              # Parquet cache + manifest.json (gitignored)
site/                  # Astro static site
├── public/rendered/   # Pre-rendered HTML + manifest.json
└── src/
    ├── layouts/BaseLayout.astro
    ├── pages/         # index, [date]/[notebook]
    ├── components/    # Sidebar, DateNav, NotebookEmbed, Icon
    └── styles/global.css  # Theme (OKLCH colors)
```

**Data flow:** ClickHouse -> Parquet (with hash) -> papermill/nbconvert -> HTML -> Astro build

## Pipeline Configuration

`pipeline.yaml` is the central configuration file:

```yaml
# Date range modes
dates:
  mode: rolling    # rolling | range | list
  rolling:
    window: 14     # Last N days

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
4. **Auto-fix**: `just fetch-regen` re-fetches only stale query/date combinations

## Design Preferences

- **Simplicity** - Prefer removing features over adding complexity. When in doubt, simplify.
- **No rounded corners** - `--radius: 0` globally; never use `rounded-*` classes
- **No inline SVG** - Use `Icon.tsx` or `NotebookIcon.tsx` with Lucide icon names
- **No date pickers** - Use prev/next navigation instead
- **No emojis** unless explicitly requested
- **Centralized config** - All pipeline config in `pipeline.yaml`

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

4. Run `just fetch && just render && just build`

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

### Adding shadcn/ui Components

```bash
cd site && npx shadcn@latest add <component-name>
```

## Package Managers

- **Python:** uv (`uv sync`, `uv run python ...`)
- **Node.js:** pnpm (in site/ directory)

## URL Structure

- `/` - Home
- `/notebooks/{id}` - Latest notebook
- `/{YYYYMMDD}` - Date landing (compact format)
- `/{YYYYMMDD}/{id}` - Notebook for date

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

### Rendered Manifest (`site/public/rendered/manifest.json`)

```json
{
  "latest_date": "2025-12-17",
  "dates": {
    "2025-12-17": {
      "blob-inclusion": {
        "rendered_at": "...",
        "notebook_hash": "abc123",
        "html_path": "latest/blob-inclusion.html"
      }
    }
  }
}
```

## Debugging

### Notebook rendering issues
- Check `notebooks/data/` has Parquet files for target date
- Verify `notebooks/data/manifest.json` lists the date
- Run `just render-force` to bypass cache

### Stale data issues
- Run `just check-stale` to see what's outdated
- Run `just fetch-regen` to auto-fix
- Check `just show-hashes` vs stored hashes in manifest

### Site build issues
- Check `site/public/rendered/manifest.json` exists
- Verify HTML files in `site/public/rendered/{date}/`
- Run `pnpm run build` from `site/` for detailed errors

### Data fetch issues
- Verify `.env` has valid ClickHouse credentials
- Check network connectivity to ClickHouse host

## CI/CD

GitHub workflows call `just` commands for local/CI parity:

- `fetch-data.yml` - Daily at 1am UTC, runs `just fetch`, commits to `data` branch
- `build-site.yml` - Runs `just render` + `just build`, deploys to GitHub Pages
- `preview-site.yml` - Runs `just ci-preview` for PR previews on Cloudflare

## Branches

| Branch | Purpose |
|--------|---------|
| `main` | Source code |
| `data` | Parquet data files |
| `rendered` | Pre-rendered HTML artifacts |
| `gh-pages` | Deployed site |
