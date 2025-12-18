# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ethereum P2P Network Analysis site that:
1. Fetches telemetry from ClickHouse (EthPandaOps Xatu)
2. Stores as Parquet files
3. Renders Jupyter notebooks to HTML (papermill + nbconvert)
4. Serves via static Astro site

## Common Commands

```bash
# Development
just dev              # Start Astro dev server (site/)
just fetch            # Fetch yesterday's data from ClickHouse
just render           # Render notebooks for latest date
just build            # Build Astro site
just daily            # Full pipeline: fetch + render + build

# Specific operations
just fetch-date 2025-01-15    # Fetch specific date
just render-force             # Force re-render (bypass cache)
just render-notebook blob-inclusion  # Render single notebook

# Type check
cd site && npx tsc --noEmit
```

## Architecture

```
queries/               # ClickHouse query modules → Parquet
scripts/
├── fetch_data.py      # CLI: ClickHouse → notebooks/data/*.parquet
└── render_notebooks.py # CLI: .ipynb → site/public/rendered/*.html
notebooks/
├── *.ipynb            # Jupyter notebooks (Plotly visualizations)
├── loaders.py         # load_parquet() utility
├── templates/         # nbconvert HTML templates
└── data/              # Parquet cache (gitignored)
site/                  # Astro static site
├── config/notebooks.yaml  # Notebook registry (metadata, icons, order)
├── public/rendered/       # Pre-rendered HTML + manifest.json
└── src/
    ├── layouts/BaseLayout.astro
    ├── pages/              # index, [date]/[notebook]
    ├── components/
    │   ├── Sidebar.astro, DateNav.astro, NotebookEmbed.astro
    │   ├── Icon.tsx, NotebookIcon.tsx  # Lucide wrappers
    │   └── ui/             # shadcn/ui (base-lyra style)
    └── styles/global.css   # Theme (OKLCH colors)
```

**Data flow:** ClickHouse → Parquet → papermill/nbconvert → HTML → Astro build

## Design Preferences

- **Simplicity** - Prefer removing features over adding complexity. When in doubt, simplify.
- **No rounded corners** - `--radius: 0` globally; never use `rounded-*` classes
- **No inline SVG** - Use `Icon.tsx` or `NotebookIcon.tsx` with Lucide icon names
- **No date pickers** - Use prev/next navigation instead
- **No emojis** unless explicitly requested
- **Centralized config** - Put notebook metadata in `config/notebooks.yaml`

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

1. Create query function in `queries/new_query.py`
2. Register fetcher in `scripts/fetch_data.py` FETCHERS list
3. Create `notebooks/XX-new-notebook.ipynb` with parameters cell tagged "parameters":
   ```python
   target_date = None  # Set via papermill
   ```
4. Add entry to `site/config/notebooks.yaml` (include `icon` field with Lucide name)
5. Run `just fetch && just render && just build`

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

## Manifest

`site/public/rendered/manifest.json` tracks:
- `latest_date`: Most recent data date
- `dates`: Map of dates to available notebooks
- `notebooks`: Notebook metadata

## Debugging

### Notebook rendering issues
- Check `notebooks/data/` has Parquet files for target date
- Verify `notebooks/data/manifest.json` lists the date
- Run `just render-force` to bypass cache

### Site build issues
- Check `site/public/rendered/manifest.json` exists
- Verify HTML files in `site/public/rendered/{date}/`
- Run `pnpm run build` from `site/` for detailed errors

### Data fetch issues
- Verify `.env` has valid ClickHouse credentials
- Check network connectivity to ClickHouse host

## CI/CD

- `fetch-data.yml` - Daily at 1am UTC, commits Parquet to `data` branch
- `build-book.yml` - Builds and deploys to GitHub Pages

## Branches

| Branch | Purpose |
|--------|---------|
| `main` | Source code |
| `data` | Parquet data files |
| `gh-pages` | Deployed site |
