# Eth P2P Notebooks - Astro Site

# Default recipe
default:
    @just --list

# ============================================
# Development
# ============================================

# Start Astro development server
dev:
    cd site && pnpm run dev

# Preview production build
preview:
    cd site && pnpm run preview

# Install site dependencies
install:
    cd site && pnpm install

# ============================================
# Data Fetching
# ============================================

# Fetch yesterday's data from ClickHouse
fetch:
    uv run python scripts/fetch_data.py --output-dir notebooks/data

# Fetch data for a specific date
fetch-date date:
    uv run python scripts/fetch_data.py --date {{date}} --output-dir notebooks/data

# ============================================
# Notebook Rendering
# ============================================

# Render notebooks for latest date only
render:
    uv run python scripts/render_notebooks.py --output-dir site/public/rendered --latest-only

# Render notebooks for all available dates
render-all:
    uv run python scripts/render_notebooks.py --output-dir site/public/rendered

# Render notebooks for a specific date
render-date date:
    uv run python scripts/render_notebooks.py --output-dir site/public/rendered --date {{date}}

# Render a specific notebook for all dates
render-notebook notebook:
    uv run python scripts/render_notebooks.py --output-dir site/public/rendered --notebook {{notebook}}

# Force re-render all notebooks (ignores cache)
render-force:
    uv run python scripts/render_notebooks.py --output-dir site/public/rendered --force

# ============================================
# Build & Publish
# ============================================

# Build Astro site
build:
    cd site && pnpm run build

# Full publish: render latest + build Astro
publish: render build

# Full publish with all dates: render all + build Astro
publish-all: render-all build

# ============================================
# CI Workflows
# ============================================

# Daily CI workflow: fetch yesterday's data + render + build
daily: fetch publish

# ============================================
# Cleanup
# ============================================

# Clean build artifacts
clean:
    rm -rf site/dist site/.astro site/public/rendered

# Clean all (including node_modules)
clean-all: clean
    rm -rf site/node_modules
