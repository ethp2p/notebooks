# Ethereum P2P Observatory

Real-time insights into Ethereum's peer-to-peer layer. Tracking blob propagation, node connectivity, and network health across mainnet.

## Quickstart

```bash
# Install dependencies
just install

# Create .env with ClickHouse credentials
cat > .env << 'EOF'
CLICKHOUSE_HOST=your-host
CLICKHOUSE_PORT=8443
CLICKHOUSE_USER=your-user
CLICKHOUSE_PASSWORD=your-password
EOF

# Fetch yesterday's data
just fetch

# Render notebooks and build site
just publish

# Start dev server
just dev
```

## Notebooks

| Notebook                                                    | Description                                       |
| ----------------------------------------------------------- | ------------------------------------------------- |
| [Blob Inclusion](notebooks/01-blob-inclusion.ipynb)         | Blob inclusion patterns per block and epoch       |
| [Blob Flow](notebooks/02-blob-flow.ipynb)                   | Blob flow across validators, builders, and relays |
| [Column Propagation](notebooks/03-column-propagation.ipynb) | Column propagation timing across 128 data columns |

## Architecture

```
pipeline.yaml              # Central config: dates, queries, notebooks
queries/                   # ClickHouse query modules -> Parquet
├── blob_inclusion.py      # fetch_blobs_per_slot(), fetch_blocks_blob_epoch(), ...
├── blob_flow.py           # fetch_blob_flow()
└── column_propagation.py  # fetch_col_first_seen()
scripts/
├── pipeline.py            # Coordinator: config loading, hash computation, staleness
├── fetch_data.py          # CLI: ClickHouse -> notebooks/data/*.parquet
└── render_notebooks.py    # CLI: .ipynb -> site/rendered/*.html
notebooks/
├── *.ipynb                # Jupyter notebooks (Plotly visualizations)
├── loaders.py             # load_parquet() utility
├── templates/             # nbconvert HTML templates
└── data/                  # Parquet cache + manifest.json (gitignored)
site/                      # Astro static site
├── rendered/              # Pre-rendered HTML + manifest.json (gitignored)
└── src/                   # Pages, components, styles
```

### Data Flow

```
ClickHouse ──[fetch_data.py]──> Parquet files ──[render_notebooks.py]──> HTML ──[Astro]──> Static site
                                     │
                                     └── Cached in GitHub Actions (CI)
                                         or notebooks/data/ (local dev)
```

### Pipeline Configuration

All configuration is centralized in `pipeline.yaml`:

```yaml
# Date range (rolling window, explicit range, or list)
dates:
  mode: rolling
  rolling:
    window: 14

# Query registry with module paths
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

### Staleness Detection

The pipeline tracks query source code hashes to detect when queries change:

```bash
# Check for stale data
just check-stale

# Fetch handles missing + stale automatically
just fetch

# View current query hashes
just show-hashes
```

## Commands

```bash
# Development
just dev              # Start Astro dev server
just install          # Install all dependencies

# Data Pipeline
just fetch               # Fetch all data (missing + stale)
just fetch 2025-12-15    # Fetch specific date

# Staleness
just check-stale         # Report stale data
just show-dates          # Show resolved date range
just show-hashes         # Show query hashes

# Rendering
just render              # Render all dates (cached)
just render latest       # Render latest date only
just render 2025-12-15   # Render specific date

# Build
just build               # Build Astro site
just publish             # render + build
just sync                # Full pipeline: fetch + render + build
```

## CI/CD

Single unified workflow (`sync.yml`) handles everything:

- **Schedule**: Daily at 1am UTC - fetches data, renders notebooks, deploys
- **Push to main**: Full sync and deploy to production
- **Pull requests**: Preview deploy to staging

Data and rendered outputs are cached in GitHub Actions cache (keyed by query/notebook hashes and date) to avoid redundant work.

### R2 Deployment

Site is deployed to Cloudflare R2 with content-addressed storage (site is ~1.3GB with rendered Plotly notebooks, exceeds Cloudflare Pages 25MB limit).

**Architecture:**
- Blobs stored at `blobs/{sha256-hash}.{ext}` (immutable, cached forever)
- Manifests at `manifests/{name}.json` map paths to blob hashes
- Cloudflare Worker resolves requests to blobs

**Domains:**
- Production: `observatory.ethp2p.dev` (serves `main` manifest)
- PR previews: `observatory-staging.ethp2p.dev/pr-{number}/`

**Benefits:**
- Only uploads changed files (deduplication via SHA256)
- CSS change: ~1MB upload (just new asset blobs)
- New date: ~40MB upload (only new notebook renders)
- PR preview: Just manifest (~100KB) if content unchanged

## Development

### Fetching Data

```bash
# Fetch all data (missing + stale)
just fetch

# Fetch specific date
just fetch 2025-01-15

# Check what's stale
just check-stale
```

### Running Notebooks Locally

```bash
# Option 1: Jupyter Lab
uv run jupyter lab

# Option 2: VS Code with Jupyter extension
# Open any .ipynb file
```

### Building the Site

```bash
# Render notebooks + build Astro site
just publish

# Or step by step:
just render    # Render notebooks to HTML
just build     # Build Astro static site

# Preview the build
just preview
```

## Environment Variables

| Variable              | Description                            |
| --------------------- | -------------------------------------- |
| `CLICKHOUSE_HOST`     | ClickHouse server hostname             |
| `CLICKHOUSE_PORT`     | ClickHouse server port (default: 8443) |
| `CLICKHOUSE_USER`     | ClickHouse username                    |
| `CLICKHOUSE_PASSWORD` | ClickHouse password                    |

## Adding New Analyses

1. **Create query function** in `queries/`:

   ```python
   def fetch_my_data(client, target_date: str, output_path: Path, network: str) -> int:
       query = f"SELECT ... WHERE slot_start_date_time >= '{target_date}' ..."
       df = client.query_df(query)
       output_path.parent.mkdir(parents=True, exist_ok=True)
       df.to_parquet(output_path, index=False)
       return len(df)
   ```

2. **Register in `pipeline.yaml`**:

   ```yaml
   queries:
     my_data:
       module: queries.my_module
       function: fetch_my_data
       output_file: my_data.parquet

   notebooks:
     - id: my-analysis
       title: My Analysis
       icon: BarChart
       source: notebooks/04-my-analysis.ipynb
       queries: [my_data]
   ```

3. **Create notebook** `notebooks/04-my-analysis.ipynb`:
   - Add a cell tagged "parameters" with `target_date = None`
   - Use `loaders.load_parquet("my_data")` to load data
   - Create Plotly visualizations

4. **Fetch and render**:
   ```bash
   just fetch && just render && just build
   ```

## Package Managers

- **Python**: [uv](https://github.com/astral-sh/uv) - `uv sync`, `uv run python ...`
- **Node.js**: [pnpm](https://pnpm.io/) - used in `site/` directory
- **Task runner**: [just](https://github.com/casey/just) - see `justfile` for all commands
