# Eth P2P Notebooks - Pipeline Commands

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

# Install all dependencies
install:
    uv sync
    cd site && pnpm install

# ============================================
# Data Pipeline
# ============================================

# Fetch yesterday's data from ClickHouse
fetch:
    uv run python scripts/fetch_data.py --output-dir notebooks/data

# Fetch data for a specific date
fetch-date date:
    uv run python scripts/fetch_data.py --date {{date}} --output-dir notebooks/data

# Fetch and auto-regenerate any stale data
fetch-regen:
    uv run python scripts/fetch_data.py --output-dir notebooks/data --auto-regenerate

# Check for stale data without fetching
check-stale:
    uv run python scripts/pipeline.py check-stale

# Show resolved date range from config
show-dates:
    uv run python scripts/pipeline.py resolve-dates

# Show current query hashes
show-hashes:
    uv run python scripts/pipeline.py query-hashes

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

# Render even if data is stale (skip staleness check)
render-stale:
    uv run python scripts/render_notebooks.py --output-dir site/public/rendered --allow-stale --latest-only

# ============================================
# Build & Deploy
# ============================================

# Build Astro site
build:
    cd site && pnpm run build

# Full publish: render latest + build Astro
publish: render build

# Full publish with all dates: render all + build Astro
publish-all: render-all build

# ============================================
# CI / Full Pipeline
# ============================================

# Full sync: fetch + render + build (used by CI)
sync: fetch-regen render build

# CI: Check data staleness (exit 1 if stale)
check-stale-ci:
    uv run python scripts/fetch_data.py --output-dir notebooks/data --check-only

# ============================================
# Utilities
# ============================================

# Warn about stale data but don't fail
check-stale-warn:
    uv run python scripts/pipeline.py check-stale || echo "Warning: Some data may be stale"

# Type check the Astro site
typecheck:
    cd site && npx tsc --noEmit

# Clean build artifacts
clean:
    rm -rf site/dist site/.astro site/public/rendered

# Clean all (including node_modules and venv)
clean-all: clean
    rm -rf site/node_modules .venv
