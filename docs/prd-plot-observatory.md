# PRD: Plot-Centric Observatory

## Overview

Transform the Ethereum P2P Observatory from a notebook-centric static site to a plot-centric interactive application where users can browse categorized visualizations and compose custom dashboards.

## Problem Statement

The current observatory publishes pre-rendered Jupyter notebooks as static HTML. While this works well for curated analysis, it limits user agency:

- **No exploration**: Users can only view pre-defined notebook sequences
- **No composition**: Cannot combine plots from different notebooks
- **No interactivity**: Static renders lack cross-filtering and drill-down
- **No customization**: Everyone sees the same fixed views

Meanwhile, the development workflow (Jupyter) remains valuable for internal analysis and shouldn't be abandoned.

## Goals

1. **Browsable plot catalog**: Individual plots organized by category with search/filter
2. **User-composed dashboards**: Drag-and-drop composition of plots into custom views
3. **Client-side interactivity**: Cross-filtering, date range selection, drill-down
4. **Preserve development workflow**: Keep Jupyter for internal exploration
5. **Incremental migration**: Existing notebooks continue working during transition

## Non-Goals

- Real-time data (daily refresh is sufficient)
- User accounts or server-side persistence (client-side storage only)
- Automated Python-to-JS translation (manual conversion at publish time)
- Collaborative features (single-user dashboards)

---

## Architecture

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATA PIPELINE (unchanged)                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ClickHouse (Xatu)  ──►  Parquet files  ──►  R2/Static hosting         │
│                           /data/{date}/                                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌───────────────────────────────┐   ┌───────────────────────────────────┐
│   INTERNAL (Development)      │   │   PUBLIC (Production)             │
├───────────────────────────────┤   ├───────────────────────────────────┤
│                               │   │                                   │
│   Jupyter notebooks           │   │   Browser (Astro + React)         │
│   - Explore data              │   │   - DuckDB WASM                   │
│   - Prototype visualizations  │   │   - Plot rendering (JS)           │
│   - Ad-hoc analysis           │   │   - Dashboard composition         │
│                               │   │                                   │
│   Output: "Publish this plot" │   │   Loads Parquet via HTTP range    │
│                               │   │   requests (partial fetch)        │
└───────────────────────────────┘   └───────────────────────────────────┘
```

### Development → Publication Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. EXPLORE (Jupyter)                                                    │
│    - Load Parquet with existing loaders.py                              │
│    - Prototype visualization with Plotly/Altair                         │
│    - Iterate until useful insight found                                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. TRANSLATE (Manual)                                                   │
│    - Convert Pandas transforms to SQL                                   │
│    - Rewrite chart in JS (Plotly.js or Observable Plot)                 │
│    - Define metadata (category, tags, description)                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. REGISTER (Configuration)                                             │
│    - Add plot to registry (pipeline.yaml or plots/*.ts)                 │
│    - Specify data dependencies (which Parquet files)                    │
│    - Assign category and tags                                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. DEPLOY                                                               │
│    - Plot appears in catalog automatically                              │
│    - Available for dashboard composition                                │
│    - No build step required for plot changes                            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Technical Design

### Client-Side Data Layer

**DuckDB WASM** handles all data operations in the browser:

```typescript
// site/src/lib/data.ts

import * as duckdb from '@duckdb-wasm';

class DataLayer {
  private db: duckdb.AsyncDuckDB;
  private conn: duckdb.AsyncDuckDBConnection;

  async init(): Promise<void> {
    // Initialize DuckDB WASM (~3MB bundle)
    const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);
    const worker = new Worker(bundle.mainWorker);
    const logger = new duckdb.ConsoleLogger();
    this.db = new duckdb.AsyncDuckDB(logger, worker);
    await this.db.instantiate(bundle.mainModule);
    this.conn = await this.db.connect();
  }

  async query(sql: string): Promise<arrow.Table> {
    return await this.conn.query(sql);
  }

  // Convenience: query remote Parquet with partial fetch
  async queryParquet(
    date: string,
    file: string,
    sql: string
  ): Promise<arrow.Table> {
    const url = `${DATA_BASE_URL}/${date}/${file}`;
    const fullSql = sql.replace('$TABLE', `read_parquet('${url}')`);
    return await this.conn.query(fullSql);
  }
}

export const dataLayer = new DataLayer();
```

**Key capability**: DuckDB uses HTTP range requests to fetch only needed columns and row groups from remote Parquet files, avoiding full file downloads.

### Plot Registry

Plots are registered as TypeScript modules with metadata and render functions:

```typescript
// site/src/plots/registry.ts

export interface PlotDefinition {
  id: string;
  title: string;
  description: string;
  category: CategoryId;
  tags: string[];

  // Data dependencies
  queries: QueryDefinition[];

  // Render function
  render: (data: arrow.Table[], container: HTMLElement, options?: PlotOptions) => void;
}

export interface QueryDefinition {
  file: string;      // Parquet filename
  sql: string;       // SQL to run against the file
}

export interface PlotOptions {
  date: string;
  width?: number;
  height?: number;
  interactive?: boolean;
}
```

**Example plot definition:**

```typescript
// site/src/plots/blob-count-scatter.ts

import * as Plot from '@observablehq/plot';
import type { PlotDefinition } from './registry';

export const blobCountScatter: PlotDefinition = {
  id: 'blob-count-scatter',
  title: 'Blob Count Over Time',
  description: 'Scatter plot showing blob counts per slot throughout the day',
  category: 'blob-analysis',
  tags: ['blobs', 'time-series', 'scatter'],

  queries: [{
    file: 'blobs_per_slot.parquet',
    sql: `
      SELECT
        slot,
        slot_start_date_time as time,
        blob_count
      FROM $TABLE
      ORDER BY slot
    `
  }],

  render(data, container, options) {
    const [blobs] = data;

    const plot = Plot.plot({
      width: options?.width ?? 800,
      height: options?.height ?? 400,
      color: { scheme: 'plasma' },
      marks: [
        Plot.dot(blobs, {
          x: 'time',
          y: 'blob_count',
          fill: 'blob_count',
          opacity: 0.7,
          tip: true
        })
      ]
    });

    container.replaceChildren(plot);
  }
};
```

### Category System

```typescript
// site/src/plots/categories.ts

export interface Category {
  id: string;
  title: string;
  description: string;
  icon: string;  // Lucide icon name
}

export const categories: Category[] = [
  {
    id: 'blob-analysis',
    title: 'Blob Analysis',
    description: 'Blob inclusion, propagation, and distribution metrics',
    icon: 'Layers'
  },
  {
    id: 'mev',
    title: 'MEV Pipeline',
    description: 'MEV bidding, relay performance, and builder behavior',
    icon: 'Zap'
  },
  {
    id: 'network',
    title: 'Network Health',
    description: 'Propagation timing, missed slots, and network coverage',
    icon: 'Activity'
  },
  {
    id: 'mempool',
    title: 'Mempool',
    description: 'Transaction visibility and mempool coverage',
    icon: 'Eye'
  }
];
```

### Dashboard Composition

User-created dashboards are stored in localStorage:

```typescript
// site/src/lib/dashboards.ts

export interface Dashboard {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  items: DashboardItem[];
}

export interface DashboardItem {
  plotId: string;
  date: string;        // Which date's data to show
  position: GridPosition;
}

export interface GridPosition {
  x: number;      // Grid column (0-11)
  y: number;      // Grid row
  width: number;  // Columns to span (1-12)
  height: number; // Row height units
}

// localStorage-based persistence
export const dashboardStore = {
  list(): Dashboard[] {
    const data = localStorage.getItem('observatory:dashboards');
    return data ? JSON.parse(data) : [];
  },

  get(id: string): Dashboard | null {
    return this.list().find(d => d.id === id) ?? null;
  },

  save(dashboard: Dashboard): void {
    const dashboards = this.list().filter(d => d.id !== dashboard.id);
    dashboards.push({ ...dashboard, updatedAt: new Date().toISOString() });
    localStorage.setItem('observatory:dashboards', JSON.stringify(dashboards));
  },

  delete(id: string): void {
    const dashboards = this.list().filter(d => d.id !== id);
    localStorage.setItem('observatory:dashboards', JSON.stringify(dashboards));
  }
};
```

---

## URL Structure

```
/                           # Home: featured plots + category overview
/browse                     # Full plot catalog with filters
/browse?category=mev        # Filtered by category
/browse?tag=sankey          # Filtered by tag
/browse?q=blob              # Search

/plot/{id}                  # Single plot detail view
/plot/{id}?date=2025-01-17  # Plot with specific date

/dashboard                  # List user's dashboards
/dashboard/new              # Create new dashboard
/dashboard/{id}             # View/edit dashboard
/dashboard/{id}/edit        # Edit mode

# Legacy support (redirect to new structure)
/latest/{notebook-id}       # Redirect to /browse?collection={id}
/{year}/{month}/{day}/{id}  # Redirect to /plot/{id}?date={date}
```

---

## UI Components

### Plot Catalog (`/browse`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Search plots...                                          [🔍]   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Categories: [All] [Blob Analysis] [MEV] [Network] [Mempool]            │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│  │ ░░░░░░░░░░░░░░░ │  │ ░░░░░░░░░░░░░░░ │  │ ░░░░░░░░░░░░░░░ │          │
│  │ ░░ thumbnail ░░ │  │ ░░ thumbnail ░░ │  │ ░░ thumbnail ░░ │          │
│  │ ░░░░░░░░░░░░░░░ │  │ ░░░░░░░░░░░░░░░ │  │ ░░░░░░░░░░░░░░░ │          │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤          │
│  │ Blob Count      │  │ Builder Flow    │  │ Column Spread   │          │
│  │ ───────────     │  │ ────────────    │  │ ─────────────   │          │
│  │ Scatter plot... │  │ Sankey diagram..│  │ Histogram...    │          │
│  │                 │  │                 │  │                 │          │
│  │ [blob] [scatter]│  │ [mev] [sankey]  │  │ [network]       │          │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘          │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│  │      ...        │  │      ...        │  │      ...        │          │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Plot Detail (`/plot/{id}`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Back to catalog                                    [Add to Dashboard]│
│                                                                          │
│  Blob Count Over Time                                                    │
│  ════════════════════                                                    │
│  Scatter plot showing blob counts per slot throughout the day            │
│                                                                          │
│  Date: [◄] 2025-01-17 [►]                                               │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                                                                   │   │
│  │                                                                   │   │
│  │                        [ Interactive Plot ]                       │   │
│  │                                                                   │   │
│  │                                                                   │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Category: Blob Analysis                                                 │
│  Tags: blobs, time-series, scatter                                       │
│                                                                          │
│  ┌─ SQL Query ──────────────────────────────────────────────────────┐   │
│  │  SELECT slot, slot_start_date_time as time, blob_count           │   │
│  │  FROM blobs_per_slot.parquet                                     │   │
│  │  ORDER BY slot                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Dashboard Editor (`/dashboard/{id}/edit`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  My Dashboard                                        [Save] [Preview]   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                                                                  │    │
│  │   ┌─────────────────────────┐  ┌─────────────────────────┐      │    │
│  │   │                         │  │                         │      │    │
│  │   │   Blob Count Scatter    │  │   Builder Relay Sankey  │      │    │
│  │   │   [date picker]    [x]  │  │   [date picker]    [x]  │      │    │
│  │   │                         │  │                         │      │    │
│  │   │      [ plot ]           │  │      [ plot ]           │      │    │
│  │   │                         │  │                         │      │    │
│  │   └───────────────┬─────────┘  └─────────────────────────┘      │    │
│  │                   │ drag to resize                               │    │
│  │   ┌───────────────┴──────────────────────────────────────┐      │    │
│  │   │                                                      │      │    │
│  │   │   Column Propagation Heatmap                         │      │    │
│  │   │   [date picker]                                 [x]  │      │    │
│  │   │                                                      │      │    │
│  │   │                    [ plot ]                          │      │    │
│  │   │                                                      │      │    │
│  │   └──────────────────────────────────────────────────────┘      │    │
│  │                                                                  │    │
│  │   ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐      │    │
│  │   │  + Add plot                                          │      │    │
│  │   └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘      │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─ Available Plots ────────────────────────────────────────────────┐   │
│  │  [Blob Count] [Builder Flow] [Column Spread] [MEV Timeline] ...  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Migration Strategy

### Phase 1: Infrastructure

**Goal**: Add client-side data layer without changing existing site

- [ ] Add DuckDB WASM to site dependencies
- [ ] Create `DataLayer` class with Parquet querying
- [ ] Add plot registry types and structure
- [ ] Serve Parquet files via R2 (already happening)

**Deliverable**: Can query Parquet files from browser console

### Phase 2: First Plots

**Goal**: Port 3-4 plots to validate the approach

- [ ] Port `blob-count-scatter` (simple scatter)
- [ ] Port `column-spread-histogram` (histogram)
- [ ] Port `blob-epoch-distribution` (stacked bar)
- [ ] Create `/plot/{id}` page with date navigation

**Deliverable**: Individual plots viewable at new URLs

### Phase 3: Catalog

**Goal**: Browsable plot catalog

- [ ] Define category system
- [ ] Create `/browse` page with filtering
- [ ] Add search functionality
- [ ] Generate plot thumbnails (optional: static fallback images)

**Deliverable**: Users can browse and filter plots

### Phase 4: Dashboards

**Goal**: User-composed dashboards

- [ ] Create dashboard data model and localStorage persistence
- [ ] Build dashboard viewer component
- [ ] Build dashboard editor with drag-and-drop grid
- [ ] Add "Add to Dashboard" action from plot detail

**Deliverable**: Users can create and save custom dashboards

### Phase 5: Polish & Migration

**Goal**: Complete transition

- [ ] Port remaining plots from notebooks
- [ ] Add legacy URL redirects
- [ ] Remove notebook rendering pipeline (optional: keep for dev)
- [ ] Performance optimization (prefetching, caching)

**Deliverable**: Full plot-centric observatory

---

## Technical Decisions

### Why DuckDB WASM?

| Requirement | DuckDB WASM |
|-------------|-------------|
| Partial Parquet fetch | Yes (HTTP range requests) |
| SQL interface | Full SQL support |
| Performance | Near-native via WASM |
| Bundle size | ~3MB (acceptable) |
| Arrow integration | Native Arrow output |

Alternatives considered:
- **Arquero**: No partial fetch, requires full download
- **Danfo.js**: No partial fetch, larger bundle
- **Raw Arrow JS**: Low-level, would need to build query layer

### Why Observable Plot over Plotly.js?

| Aspect | Observable Plot | Plotly.js |
|--------|-----------------|-----------|
| Bundle size | ~50KB | ~3MB |
| API style | Declarative, composable | Imperative |
| Customization | CSS-based | Config objects |
| Interactivity | Basic (zoom, tooltip) | Rich (but heavy) |

**Decision**: Use Observable Plot for most charts, Plotly.js only for complex visualizations (Sankey diagrams, 3D plots) that Observable Plot doesn't support.

### Why localStorage over server-side?

- No auth system needed
- No backend to maintain
- Instant save/load
- Privacy (data stays local)
- Sufficient for single-user dashboards

**Limitation**: Dashboards don't sync across devices. Acceptable for MVP; could add export/import JSON for sharing.

---

## Data Requirements

### Parquet File Serving

Files must be served with:
- `Accept-Ranges: bytes` header (for partial fetch)
- Appropriate CORS headers
- Reasonable cache headers (data changes daily)

Current R2 setup should work; verify range request support.

### File Size Budget

| File | Typical Size | Partial Fetch Benefit |
|------|--------------|----------------------|
| `blobs_per_slot.parquet` | ~100KB | Low (small file) |
| `col_first_seen.parquet` | ~3MB | High (128 columns, fetch few) |
| `block_production_timeline.parquet` | ~500KB | Medium |

DuckDB will fetch only needed columns. For `col_first_seen`, a query selecting 3 columns might fetch ~100KB instead of 3MB.

---

## Open Questions

### 1. Thumbnail Generation

Options:
- **A**: Generate static PNG thumbnails at build time (Python/Playwright)
- **B**: Render thumbnails client-side on first load, cache in localStorage
- **C**: No thumbnails, use placeholder icons

**Recommendation**: Start with (C), add (B) later if needed.

### 2. Complex Visualizations

Some plots have complex logic (Sankey node positioning). Options:
- **A**: Port algorithm to JS
- **B**: Pre-compute positions in Python, store in Parquet
- **C**: Use Plotly.js which handles positioning automatically

**Recommendation**: (C) for Sankey; (A) for custom algorithms if needed.

### 3. Date Range Selection

Current: Single date with prev/next navigation
Future: Multi-date comparison, date range aggregation

**Recommendation**: Keep single-date for MVP. Date range is a future enhancement that would require query changes.

### 4. Offline Support

Could cache Parquet files in browser for offline viewing.

**Recommendation**: Out of scope for MVP. Add via Service Worker later if needed.

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Time to first plot render | < 3s (including WASM init) |
| Plot catalog load time | < 1s |
| Dashboard save/load | < 100ms |
| Parquet partial fetch efficiency | < 50% of full file for typical queries |
| Bundle size (JS) | < 500KB (excluding DuckDB WASM) |

---

## Appendix: Example Plot Translations

### Simple Scatter (Jupyter → JS)

**Jupyter (exploration):**
```python
df = load_parquet("blobs_per_slot", target_date)

fig = px.scatter(
    df,
    x="slot_start_date_time",
    y="blob_count",
    color="blob_count",
    color_continuous_scale="Plasma",
)
fig.show()
```

**JS (production):**
```typescript
const blobCountScatter: PlotDefinition = {
  id: 'blob-count-scatter',
  queries: [{
    file: 'blobs_per_slot.parquet',
    sql: 'SELECT slot_start_date_time as time, blob_count FROM $TABLE'
  }],

  render(data, container) {
    const plot = Plot.plot({
      color: { scheme: 'plasma' },
      marks: [
        Plot.dot(data[0], { x: 'time', y: 'blob_count', fill: 'blob_count' })
      ]
    });
    container.replaceChildren(plot);
  }
};
```

### Row-wise Normalization (Jupyter → JS)

**Jupyter:**
```python
col_names = [f"c{i}" for i in range(128)]
row_mins = df[col_names].min(axis=1)
row_maxs = df[col_names].max(axis=1)
df_normalized = (df[col_names].T - row_mins) / (row_maxs - row_mins)
```

**JS (SQL):**
```sql
WITH bounds AS (
  SELECT
    slot,
    MIN(value) OVER (PARTITION BY slot) as row_min,
    MAX(value) OVER (PARTITION BY slot) as row_max
  FROM (
    UNPIVOT col_first_seen
    ON c0, c1, c2, /* ... */ c127
    INTO NAME column_name VALUE value
  )
)
SELECT
  slot,
  column_name,
  (value - row_min) / NULLIF(row_max - row_min, 0) as normalized
FROM bounds
```

More complex, but DuckDB handles it efficiently.

---

## References

- [DuckDB WASM Documentation](https://duckdb.org/docs/api/wasm/overview)
- [Observable Plot](https://observablehq.com/plot/)
- [Parquet Format Specification](https://parquet.apache.org/docs/file-format/)
- [Apache Arrow JS](https://arrow.apache.org/docs/js/)
