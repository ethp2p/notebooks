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
- Declarative plot specs or codegen (manual translation is sufficient)

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

### Self-Contained Plot Files

Each plot is a single `.astro` file containing everything: markup, query, rendering logic, and styles. No separate registry or TypeScript modules needed.

```
site/src/pages/plot/
├── blob-count-scatter.astro      # Self-contained plot
├── builder-relay-sankey.astro    # Self-contained plot
├── column-propagation.astro      # Self-contained plot
├── column-spread.astro           # Self-contained plot
└── ...
```

**Example plot file:**

```astro
---
// site/src/pages/plot/blob-count-scatter.astro
import BaseLayout from '@/layouts/BaseLayout.astro';

const date = Astro.params.date ?? '2025-01-17';
const parquetUrl = `${import.meta.env.PUBLIC_DATA_URL}/${date}/blobs_per_slot.parquet`;
---

<BaseLayout title="Blob Count Over Time">
  <article>
    <h1>Blob Count Over Time</h1>
    <p>Scatter plot showing blob counts per slot throughout the day.</p>

    <figure id="plot" data-url={parquetUrl} data-date={date}></figure>

    <footer>
      <span class="category">Blob Analysis</span>
      <span class="tags">blobs, time-series, scatter</span>
    </footer>
  </article>
</BaseLayout>

<script>
  import * as Plot from '@observablehq/plot';
  import { dataLayer } from '@/lib/data';

  const container = document.getElementById('plot')!;
  const url = container.dataset.url!;

  async function render() {
    container.innerHTML = '<div class="loading">Loading...</div>';

    try {
      const result = await dataLayer.query(`
        SELECT
          slot,
          slot_start_date_time as time,
          blob_count
        FROM read_parquet('${url}')
        ORDER BY slot
      `);

      const plot = Plot.plot({
        width: container.clientWidth,
        height: 400,
        color: { scheme: 'plasma', legend: true },
        marks: [
          Plot.dot(result.toArray(), {
            x: 'time',
            y: 'blob_count',
            fill: 'blob_count',
            opacity: 0.7,
            tip: true
          })
        ]
      });

      container.replaceChildren(plot);
    } catch (err) {
      container.innerHTML = `<div class="error">Failed to load: ${err.message}</div>`;
    }
  }

  render();
</script>

<style>
  figure {
    width: 100%;
    min-height: 400px;
    margin: 2rem 0;
  }
  .loading, .error {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 400px;
  }
  .error { color: var(--color-error); }
</style>
```

**Why self-contained files?**

- Everything about a plot is in one place
- No indirection through registries or type definitions
- Easy to understand, copy, and modify
- Astro bundles the `<script>` automatically
- Natural code-splitting (each plot loads only what it needs)

### Passing Data from Frontmatter to Script

Astro's `<script>` tags are bundled separately and can't directly access frontmatter variables. Use data attributes:

```astro
---
const date = '2025-01-17';
const url = `https://data.example.com/${date}/file.parquet`;
---

<!-- Pass via data attributes -->
<div id="plot" data-date={date} data-url={url}></div>

<script>
  // Read from DOM
  const container = document.getElementById('plot')!;
  const { date, url } = container.dataset;
</script>
```

### Client-Side Data Layer with OPFS Caching

**DuckDB WASM** handles all data operations. **OPFS (Origin Private File System)** provides persistent caching of Parquet files across browser sessions.

```typescript
// site/src/lib/data.ts
import * as duckdb from '@duckdb/duckdb-wasm';

const DATA_BASE_URL = import.meta.env.PUBLIC_DATA_URL;

class DataLayer {
  private db: duckdb.AsyncDuckDB | null = null;
  private conn: duckdb.AsyncDuckDBConnection | null = null;
  private initPromise: Promise<void> | null = null;
  private registeredFiles = new Map<string, boolean>();

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(BUNDLES);

      const worker = new Worker(bundle.mainWorker!);
      const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);

      this.db = new duckdb.AsyncDuckDB(logger, worker);
      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);

      // Persist DuckDB database in OPFS
      await this.db.open({ path: 'opfs://observatory.db' });
      this.conn = await this.db.connect();
    })();

    return this.initPromise;
  }

  async query(sql: string): Promise<arrow.Table> {
    await this.init();
    return await this.conn!.query(sql);
  }

  /**
   * Ensure Parquet file is cached in OPFS, then query it
   */
  async queryParquet(date: string, filename: string, sql: string): Promise<arrow.Table> {
    const opfsUri = await this.ensureParquet(date, filename);
    const fullSql = sql.replace('$TABLE', `'${opfsUri}'`);
    return await this.query(fullSql);
  }

  /**
   * Cache Parquet file in OPFS if not already present
   */
  private async ensureParquet(date: string, filename: string): Promise<string> {
    await this.init();

    const opfsPath = `${date}/${filename}`;
    const opfsUri = `opfs://${opfsPath}`;

    if (this.registeredFiles.has(opfsPath)) {
      return opfsUri;
    }

    const cached = await this.existsInOpfs(opfsPath);

    if (!cached) {
      const url = `${DATA_BASE_URL}/${date}/${filename}`;
      await this.fetchToOpfs(url, opfsPath);
    }

    const handle = await this.getOpfsHandle(opfsPath);
    await this.db!.registerFileHandle(
      opfsPath,
      handle,
      duckdb.DuckDBDataProtocol.BROWSER_FSACCESS,
      true
    );

    this.registeredFiles.set(opfsPath, true);
    return opfsUri;
  }

  private async existsInOpfs(path: string): Promise<boolean> {
    try {
      const root = await navigator.storage.getDirectory();
      const parts = path.split('/');
      let dir = root;
      for (const part of parts.slice(0, -1)) {
        dir = await dir.getDirectoryHandle(part);
      }
      await dir.getFileHandle(parts.at(-1)!);
      return true;
    } catch {
      return false;
    }
  }

  private async fetchToOpfs(url: string, opfsPath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}`);
    const data = await response.arrayBuffer();

    const root = await navigator.storage.getDirectory();
    const parts = opfsPath.split('/');
    let dir = root;

    for (const part of parts.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }

    const fileHandle = await dir.getFileHandle(parts.at(-1)!, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  private async getOpfsHandle(path: string): Promise<FileSystemFileHandle> {
    const root = await navigator.storage.getDirectory();
    const parts = path.split('/');
    let dir = root;
    for (const part of parts.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(part);
    }
    return dir.getFileHandle(parts.at(-1)!);
  }

  async clearCache(): Promise<void> {
    const root = await navigator.storage.getDirectory();
    for await (const [name] of root.entries()) {
      await root.removeEntry(name, { recursive: true });
    }
    this.registeredFiles.clear();
  }
}

export const dataLayer = new DataLayer();
```

### Caching Layers

| Layer | What's Cached | Persistence | Benefit |
|-------|---------------|-------------|---------|
| **Browser HTTP** | Parquet byte ranges | Session/disk | Partial fetch on cache miss |
| **DuckDB Buffer** | Decoded Arrow data | Memory | Fast repeat queries |
| **OPFS** | Full Parquet files | Persistent | Instant load on return visit |

**Performance comparison:**

| Scenario | Load Time |
|----------|-----------|
| First visit (network) | ~500ms |
| Same session (DuckDB buffer) | ~10ms |
| Return visit (OPFS) | ~5ms |

### Cache Invalidation

Data refreshes daily. Use TTL-based invalidation:

```typescript
private async ensureParquet(date: string, filename: string): Promise<string> {
  const cacheKey = `${date}/${filename}`;
  const metaKey = `opfs-meta:${cacheKey}`;

  const meta = JSON.parse(localStorage.getItem(metaKey) || 'null');
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  const isStale = !meta || (Date.now() - meta.cachedAt > maxAge);

  if (isStale || !(await this.existsInOpfs(cacheKey))) {
    await this.fetchToOpfs(url, cacheKey);
    localStorage.setItem(metaKey, JSON.stringify({ cachedAt: Date.now() }));
  }

  // ... register with DuckDB
}
```

### OPFS Browser Support

OPFS is supported in Chrome 86+, Firefox 111+, Safari 15.2+. Feature detect:

```typescript
const hasOpfs = 'storage' in navigator && 'getDirectory' in navigator.storage;

if (hasOpfs) {
  // Use OPFS caching
} else {
  // Fall back to direct HTTP range requests
}
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

### Why Self-Contained Astro Files?

| Aspect | Separate Registry | Self-Contained `.astro` |
|--------|-------------------|-------------------------|
| Discoverability | Registry file | File system |
| Complexity | Types + registry + component | Single file |
| Code splitting | Manual | Automatic per-page |
| Modification | Multiple files | One file |

**Decision**: Each plot is a single `.astro` file. The catalog discovers plots by scanning `site/src/pages/plot/*.astro` at build time (using Astro's `import.meta.glob`).

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

### Why OPFS for Caching?

| Storage | Max Size | Speed | Persistence | Use Case |
|---------|----------|-------|-------------|----------|
| localStorage | 5-10MB | Fast | Persistent | Metadata only |
| IndexedDB | Large | Medium | Persistent | Structured data |
| **OPFS** | Large | **Fast** | Persistent | **Binary files (Parquet)** |
| Cache API | Large | Fast | Persistent | HTTP responses |

**Decision**: Use OPFS for Parquet file caching. DuckDB WASM can read directly from OPFS via `opfs://` protocol, avoiding serialization overhead.

**Fallback**: For browsers without OPFS, fall back to direct HTTP range requests (still works, just no persistent cache).

### Why Observable Plot over Plotly.js?

| Aspect | Observable Plot | Plotly.js |
|--------|-----------------|-----------|
| Bundle size | ~50KB | ~3MB |
| API style | Declarative, composable | Imperative |
| Customization | CSS-based | Config objects |
| Interactivity | Basic (zoom, tooltip) | Rich (but heavy) |

**Decision**: Use Observable Plot for most charts, Plotly.js only for complex visualizations (Sankey diagrams, heatmaps) that Observable Plot doesn't support well.

### Why localStorage for Dashboards?

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

### 4. Plot Metadata for Catalog

With self-contained `.astro` files, how does the catalog know each plot's title, category, and tags?

Options:
- **A**: Parse frontmatter from `.astro` files at build time
- **B**: Separate `plots.json` manifest (duplication)
- **C**: Encode in filename/directory structure (`plot/blob-analysis/count-scatter.astro`)

**Recommendation**: (A) — Use a build script or Astro integration to extract metadata from each plot file. Store result in a generated `plots-manifest.json` for the catalog to consume.

### 5. OPFS Storage Limits

OPFS shares quota with other storage APIs. With 365 days × ~10MB/day = ~3.6GB potential.

Options:
- **A**: Cache only recent N days (e.g., 14 days)
- **B**: LRU eviction when approaching quota
- **C**: Let user manage via "Clear Cache" button

**Recommendation**: (A) + (C) — Cache recent 14 days automatically, provide manual clear option.

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

### Simple Scatter (Jupyter → Astro)

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

**Astro (production):**
```astro
---
// site/src/pages/plot/blob-count-scatter.astro
import BaseLayout from '@/layouts/BaseLayout.astro';
const date = Astro.params.date ?? '2025-01-17';
---

<BaseLayout title="Blob Count Over Time">
  <h1>Blob Count Over Time</h1>
  <figure id="plot" data-date={date}></figure>
</BaseLayout>

<script>
  import * as Plot from '@observablehq/plot';
  import { dataLayer } from '@/lib/data';

  const container = document.getElementById('plot')!;
  const date = container.dataset.date!;

  const result = await dataLayer.queryParquet(date, 'blobs_per_slot.parquet', `
    SELECT slot_start_date_time as time, blob_count FROM $TABLE
  `);

  const plot = Plot.plot({
    color: { scheme: 'plasma' },
    marks: [
      Plot.dot(result.toArray(), { x: 'time', y: 'blob_count', fill: 'blob_count' })
    ]
  });

  container.replaceChildren(plot);
</script>
```

### Row-wise Normalization (Jupyter → SQL)

**Jupyter:**
```python
col_names = [f"c{i}" for i in range(128)]
row_mins = df[col_names].min(axis=1)
row_maxs = df[col_names].max(axis=1)
df_normalized = (df[col_names].T - row_mins) / (row_maxs - row_mins)
```

**SQL in Astro:**
```astro
<script>
  // DuckDB SQL handles the transformation
  const result = await dataLayer.queryParquet(date, 'col_first_seen.parquet', `
    WITH unpivoted AS (
      UNPIVOT $TABLE
      ON ${Array.from({length: 128}, (_, i) => `c${i}`).join(', ')}
      INTO NAME column_idx VALUE value
    ),
    bounds AS (
      SELECT
        slot,
        column_idx,
        value,
        MIN(value) OVER (PARTITION BY slot) as row_min,
        MAX(value) OVER (PARTITION BY slot) as row_max
      FROM unpivoted
    )
    SELECT
      slot,
      column_idx,
      (value - row_min) / NULLIF(row_max - row_min, 0) as normalized
    FROM bounds
  `);
</script>
```

More verbose than Pandas, but DuckDB handles it efficiently and the transformation happens client-side.

---

## References

- [DuckDB WASM Documentation](https://duckdb.org/docs/api/wasm/overview)
- [DuckDB WASM OPFS Tests](https://github.com/duckdb/duckdb-wasm/blob/main/packages/duckdb-wasm/test/opfs.test.ts)
- [Origin Private File System (OPFS)](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)
- [Observable Plot](https://observablehq.com/plot/)
- [Parquet Format Specification](https://parquet.apache.org/docs/file-format/)
- [Apache Arrow JS](https://arrow.apache.org/docs/js/)
- [Astro Islands Architecture](https://docs.astro.build/en/concepts/islands/)
