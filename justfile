# Eth P2P Notebooks - Development and CI tasks

# Default recipe
default:
    @just --list

# Start Quarto development server
dev:
    uv run quarto preview

# Fetch yesterday's data from ClickHouse
fetch:
    uv run python scripts/fetch_data.py --output-dir notebooks/data

# Fetch data for a specific date
fetch-date date:
    uv run python scripts/fetch_data.py --date {{date}} --output-dir notebooks/data

# Render the site (latest notebooks only)
render:
    uv run quarto render

# Render historical notebooks
render-historical:
    uv run python scripts/render_historical.py

# Full publish build: render latest + historical
publish:
    uv run quarto render
    uv run python scripts/render_historical.py

# Daily CI workflow: fetch yesterday's data + publish
daily: fetch publish

# Clean build artifacts
clean:
    rm -rf _site _freeze .quarto
