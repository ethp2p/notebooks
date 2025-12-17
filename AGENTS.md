# AGENTS.md

This document provides context and guidelines for AI agents working on this codebase.

## Project Overview

This is an **Ethereum P2P Network Analysis** project that:

1. Fetches network telemetry data from ClickHouse (EthPandaOps Xatu infrastructure)
2. Stores data as Parquet files
3. Renders Jupyter/Quarto notebooks into HTML visualizations
4. Serves the results via a static Astro website

The site displays daily analysis of Ethereum mainnet P2P networking, including blob propagation, validator behavior, and column timing.

## Repository Structure

```
.
├── queries/                    # Python modules for ClickHouse queries
│   ├── blob_inclusion.py       # Blob inclusion pattern queries
│   ├── blob_flow.py            # Blob flow across validators/builders
│   └── column_propagation.py   # Column propagation timing queries
├── scripts/
│   ├── fetch_data.py           # CLI: fetch data from ClickHouse → Parquet
│   └── render_notebooks.py     # CLI: render .qmd notebooks → HTML
├── notebooks/
│   ├── loaders.py              # Parquet loading utilities
│   ├── data/                   # Local Parquet data cache (gitignored)
│   └── *.qmd                   # Quarto markdown notebooks
├── site/                       # Astro static site
│   ├── config/notebooks.yaml   # Notebook registry (metadata, order, icons)
│   ├── public/rendered/        # Pre-rendered notebook HTML + manifest.json
│   └── src/
│       ├── layouts/            # BaseLayout.astro (main layout)
│       ├── pages/              # Astro pages (index, notebooks, archive)
│       ├── components/         # Astro + React components
│       │   ├── ui/             # shadcn/ui components
│       │   ├── Icon.tsx        # Generic Lucide icon wrapper
│       │   └── NotebookIcon.tsx # Notebook-specific icon component
│       └── styles/global.css   # Global styles and theme
├── justfile                    # Task runner commands
└── .env                        # ClickHouse credentials (not committed)
```

## Key Technologies

| Layer            | Technology                  | Purpose                             |
| ---------------- | --------------------------- | ----------------------------------- |
| Data fetch       | Python + ClickHouse         | Query network telemetry             |
| Data storage     | Parquet                     | Columnar data files                 |
| Notebooks        | Quarto (.qmd)               | Analysis with Plotly visualizations |
| Site framework   | Astro                       | Static site generation              |
| Styling          | Tailwind CSS v4             | Utility-first CSS                   |
| UI components    | shadcn/ui + Lucide icons    | React component library             |
| Package managers | uv (Python), pnpm (Node.js) | Dependency management               |

## Common Tasks

### Development Commands

```bash
# Start Astro dev server
just dev

# Fetch yesterday's data
just fetch

# Render notebooks for latest date
just render

# Build production site
just build

# Full pipeline: fetch + render + build
just daily
```

### Working with the Astro Site

The site is in `site/`. Key files:

- `src/layouts/BaseLayout.astro` - Main layout with sidebar, theme switcher
- `src/styles/global.css` - All CSS variables, theme definitions, global styles
- `src/components/Sidebar.astro` - Navigation sidebar
- `src/components/DateNav.astro` - Date navigation for notebooks
- `src/components/NotebookEmbed.astro` - Renders pre-built notebook HTML
- `src/components/NotebookIcon.tsx` - Shared React component for notebook icons
- `src/pages/index.astro` - Home page
- `src/pages/[date]/index.astro` - Date landing page (lists notebooks for date)
- `src/pages/[date]/[notebook].astro` - Notebook view for specific date
- `config/notebooks.yaml` - Notebook registry (add new notebooks here)

### Adding a New Notebook

1. Create query function in `queries/new_query.py`
2. Register fetcher in `scripts/fetch_data.py` FETCHERS list
3. Create notebook `notebooks/XX-new-notebook.qmd`
4. Add entry to `site/config/notebooks.yaml` (include `icon` field with Lucide icon name)
5. Run `just fetch && just render && just build`

## Design System

### Owner Preferences

The owner has specific design preferences that should be followed:

- **No rounded corners** - The `--radius` CSS variable is set to `0`. Do not use `rounded-*` Tailwind classes.
- **No emojis** - Avoid using emojis in code, comments, or UI unless explicitly requested.
- **Simplicity** - Prefer removing features over adding complexity. When in doubt, simplify.
- **Lucide icons only** - Never use inline SVG. Use Lucide icon names via the `Icon.tsx` or `NotebookIcon.tsx` components.
- **Centralized configuration** - Put configurable values in `config/notebooks.yaml` rather than hardcoding in components.
- **No date pickers** - Date selection was intentionally removed for simplicity. Use prev/next navigation instead.

### Theme

The site uses a "Technical Observatory" theme with:

- **Light mode**: Clean whites with purple/teal accents
- **Dark mode**: Deep blue-purple with glowing accents
- **No border radius** - Sharp, squared corners throughout
- **Fonts**:
  - Sans: Public Sans
  - Serif: Instrument Serif (headings)
  - Mono: JetBrains Mono, Space Mono

### CSS Variables

All theme colors are defined in `site/src/styles/global.css` using OKLCH color space:

```css
:root {
  --background: oklch(...);
  --foreground: oklch(...);
  --primary: oklch(...); /* Purple - Ethereum inspired */
  --accent: oklch(...); /* Teal */
  --muted: oklch(...);
  --radius: 0; /* No rounded corners */
  /* ... */
}

.dark {
  /* Dark mode overrides */
}
```

### Icon Components

The site uses two React components for icons, both wrapping Lucide:

1. **`Icon.tsx`** - Generic icon component for any Lucide icon
   ```tsx
   <Icon name="Calendar" size={14} client:load />
   <Icon name="ChevronLeft" size={18} className="text-muted" client:load />
   ```

2. **`NotebookIcon.tsx`** - Specialized for notebook icons from config
   ```tsx
   <NotebookIcon icon={notebook.icon} size={14} client:load />
   ```

Each notebook in `config/notebooks.yaml` should have an `icon` field with a Lucide icon name:

```yaml
notebooks:
  - id: blob-inclusion
    title: "Blob Inclusion"
    icon: Layers  # Lucide icon name
    # ...
```

The `NotebookIcon.tsx` component renders these icons consistently across:
- Home page notebook list
- Date page notebook cards
- Sidebar navigation

**Important**: Always use `client:load` directive when using these components in Astro files since they are React components.

### Key UI Patterns

- **Sidebar navigation** with animated hover states
- **Date navigator** (sticky, shows prev/next dates)
- **Table of contents** with scroll progress
- **Theme switcher** (Light/System/Dark segmented control)
- **Card components** with hover glow effects in dark mode

## Data Flow

```
ClickHouse (Xatu)
    │
    ▼ [scripts/fetch_data.py]
Parquet files (notebooks/data/)
    │
    ▼ [scripts/render_notebooks.py + Quarto]
Pre-rendered HTML (site/public/rendered/)
    │
    ▼ [Astro build]
Static site (site/dist/)
```

### Manifest

The manifest at `site/public/rendered/manifest.json` tracks:

- `latest_date`: Most recent data date
- `dates`: Map of dates to available notebooks
- `notebooks`: Notebook metadata

### URL Structure

- `/` - Home page
- `/notebooks/{id}` - Latest version of a notebook
- `/{YYYYMMDD}` - Date landing page (compact date format)
- `/{YYYYMMDD}/{id}` - Specific notebook for a date
- `/archive/{YYYY-MM-DD}` - Archive date page (ISO format, legacy)

Note: The site uses compact date format (YYYYMMDD) in URLs for cleaner paths.

## Code Conventions

### Python

- Use type hints
- Query functions return row count
- Output paths should use `Path` objects
- Date format: `YYYY-MM-DD`

### TypeScript/Astro

- Use TypeScript for all `.ts` and `.tsx` files
- Astro components use `.astro` extension
- React components (`.tsx`) for interactive elements or when using libraries like Lucide
- Prefer CSS variables over hardcoded colors
- Use semantic class names

### CSS

- Use CSS custom properties (`var(--*)`)
- OKLCH color space for all colors
- **No rounded corners** - `--radius: 0` is set globally
- Animations should respect `prefers-reduced-motion`
- Mobile-first responsive design
- Use Tailwind's `@apply` directive for repeated patterns

### Component Patterns

When creating shared components:

1. **Put config in YAML** - Metadata like icons, titles go in `config/notebooks.yaml`
2. **Use React for dynamic imports** - e.g., `NotebookIcon.tsx` for Lucide icons
3. **Type the config** - Define TypeScript interfaces for YAML data structures
4. **Avoid duplication** - Create shared components rather than copying code

Example notebook config type:

```typescript
type NotebookConfig = {
  id: string;
  title: string;
  description: string;
  icon?: string;  // Lucide icon name
  order: number;
};
```

## Important Constraints

1. **No secrets in code** - ClickHouse credentials are in `.env`
2. **Parquet files are gitignored** - Data is fetched fresh or from `data` branch
3. **Pre-rendered HTML** - Notebooks are rendered at build time, not runtime
4. **Static site** - No server-side rendering, pure static output
5. **Daily updates** - Site rebuilds daily at 1am UTC via GitHub Actions
6. **No rounded corners** - Design uses sharp edges throughout
7. **No inline SVG** - Use `Icon.tsx` or `NotebookIcon.tsx` components with Lucide icon names (exception: the Ethereum logo in BaseLayout.astro)
8. **No date pickers** - Removed for simplicity; use prev/next navigation

## Testing Changes

```bash
# Quick iteration on site changes
just dev

# Test full pipeline locally
just clean
just fetch
just render
just build
just preview

# Type check
cd site && npx tsc --noEmit
```

## Debugging

### Notebook rendering issues

- Check `notebooks/data/` has Parquet files for the target date
- Verify `notebooks/data/manifest.json` lists the date
- Run `just render-force` to bypass cache

### Site build issues

- Check `site/public/rendered/manifest.json` exists
- Verify HTML files exist in `site/public/rendered/{date}/`
- Run `pnpm run build` from `site/` for detailed errors

### Data fetch issues

- Verify `.env` has valid ClickHouse credentials
- Check network connectivity to ClickHouse host
- Review query output in `queries/*.py`

## CI/CD

Two GitHub Actions workflows:

1. **fetch-data.yml** - Daily at 1am UTC
   - Fetches previous day's data
   - Commits Parquet to `data` branch

2. **build-book.yml** - On push to main or after data fetch
   - Checks out `data` branch
   - Renders notebooks
   - Builds Astro site
   - Deploys to GitHub Pages

## Branch Strategy

| Branch        | Purpose                                  |
| ------------- | ---------------------------------------- |
| `main`        | Source code                              |
| `data`        | Parquet data files                       |
| `gh-pages`    | Deployed site                            |
| `raulk/astro` | Current feature branch (Astro migration) |

## shadcn/ui Components

The project uses shadcn/ui with the `base-lyra` style. Components are in `site/src/components/ui/`.

To add new components:

```bash
cd site
npx shadcn@latest add <component-name>
```

Installed components include:
- `button`, `calendar`, `popover`, `label`
- `card`, `badge`, `input`, `textarea`
- `dropdown-menu`, `select`, `combobox`
- `alert-dialog`, `field`, `input-group`, `separator`

Components are pre-configured with `rounded-none` to match the no-radius design preference.
