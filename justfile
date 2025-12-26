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

# Fetch data: all (default) or specific date (YYYY-MM-DD)
# Fetch data: all (default) or specific date (YYYY-MM-DD). Support force="true" to force re-fetch.
fetch target="all" force="false":
    uv run python scripts/fetch_data.py --output-dir notebooks/data \
        {{ if target == "all" { "--sync" } else { "--date " + target } }} \
        {{ if force == "true" { "--force" } else { "" } }}

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

# Render notebooks: all (default), "latest", or specific date (YYYY-MM-DD). Support force="true" to force re-render.
render target="all" force="false":
    uv run python scripts/render_notebooks.py --output-dir site/rendered \
        {{ if target == "all" { "" } \
           else if target == "latest" { "--latest-only" } \
           else { "--date " + target } }} \
        {{ if force == "true" { "--force" } else { "" } }}

# ============================================
# Build & Deploy
# ============================================

# Build Astro site
build:
    cd site && pnpm run build

# Render all + build Astro
publish: render build

# ============================================
# CI / Full Pipeline
# ============================================

# Full sync: fetch + render + build
sync: fetch render build

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
    rm -rf site/dist site/.astro site/rendered

# Clean all (including node_modules and venv)
clean-all: clean
    rm -rf site/node_modules .venv
