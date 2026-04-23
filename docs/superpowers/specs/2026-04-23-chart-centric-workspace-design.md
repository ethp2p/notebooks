# Chart-centric workspace redesign

Date: 2026-04-23
Status: Proposed
Owner: raul

## Overview

Redesign the Ethereum P2P Observatory site from a notebook-centric reader (each page is one pre-rendered Jupyter notebook for one date) into a chart-centric workspace where users compose arbitrary binary-tree layouts of panes, each pane showing one chart for one date. The existing three-stage data pipeline (ClickHouse query, intermediate storage, visualisation) is kept in spirit but the presentation layer is rewritten.

Today's atomic unit is a notebook (one HTML blob per notebook per date). Tomorrow's atomic unit is a chart (one JSON spec per chart per date, rendered client-side by Plotly.js inside a pane). Notebooks retire as both a user-facing concept and an authoring format.

## Goals

1. Users can split the main canvas into an arbitrarily deep binary tree of panes, opening any chart for any supported date in any cell.
2. Per-pane date is independent; a "last set date" cascades as the default for newly opened panes.
3. Workspaces are shareable via URL without a backend (state encodes to a single URL segment). Personal named layouts are saved in localStorage.
4. Charts are atomic (one visualisation per pane) but expose a "related charts" affordance that splits the pane and opens a related chart above or below in a single action.
5. Charts are discovered through a flat, topic-tagged catalog in a left sidebar plus Cmd-K. Sidebar is a long scrollable list with non-interactive topic section headers and multi-select topic filter pills at the top.
6. Mobile (< ~768px) collapses the pane tree to a single-visible-pane navigator; all panes remain reachable via a tab strip.
7. Chart versioning is a first-class concern: each chart carries an `active_from` / `active_to` date range; old URLs pointing to historical dates continue to resolve to the correct chart version.
8. Old notebook URLs (`/YYYY/MM/DD/{notebook_id}`, `/latest/{notebook_id}`) redirect to equivalent workspace URLs so external links do not rot.
9. Authoring stays in Python. Chart definitions are decorator-registered functions in topic-grouped modules; multiple charts per module are supported.
10. The codebase is reorganised into a single `observatory/` Python package. The `notebooks/` tree, `papermill`, `nbconvert`, `ipykernel`, and related infrastructure are deleted.

## Non-goals

- No live interactive re-parameterisation of a chart in the browser beyond changing its date (e.g. no in-pane filter sliders, no regime toggles). Charts are pre-built per date at CI time.
- No server-side rendering of charts. The only server-side code is the existing Cloudflare Worker, which continues to serve static blobs and a thin redirect layer.
- No backend persistence of workspaces. Sharing is URL-based; personal saves are localStorage-only.
- No migration to a declarative chart spec language (Vega-Lite). Plotly remains the figure model.
- No rewrite of the query layer's transport or storage format (stays Parquet).
- No new authentication, user accounts, or write APIs.

## High-level architecture

Three phases run at different times.

```
BUILD TIME                            RUNTIME (browser)
-----------                           -----------------
ClickHouse  --[fetch]-->  Parquet     /charts/registry.json   \
                             |        /charts/dates.json       \
                             v        /charts/{id}/manifest.json > React workspace
Python @chart  --[build]-->  JSON --> /charts/{id}/{date}.json / + Plotly.js
specs                                                         /
                                      (static files on R2, Worker serves them)
```

1. Data pipeline (Python, CI). `observatory/data/fetch.py` queries ClickHouse per configured date and writes `build/data/{date}/{query_id}.parquet`.
2. Chart build (Python, CI). `observatory/build.py` imports all `@chart`-registered builders, loads each chart's declared Parquet dependencies, calls `chart.build(data, date)` to produce a `plotly.graph_objects.Figure`, and writes `build/charts/{chart_id}/{date}.json` (Plotly `fig.to_dict()`, stripped to `data`/`layout`/`config`). Also emits `build/charts/registry.json`, `build/charts/dates.json`, and a `build/charts/{chart_id}/manifest.json` per chart.
3. Site build (Astro + React). Astro generates static pages for the landing, archive, about, and legacy redirect routes. The `/` and `/w/{encoded}` routes are backed by a single React island (the "workspace"). The island loads `registry.json` and `dates.json` on mount; each pane lazily fetches its manifest and per-date spec; Plotly.js renders the figure. The build copies `build/charts/**` into `site/dist/charts/**`.
4. Deploy. `scripts/upload_r2.py` (unchanged) content-addresses every file under `site/dist/` and uploads blobs to R2. The Cloudflare Worker resolves incoming paths via the updated manifest.

## Data model

### Workspace state

```ts
type WorkspaceState = {
  root: Node | null;
  focusedPaneId: string | null;
  defaultDate: string;
};

type Node = Split | Pane;

type Split = {
  kind: "split";
  id: string;
  orientation: "h" | "v";
  ratio: number;
  a: Node;
  b: Node;
};

type Pane = {
  kind: "pane";
  id: string;
  chartId: string;
  date: string;
};
```

Operations allowed on the state:

| Operation | Effect |
|---|---|
| Split pane (H or V, before or after) | Pane is replaced with a `Split` whose two children are the old pane and a new empty or chart-preloaded pane. Ratio defaults to 0.5. |
| Split-and-open related (up / down) | Same as Split V, but the new pane is preloaded with a user-chosen related chart. Always vertical (above / below). |
| Close pane | The pane is removed; its sibling is promoted to take the parent `Split`'s place. If the last pane is closed, `root` becomes `null`. |
| Focus pane | `focusedPaneId` is set. Sidebar and Cmd-K actions target the focused pane. |
| Resize | User drags the `react-mosaic-component` gutter; the owning `Split.ratio` updates. |
| Change chart in pane | `pane.chartId` is updated. Date is unchanged. |
| Change date in pane | `pane.date` is updated AND `defaultDate` is set to the same value. Other open panes are not retroactively affected. |
| Swap panes | Drag-drop (native to `react-mosaic-component`). Tree structure updates. |

### Registry (global, loaded once)

Path: `/charts/registry.json`. Loaded on workspace mount in parallel with `dates.json`.

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-04-23T10:00:00Z",
  "topics": [
    { "id": "block-propagation", "title": "Block propagation", "order": 9 },
    { "id": "blob-inclusion", "title": "Blob inclusion", "order": 1 }
  ],
  "charts": {
    "block-propagation-by-size": {
      "id": "block-propagation-by-size",
      "topic": "block-propagation",
      "title": "Block propagation by wire size",
      "description": "Timing vs wire size, MEV-classified",
      "related": ["block-propagation-by-region"],
      "order": 1,
      "active_from": "2025-12-03",
      "active_to": null
    }
  }
}
```

Size target: under 10 KB gzipped for ~40 charts. Drives sidebar, Cmd-K, related-chart menu, per-pane dropdown, and date-range filtering for the sidebar's "grayed-out" state.

### Global dates file (loaded once)

Path: `/charts/dates.json`. Loaded in parallel with the registry.

```json
{ "dates": ["2025-12-03", "2025-12-04", "2025-12-05", "2026-04-22"], "latest": "2026-04-22" }
```

Contains every date the site publishes. Charts' `active_from` / `active_to` sub-ranges are inferred against this list. Per-chart gaps (rare; a failed build for one date) are handled by the spec fetch 404 path, not encoded here.

### Per-chart manifest (loaded on first pane-open of a chart)

Path: `/charts/{chart_id}/manifest.json`. Fetched and memoised the first time any pane opens this chart.

```json
{
  "context_html": "<p>Block propagation time is the interval between a block's slot start and when it first arrives at distributed sentries...</p>"
}
```

Sole purpose: carry the date-invariant context card prose, pre-rendered from the author's markdown. Keeps the registry small.

### Per-(chart, date) spec (loaded per pane, per date)

Path: `/charts/{chart_id}/{date}.json`. Fetched when a pane renders a specific `(chart_id, date)` pair. Memoised in the Zustand store so multiple panes on the same `(chart_id, date)` share a single fetch.

```json
{ "data": [ /* Plotly traces */ ], "layout": { /* ... */ }, "config": { /* ... */ } }
```

Fetched spec is passed directly to `Plotly.react(paneDiv, spec.data, spec.layout, spec.config)`. No client-side post-processing of the spec.

## Repo layout

```
observatory/
├── __init__.py
├── config.py                   # pipeline.yaml loader, typed config dataclasses
├── data/
│   ├── __init__.py
│   ├── clickhouse.py           # Client, connection helpers
│   ├── fetch.py                # CLI: run queries per (query, date)
│   ├── manifest.py             # Data manifest read/write
│   ├── staleness.py            # Staleness detection
│   └── queries/
│       ├── __init__.py         # Registers @query, auto-imports submodules
│       ├── registry.py         # @query decorator + QUERY_REGISTRY
│       ├── blob_inclusion.py
│       ├── blob_flow.py
│       ├── column_propagation.py
│       ├── mempool_visibility.py
│       ├── block_production.py
│       └── block_propagation.py
├── charts/
│   ├── __init__.py             # Registers @chart, auto-imports submodules
│   ├── registry.py             # @chart decorator + CHART_REGISTRY + topic registration
│   ├── theme.py                # Plotly theme tokens (OKLCH-aligned palette, fonts)
│   ├── loaders.py              # Parquet loaders
│   ├── presets.py              # NOTEBOOK_PRESETS: old notebook_id -> [chart_id] for redirects
│   ├── context/                # Sidecar markdown for each chart's context card
│   │   └── {topic}/{chart}.md
│   ├── blob_inclusion.py
│   ├── blob_flow.py
│   ├── column_propagation.py
│   ├── mempool_visibility.py
│   ├── mev_pipeline.py
│   ├── block_column_timing.py
│   ├── propagation_anomalies.py
│   ├── missed_slots.py
│   └── block_propagation.py
└── build.py                    # CLI: emit registry.json, dates.json, per-chart manifests, per-(chart,date) specs

site/
├── src/
│   ├── pages/
│   │   ├── index.astro         # / flagship workspace (curated single pane at latest date)
│   │   ├── w.astro             # /w empty workspace landing
│   │   ├── w/
│   │   │   └── [state].astro   # /w/{encoded} restored workspace
│   │   ├── archive.astro       # Browseable dates/charts
│   │   ├── about.astro
│   │   └── legacy/
│   │       └── [...path].ts    # Redirects for /YYYY/MM/DD/{notebook} and /latest/{notebook}
│   ├── workspace/              # React island app
│   │   ├── Workspace.tsx
│   │   ├── components/
│   │   │   ├── PaneTree.tsx    # react-mosaic-component wrapper
│   │   │   ├── Pane.tsx
│   │   │   ├── PaneHeader.tsx
│   │   │   ├── ChartBody.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── CommandPalette.tsx
│   │   │   └── MobileNav.tsx
│   │   ├── state/
│   │   │   ├── store.ts        # Zustand: tree, focus, defaultDate, theme
│   │   │   ├── url.ts          # encode/decode WorkspaceState <-> URL segment
│   │   │   └── tree.ts         # Binary tree ops (split, close, focus, resize, swap)
│   │   ├── data/
│   │   │   ├── registry.ts     # Fetch & type registry.json
│   │   │   ├── dates.ts        # Fetch & type dates.json
│   │   │   ├── chartManifest.ts
│   │   │   ├── chartSpec.ts
│   │   │   └── plotly.ts       # Plotly.js bootstrap (single global bundle)
│   │   └── types.ts
│   ├── lib/                    # Site-wide utilities
│   ├── styles/
│   └── content/                # About, static markdown
├── public/                     # Favicon, fonts, static assets
└── astro.config.mjs

build/                          # Gitignored; regenerated at CI
├── data/{date}/{query_id}.parquet
└── charts/
    ├── registry.json
    ├── dates.json
    ├── .cache.json             # Incremental build cache: chart_hash + data_hash per (chart, date)
    ├── .failures.json          # Per-stage failure log
    └── {chart_id}/
        ├── manifest.json
        └── {date}.json

worker/                         # Cloudflare Worker (unchanged structure; adds a redirect rule)
├── src/index.ts
└── wrangler.toml

scripts/
└── upload_r2.py                # Content-addressed R2 upload (unchanged)

pipeline.yaml                   # dates + settings + parallelism only
pyproject.toml
package.json
justfile
README.md
CLAUDE.md
```

## Chart and query authoring

### @query decorator

Queries live in `observatory/data/queries/{topic}.py`. They are auto-imported at package init, which triggers registration. Each query is a "primary dataset" for an analytical domain; charts slice and aggregate from it.

```python
# observatory/data/queries/block_production.py
from pathlib import Path
from observatory.data.queries import query

@query(
    id="block_events",
    topic="block-production",
    database="default",
    description="Row-level block-production events for the day: slot, event_type, builder, proposer, region, wire_size, mev_flag.",
)
def fetch_block_events(client, date: str, output_path: Path) -> int:
    sql = f"""
    SELECT slot, event_type, builder_pubkey, proposer_pubkey, region,
           wire_size_bytes, is_mev
    FROM ...
    WHERE toDate(slot_start_date_time) = '{date}'
    """
    df = client.query_df(sql)
    df.to_parquet(output_path)
    return len(df)
```

Decorator stores the `QueryDef` in `QUERY_REGISTRY: dict[str, QueryDef]`. Staleness hash is the SHA-256 of the function's AST (docstrings and comments excluded), same algorithm as today.

### @chart decorator

Charts live in `observatory/charts/{topic}.py`. A single module may declare multiple charts that share helpers.

```python
# observatory/charts/block_propagation.py
from pathlib import Path
import plotly.graph_objects as go
from observatory.charts import chart, ChartData, apply_theme

CTX = Path(__file__).parent / "context" / "block_propagation"

@chart(
    id="block-propagation-by-size",
    topic="block-propagation",
    title="Block propagation by wire size",
    description="Timing vs wire size, MEV-classified",
    queries=["block_events"],
    related=["block-propagation-by-region"],
    context=CTX / "by_size.md",
    order=1,
    active_from="2025-12-03",
    active_to=None,
)
def build_by_size(data: ChartData, date: str) -> go.Figure:
    df = data["block_events"]
    df = df[df.event_type == "block_arrival"]
    # binning, MEV classification, figure construction
    fig = go.Figure(...)
    apply_theme(fig)
    return fig
```

Chart decorator fields:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | `str` | yes | Globally unique, slug-cased, stable. URLs depend on this. |
| `topic` | `str` | yes | Must be a registered topic. |
| `title` | `str` | yes | Human-readable pane title. |
| `description` | `str` | no | Short one-liner for catalog / Cmd-K. |
| `queries` | `list[str]` | yes | Query IDs this chart needs. Loaded and passed to `build()`. |
| `related` | `list[str]` | no | Chart IDs surfaced in the pane's "related" menu. |
| `context` | `Path \| str` | no | Path to a markdown file (preferred) or inline string. |
| `order` | `int` | no | Sort order within topic in the sidebar. Default: decorator application order. |
| `active_from` | `str` | yes | ISO YYYY-MM-DD; first date the chart is valid for. |
| `active_to` | `str \| None` | no | ISO YYYY-MM-DD; last valid date. `None` means currently active. |

Validation at build time:

- `active_to` must be `>=` `active_from` if set.
- Two charts with the same `id` must have non-overlapping `[active_from, active_to]` ranges (enables chart versioning with the same id across time).
- `related` IDs must exist in the registry.
- All `queries` IDs must be in `QUERY_REGISTRY`.
- All chart `topic`s must be registered.
- If violated, the build exits non-zero before emitting any files.

### Topic registration

```python
# observatory/charts/topics.py
register_topic(id="blob-inclusion", title="Blob inclusion", order=1)
register_topic(id="blob-flow", title="Blob flow", order=2)
register_topic(id="column-propagation", title="Column propagation", order=3)
register_topic(id="mempool-visibility", title="Mempool visibility", order=4)
register_topic(id="mev-pipeline", title="MEV pipeline", order=5)
register_topic(id="block-column-timing", title="Block / column timing", order=6)
register_topic(id="propagation-anomalies", title="Propagation anomalies", order=7)
register_topic(id="missed-slots", title="Missed slots", order=8)
register_topic(id="block-propagation", title="Block propagation", order=9)
```

### Context sidecar markdown

Context prose lives in `observatory/charts/context/{topic}/{chart_slug}.md`. Keeps the decorator calls compact and makes review diffs clean.

```markdown
# observatory/charts/context/block_propagation/by_size.md

Block propagation time is the interval between a block's slot start and
when it first arrives at distributed sentries. Larger blocks take longer,
but MEV-built blocks show a distinct pattern that reflects builder-side
delay before the block goes on the wire...
```

Rendered to HTML at build time via `markdown-it-py`. Embedded into the chart's `manifest.json` as `context_html`.

## Build pipeline

### Single entry point

```
just build
  -> observatory.build.main():
       1. Ensure data is fresh for configured dates (observatory.data.fetch)
       2. For each (chart, date) in active ranges, emit spec JSON
       3. Emit registry.json, dates.json, per-chart manifests
       4. Run astro build (which copies build/charts/** into site/dist/charts/**)
       5. Run scripts/upload_r2.py (unchanged; content-addressed upload)
```

Each stage is invokable independently for local iteration: `just fetch`, `just build-charts`, `just dev`.

### Chart spec build

```python
# observatory/build.py (sketch)
def build_charts(cfg: Config) -> BuildResult:
    failures: list[Failure] = []
    tasks: list[tuple[ChartDef, str]] = []
    for chart in CHART_REGISTRY.values():
        for date in dates_in_range(cfg.dates, chart.active_from, chart.active_to):
            if not needs_rebuild(chart, date, cfg.cache):
                continue
            tasks.append((chart, date))

    with ProcessPoolExecutor(max_workers=cfg.parallelism.build) as pool:
        futures = {pool.submit(_build_one, c.id, d): (c, d) for c, d in tasks}
        for fut in as_completed(futures):
            chart, date = futures[fut]
            try:
                fut.result()
            except Exception as exc:
                failures.append(Failure(chart.id, date, traceback.format_exc()))

    return BuildResult(built=len(tasks) - len(failures), failures=failures)
```

Per-task worker loads Parquet lazily via `functools.lru_cache(maxsize=max(len(chart.queries) for chart in CHART_REGISTRY.values()))` so multiple charts in the same process share loaded dataframes.

### Caching / incremental builds

Three inputs determine whether to rebuild a (chart, date):

1. Chart source hash: SHA-256 of the `build` function's AST plus the context markdown file plus the sorted query IDs list. Docstrings and comments excluded.
2. Data hash: SHA-256 over the concatenation of `{query_id}:{parquet_file_hash}` for each required query, in sorted order.
3. Force flag: `--force` on the CLI.

Stored in `build/charts/.cache.json`:

```json
{
  "block-propagation-by-size": {
    "chart_hash": "8a3f...",
    "dates": {
      "2026-04-22": { "data_hash": "2b91...", "generated_at": "2026-04-22T10:00:00Z" }
    }
  }
}
```

A (chart, date) rebuilds only if its chart_hash or data_hash differs from the cached value, or if the output file is missing, or if `--force` is set.

### Failure handling

`chart.build(...)` raises for one (chart, date):

- Exception and traceback are appended to `build/charts/.failures.json`.
- The build does not abort; other tasks continue.
- The output file is not written (so the runtime 404s gracefully and the pane shows "no data for this date").
- Build exits non-zero at the end if any task failed, so CI surfaces it.

### Parallelism configuration

```yaml
# pipeline.yaml
parallelism:
  fetch: 4   # concurrent ClickHouse queries (ThreadPoolExecutor, I/O-bound)
  build: 4   # concurrent chart builds (ProcessPoolExecutor, CPU-bound)
```

CLI overrides: `just fetch --workers 8`, `just build-charts --workers 8`. CLI wins over the YAML.

## Runtime data flow and rendering

### Fetches on workspace open

```
GET /w/{encoded-state}
  -> Astro serves the static shell with the workspace island
  -> Island mounts, fires in parallel:
       GET /charts/registry.json
       GET /charts/dates.json
  -> URL state is decoded into a WorkspaceState tree
  -> Each pane mounts, fires independently:
       GET /charts/{chart_id}/manifest.json   (memoised per chart_id)
       GET /charts/{chart_id}/{date}.json     (memoised per (chart_id, date))
```

Promises are memoised in the Zustand store; three panes on the same (chart_id, date) trigger one network fetch.

### Pane render lifecycle

Each pane is a self-contained React component. Registry is required before any pane renders (workspace shows a top-level skeleton while it loads). Once the registry is available:

- Header renders immediately (has title, topic, related list from the registry).
- Manifest fetch resolves -> context card renders.
- Spec fetch resolves -> Plotly figure renders. On subsequent date changes, `Plotly.react` diffs.

Slow or failed fetches in one pane never block another pane.

### Plotly lifecycle

Plotly.js is dynamically imported once at workspace mount. Each pane owns a `<div ref={paneDivRef}>` and calls `Plotly.react(paneDivRef.current, spec.data, spec.layout, spec.config)` on mount and whenever `spec` changes. `Plotly.purge(paneDivRef.current)` on unmount. Size changes (`react-mosaic` gutter drag) fire `Plotly.Plots.resize(paneDivRef.current)`, debounced at 16 ms.

### Dark mode

Theme toggle in the header flips a workspace-level `theme: "light" | "dark"` flag in the Zustand store. Panes subscribe; on change each pane calls `Plotly.relayout(paneDivRef.current, darkLayoutOverrides)` with the precomputed override object. No re-fetch.

### Error states (per pane)

| Situation | UI |
|---|---|
| `chartId` not in registry (stale URL) | "This chart no longer exists." + "Pick another" CTA. |
| Date outside chart's active range | "This chart doesn't cover {date}." + link to nearest available date in range. |
| Spec fetch 404 | "No data for this date." + prev/next date navigation. |
| Spec fetch network error | "Couldn't load chart." + retry button. |
| Plotly render throw | Error boundary: "Chart failed to render." + "Reload pane" button. |

## Workspace state and URL encoding

### URL scheme

- `/` serves a flagship workspace (single pane, curated chart id, latest date). Generated at Astro build time from `flagship_chart_id` in `pipeline.yaml`.
- `/w` serves an empty workspace landing with a "Pick a chart" CTA.
- `/w/{encoded}` restores a workspace from the encoded state.
- `/archive` is a separate static archive page (not state-encoded).
- `/about` static.

### Encoding scheme

Compact positional array, pre-order traversal, with chart-id and date interning tables stored at indices 0 and 1 of the outer array. Nodes are tagged by a single-character string.

Grammar:

```
w     := [charts, dates, ...tree]
charts := array<string>                 # distinct chart IDs referenced by panes
dates  := array<string>                 # distinct ISO dates referenced by panes
tree  := pane | split
pane  := ["p", chartIdx, dateIdx]
split := [orient, ratio10, tree, tree]
orient := "s" (horizontal) | "S" (vertical)
ratio10 := integer 0..100 (5% steps, stored as int to save bytes)
```

Example: three-pane layout with a vertical split on the left and a single pane on the right; two charts; two dates.

```json
[
  ["block-propagation-by-size", "blob-density-scatter"],
  ["2026-04-22", "2026-04-15"],
  ["s", 50,
    ["S", 60,
      ["p", 0, 0],
      ["p", 1, 0]
    ],
    ["p", 0, 1]
  ]
]
```

Encoded: `JSON.stringify(state)` -> gzip -> base64url. Single path segment at `/w/{encoded}`. Raw JSON ~130 bytes for this example; encoded ~80-100 chars. A dozen-pane workspace fits in a few hundred characters.

`defaultDate` is serialised as a top-level field alongside the tree (folded into the outer array as element 2, shifting the tree to element 3) so that shared URLs preserve the exact cascade behaviour the sharer experienced.

Long-URL fallback: if a user hits a "Copy link" action and the path-encoded URL exceeds 2 KB, the encoder switches to a hash-fragment encoding (`/w/#{encoded}`) which bypasses share-surface path-length limits.

### localStorage personal saves

Keyed under `observatory.workspaces`:

```json
{
  "version": 1,
  "saves": [
    { "name": "my blob comparison", "created_at": "2026-04-22T11:00:00Z", "state": { /* WorkspaceState */ } }
  ]
}
```

Actions: "Save current as...", "Load", "Rename", "Delete". Accessible from the workspace header menu and via Cmd-K.

### Validation on decode

- Unknown `chartId`: pane becomes an "unknown chart" placeholder with a pick-a-replacement CTA. Other panes render normally.
- Date outside chart's `active_from`/`active_to`: pane renders the "not available for this date" state with nearest-available-date nav.
- Malformed tree: fall back to an empty workspace and surface a non-blocking toast.

Decoding never throws to the user; worst case is a partially-degraded workspace.

## UI interactions

### Layout chrome

```
Header:   logo  workspace menu (save/load)  theme toggle  about
Sidebar:  search box
          topic filter pills (multi-select, "All" on the left)
          long scrollable list of charts, grouped by non-interactive topic section headers
Main:     react-mosaic pane tree (full remaining space)
```

Sidebar is collapsible to an icon strip (Cmd-B toggle). Header is thin, dense, lowercase per the site's style.

### Sidebar

- One long scrollable list, all charts visible (not collapse/expand).
- Topic section headers are small-caps labels with a rule; not interactive.
- Topic filter pills at the top, multi-select. Clicking a pill adds or removes that topic from the active filter; no pills active = all topics shown.
- Search box filters by chart title and description; combines with pills via AND.
- A chart whose `[active_from, active_to]` does not cover the focused pane's date renders in a dimmed state with a hover hint "not available for {date}". Not hidden.
- Section headers hide when their topic is filtered out or when all their charts are hidden by search.

Click behaviours on a chart row:

- Single-click: replace the focused pane's `chartId`. If no pane is focused, open a single pane with this chart.
- Shift-click: split focused pane vertically (bottom half), open there.
- Alt/Opt-click: split focused pane horizontally (right half), open there.
- Middle-click: open as a new pane split from root.

### Command palette (Cmd-K)

Fuzzy search across:

- Chart titles and descriptions
- Topic names
- Workspace actions: "Save workspace", "Load workspace: {name}", "Close all", "Duplicate pane", "Set date...", "Swap panes".

Enter: default action on focused pane (replace chart). Modifier + Enter: split variants matching sidebar click modifiers.

### Pane header

```
[chart title ▼]    [date ◀ YYYY-MM-DD ▶]    [related ⤢]    [split]    [×]
```

- Chart title dropdown: topic-grouped chart picker scoped to this pane.
- Date prev/next: uses `dates.json`. Dates outside the chart's active range are disabled. Clicking the date label opens a flat navigable date list (no popover calendar). Changing date updates both the pane and `defaultDate`.
- Related popover: lists `registry.charts[id].related`. Each row has two actions: "Open here" (replaces this pane's chart) and "Split below" (opens the related chart in a new pane beneath). Optional "Split above".
- Split menu: split right / below / left / above. Creates an empty pane; user picks a chart in the new pane via sidebar/Cmd-K/pane dropdown.
- Close: removes the pane; sibling is promoted.

The focused pane's header has a subtle accent ring.

### Context card

Below the Plotly area in each pane. Rendered from `manifest.context_html`. Collapsed to a one-line teaser by default; click to expand. On mobile it is always expanded.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Cmd-K / Ctrl-K | Open command palette |
| Cmd-B / Ctrl-B | Toggle sidebar |
| Cmd-\ | Split focused pane right |
| Cmd-Shift-\ | Split focused pane below |
| Cmd-W | Close focused pane |
| Cmd-[ / Cmd-] | Previous / next date on focused pane |
| Cmd-Shift-S | Save workspace... |
| Cmd-Alt-Arrow | Move focus to neighbour pane |

All shortcuts are discoverable through Cmd-K.

### Date cascading

- Each pane has its own `date`, stored in the tree.
- `defaultDate` is the "last date the user set in any pane". Starts at `dates.latest` on first load.
- New panes inherit `defaultDate` at the moment they open.
- Changing a pane's date updates `defaultDate` for subsequent new panes only. Already-open panes are not retroactively affected.
- `defaultDate` is serialised into the URL so shared links reproduce the sharer's cascade state.

### Mobile (< 768px)

- Pane tree is flattened in-order into a linear list.
- Only one pane is visible at a time; a tab strip across the top represents the other panes (by their titles).
- Split actions are hidden; close and swap-chart remain.
- Sidebar collapses into a drawer, opened via a hamburger in the header. Cmd-K is replaced by a prominent search icon.
- Context card is always expanded.
- Shared multi-pane URLs still work: the user lands on the first pane and can tab to the others.

Breakpoint is a single CSS media query plus a `useMediaQuery` hook in the workspace store; no separate mobile code path.

### Empty states

- Empty workspace (root null): centred "Pick a chart to begin" with a sidebar hint. Cmd-K works.
- Empty pane (user split but hasn't picked): "Pick a chart for this pane" with an inline search and dropdown.
- Unknown chart: "This chart no longer exists." with a pick-a-replacement CTA.
- Date out of range: "This chart doesn't cover {date}." with a nearest-available-date link.

## Old URL migration

### URL mapping

- `/` serves the new flagship workspace. No redirect; different content.
- `/latest/{notebook_id}` redirects with **302** to `/w/{encoded workspace with notebook's chart set at latest date}`. "Latest" is a moving target, hence 302.
- `/{YYYY}/{MM}/{DD}` redirects with **301** to `/w/{encoded workspace with defaultDate = that date, empty tree}`. The landing is an empty workspace primed for that date.
- `/{YYYY}/{MM}/{DD}/{notebook_id}` redirects with **301** to `/w/{encoded workspace with notebook's chart set at that date}`.
- `/data/*` (parquet download page) stays as-is.

### Notebook -> charts preset mapping

```python
# observatory/charts/presets.py
NOTEBOOK_PRESETS: dict[str, list[str]] = {
    "blob-inclusion": ["blob-density-scatter", "blob-slot-histogram", "blob-popularity", "blob-slot-in-epoch"],
    "blob-flow": ["blob-flow-diagram"],
    "column-propagation": ["col-first-seen-timing"],
    "mempool-visibility": ["tx-per-slot", "mempool-coverage", "sentry-coverage", "mempool-availability"],
    "mev-pipeline": ["mev-bid-timing"],
    "block-column-timing": ["block-column-timing-by-blob-count"],
    "propagation-anomalies": ["propagation-anomalies-scatter"],
    "missed-slots": ["missed-slots-timeline"],
    "block-propagation-size": [
        "block-propagation-by-size",
        "block-propagation-by-region",
        "block-propagation-by-region-contributoor",
        "mev-vs-local-propagation",
    ],
}
```

Exact chart ids are finalised at migration time as the notebooks are ported to `@chart` definitions. The mapping's invariant: each old notebook id resolves to a non-empty list of new chart ids.

### Redirect implementation

Two layers:

1. Client-side Astro route `site/src/pages/legacy/[...path].ts` handles `/latest/{id}`, `/{YYYY}/{MM}/{DD}`, and `/{YYYY}/{MM}/{DD}/{id}`. It computes the encoded workspace URL and returns a redirect response. Uses the same encoder as the frontend.
2. Worker-side fallback in `worker/src/index.ts`: if an incoming path matches `^/\d{4}/\d{2}/\d{2}(/[a-z0-9-]+)?$` or `^/latest/[a-z0-9-]+$` and no manifest entry exists, the Worker computes the same redirect and issues the appropriate 301/302 with a `Location` header. Ensures redirects survive Astro routing refactors.

Both layers share a small `legacy.ts` utility (TS for the Worker, port for Astro) that loads `NOTEBOOK_PRESETS` from a build-emitted `legacy_presets.json` and builds the workspace-state JSON.

### Layout preset for a notebook redirect

When redirecting `/{YYYY}/{MM}/{DD}/{notebook_id}`:

- N = number of charts in the notebook's preset.
- Choose a fixed layout based on N:
  - N = 1: a single pane.
  - N = 2: one horizontal split (side-by-side), ratio 0.5.
  - N = 3: a horizontal split with a vertical split on the right (or left); larger pane on the left.
  - N = 4: a 2x2 grid (horizontal split at ratio 0.5, each side vertical split at ratio 0.5).
  - N >= 5: pick the first 4 charts for the preset grid; the rest are left available via the sidebar. (Chart ids in preset lists are ordered.)
- All panes share the same date (from the URL) and `defaultDate` is set to that date.

## Deployment

Astro's build copies `build/charts/**` into `site/dist/charts/**` via a small viteStaticCopy step in `astro.config.mjs`. `scripts/upload_r2.py` is unchanged: it content-addresses every file under `site/dist/` and uploads blobs plus a new `manifests/{env}.json` to R2. The Cloudflare Worker already resolves incoming paths via the manifest; no functional change to the Worker beyond the redirect rule above.

## Testing strategy

### Python

- `observatory.data.fetch`: unit tests for staleness detection, manifest read/write, date range resolution (with each mode: rolling, range, list). ClickHouse client mocked at the transport layer.
- `observatory.build`: unit tests for the cache logic (`needs_rebuild`), failure handling (one chart raises, others succeed), range filtering (`active_from`/`active_to`), and registry validation (bad topic, bad related id, overlapping ids).
- `observatory.charts` decorators: unit tests for registration, duplicate-id detection, and range-overlap rules.
- End-to-end smoke: on a fixture dataset (small Parquet files checked into `tests/fixtures/`), run `observatory.build.main()` and assert the expected registry, manifests, and specs are emitted.

### TypeScript

- `state/url.ts`: round-trip encode/decode for a curated set of WorkspaceState shapes (single pane, deeply nested splits, multiple charts, non-default ratios, `defaultDate` variations).
- `state/tree.ts`: tree operations (split, close, focus, resize, swap) tested as pure-function transformations on fixtures.
- `data/*`: mocked-fetch tests verifying memoisation (two fetches to the same key resolve once) and error-state flow (404, network).
- Component tests for `Pane`, `PaneHeader`, `Sidebar` via React Testing Library: keyboard shortcuts, chart click modifiers, date prev/next, related popover actions, empty states.

### Redirects

- HTTP integration test per redirect class: `/latest/{id}` -> 302 with correct Location; `/{Y}/{M}/{D}` -> 301; `/{Y}/{M}/{D}/{id}` -> 301. Asserts the redirect target decodes back to the expected WorkspaceState.

### Visual / manual acceptance

- Render a gallery page (local only, gitignored) that embeds all registered charts at the latest date in a scrollable grid. Used as a visual diff harness when updating chart code.
- Manual smoke: split a pane 5 times deep, rotate dates, share URL, open in another browser, verify identical workspace restored.

## Phasing

The migration lands as a single big cutover (no coexistence phase). Order within that cutover:

1. Create `observatory/` package skeleton, move config/manifest/staleness/fetch modules with no behaviour change. Green tests.
2. Port queries from `queries/*.py` to `observatory/data/queries/{topic}.py`, add `@query` decorator and registry. Green fetch run on fixture data.
3. Consolidate queries into primary datasets where duplication exists (block events, mempool events, blob events). Update all chart expectations accordingly.
4. Build the `@chart` decorator, registry, topic registration, context sidecar loader, theme module.
5. Port charts one topic at a time from notebook cells to `@chart` functions. For each topic: compare output specs against the old notebook's rendered figures visually; iterate until parity.
6. Implement `observatory.build.main()` (orchestration, caching, parallelism, failure handling).
7. Build the React workspace island, URL encoding, state management, pane tree, sidebar, Cmd-K, pane header, context card, mobile behaviour, localStorage saves.
8. Implement the legacy redirect layer (Astro route + Worker rule).
9. Delete retired code and dependencies in a single cutover commit (the list of paths and packages is in the following section).
10. Deploy to staging on a PR, verify redirects and all charts, promote to production.

## Cleanup / deletion list (cutover commit)

- `notebooks/*.ipynb`, `notebooks/templates/`, `notebooks/__pycache__/`, `notebooks/data/` (renamed to `build/data/`).
- `notebooks/loaders.py`, `notebooks/plotly_theme.py` migrated to `observatory/charts/loaders.py`, `observatory/charts/theme.py`.
- `scripts/render_notebooks.py`.
- `scripts/pipeline.py` split into `observatory/config.py`, `observatory/data/manifest.py`, `observatory/data/staleness.py`.
- `scripts/fetch_data.py` -> `observatory/data/fetch.py`.
- Top-level `queries/` -> `observatory/data/queries/`.
- `site/rendered/` (directory and all references).
- `site/src/components/NotebookEmbed.astro`, `site/src/components/CodeToggle.tsx`, `site/src/components/TableOfContents.astro`.
- `site/src/pages/[year]/[month]/[day]/` and `site/src/pages/latest/[notebook].astro` (replaced by `/legacy/*` redirect routes).
- Python dependencies removed from `pyproject.toml`: `papermill`, `nbconvert`, `ipykernel`, `nbformat`, `traitlets`.
- `pipeline.yaml`: remove `queries:` and `notebooks:` sections; add `parallelism:`; keep `dates:` and `settings:`.

## Risks and open items

1. Per-chart Plotly JSON spec size: charts with dense traces (e.g. column-propagation across 128 subnets over all slots) could produce large specs. Mitigation: measure at port time; if any spec exceeds ~1 MB compressed, adopt gzip-at-rest for those files and/or pre-aggregate in the `build` function. No architectural change required.
2. Plotly.js bundle size: one global bundle of ~3 MB min+gzip. Same order of magnitude as today's per-notebook HTML. If TTI regresses, consider code-splitting Plotly into "core" + "extras" lazy chunks.
3. URL length for large workspaces: covered by the hash-fragment fallback. If users regularly exceed browser URL limits, consider an opt-in "shorten link" flow using a deterministic hash stored in localStorage, without introducing backend state.
4. Notebook -> chart id mapping: the `NOTEBOOK_PRESETS` dict is finalised during port work. If an old notebook's charts don't cleanly atomize, we keep them as separate charts but preserve the notebook's preset to open them all in the original order.
5. Chart version overlap: the "two charts with the same id must have non-overlapping date ranges" rule assumes clean temporal cutover. Support for a "v2 shown on all dates" (overlapping both forward and backward) is not in scope; if needed later, the id-versioning is the escape hatch.
