# Ethereum P2P Networking Analyses

Networking-centric analysis of Ethereum mainnet, published as a [Quarto](https://quarto.org/) website.

## Quickstart

```bash
# Install dependencies
uv sync

# Create .env with ClickHouse credentials
cat > .env << 'EOF'
CLICKHOUSE_HOST=your-host
CLICKHOUSE_PORT=8443
CLICKHOUSE_USER=your-user
CLICKHOUSE_PASSWORD=your-password
EOF

# Fetch data for yesterday
uv run python scripts/fetch_data.py --output-dir notebooks/data

# Start dev server
quarto preview
```

## Notebooks

| Notebook                                                    | Description                                       |
| ----------------------------------------------------------- | ------------------------------------------------- |
| [01-blob-inclusion](notebooks/01-blob-inclusion.qmd)        | Blob inclusion patterns per block and epoch       |
| [02-blob-flow](notebooks/02-blob-flow.qmd)                  | Blob flow across validators, builders, and relays |
| [03-column-propagation](notebooks/03-column-propagation.qmd)| Column propagation timing across 128 data columns |
| [04-client-versions](notebooks/04-client-versions.qmd)      | Consensus client version distribution             |

## Architecture

```
.
├── _quarto.yml                # Quarto config
├── index.qmd                  # Home page
├── archive.qmd                # Archive page (generated)
├── queries/                   # Query layer (fetch + write to Parquet)
│   ├── blob_inclusion.py      # fetch_blobs_per_slot(), fetch_blocks_blob_epoch(), ...
│   ├── blob_flow.py           # fetch_proposer_blobs()
│   ├── column_propagation.py  # fetch_col_first_seen()
│   └── client_versions.py     # fetch_client_versions()
├── scripts/
│   ├── fetch_data.py          # CLI for data fetching
│   ├── generate_archive.py    # Generates archive.qmd for site
│   └── generate_historical_index.py
├── notebooks/
│   ├── loaders.py             # load_parquet()
│   ├── data/                  # Local data cache (gitignored)
│   └── *.qmd                  # Quarto notebooks (load + visualize)
└── _site/                     # Built output (gitignored)
```

### Data flow

```
ClickHouse  ──[fetch_data.py]──>  Parquet files  ──[notebooks]──>  Visualizations
                                      │
                                      └── Stored on `data` branch (CI)
                                          or `notebooks/data/` (local dev)
```

### CI/CD

Two GitHub Actions workflows:

1. **Fetch Daily Data** (`fetch-data.yml`)
   - Runs daily at 1am UTC
   - Fetches yesterday's data from ClickHouse
   - Commits Parquet files to `data` branch
   - Maintains 30-day rolling window

2. **Build and Deploy** (`build-book.yml`)
   - Triggers on push to `main` or after data fetch
   - Checks out `data` branch for Parquet files
   - Builds Quarto site (executes notebooks at build time)
   - Deploys to GitHub Pages

### Branches

| Branch     | Purpose                           |
| ---------- | --------------------------------- |
| `main`     | Source code, notebooks, queries   |
| `data`     | Parquet files + manifest.json     |
| `gh-pages` | Built static site (auto-deployed) |

## Development

### Fetching data

```bash
# Fetch yesterday's data (default)
uv run python scripts/fetch_data.py --output-dir notebooks/data

# Fetch specific date
uv run python scripts/fetch_data.py --date 2025-01-15 --output-dir notebooks/data

# Fetch with custom retention
uv run python scripts/fetch_data.py --output-dir notebooks/data --max-days 7
```

### Running notebooks locally

```bash
# Option 1: Jupyter Lab (from repo root)
uv run jupyter lab

# Option 2: VS Code with Quarto extension
# Install the Quarto extension and open any .qmd file
```

### Quarto development

```bash
# Start dev server with hot reload
quarto preview

# Build static HTML
quarto render

# Output is in _site/
```

### Rendering the static site

The CI workflow handles this, but to replicate locally:

```bash
# Build with execution (uses latest date from manifest)
quarto render

# Or specify a date
TARGET_DATE=2025-01-15 quarto render

# Serve locally to test
python -m http.server -d _site
```

## Environment variables

| Variable              | Description                                                              |
| --------------------- | ------------------------------------------------------------------------ |
| `CLICKHOUSE_HOST`     | ClickHouse server hostname                                               |
| `CLICKHOUSE_PORT`     | ClickHouse server port (default: 8443)                                   |
| `CLICKHOUSE_USER`     | ClickHouse username                                                      |
| `CLICKHOUSE_PASSWORD` | ClickHouse password                                                      |
| `DATA_ROOT`           | Override data directory (used by CI)                                     |
| `TARGET_DATE`         | Date for notebook execution (YYYY-MM-DD), defaults to latest in manifest |

## Adding new analyses

1. **Add query function** in `queries/`:
   ```python
   def fetch_my_data(client, target_date: str, output_path: Path, network: str = "mainnet") -> int:
       query = f"SELECT ... WHERE {_get_date_filter(target_date)}"
       df = client.query_df(query)
       output_path.parent.mkdir(parents=True, exist_ok=True)
       df.to_parquet(output_path, index=False)
       return len(df)
   ```

2. **Register in `scripts/fetch_data.py`**:
   ```python
   FETCHERS = [
       ...
       ("my_data", fetch_my_data),
   ]
   ```

3. **Create Quarto notebook** in `notebooks/`:
   ```markdown
   ---
   title: "My Analysis"
   ---

   ```{python}
   from loaders import load_parquet

   df = load_parquet("my_data")
   # Visualize...
   ```
   ```

4. **Add to site** in `_quarto.yml` navbar
