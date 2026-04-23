# Chart-centric workspace redesign

Date: 2026-04-23
Status: Proposed (v2, supersedes v1)
Owner: raul

## Overview

Redesign the Ethereum P2P Observatory site from a notebook-centric reader into a chart-centric workspace where users compose arbitrary binary-tree layouts of panes, each pane showing one chart for one date. The project is also migrated from a mixed Python + Astro stack to an all-TypeScript stack on Bun + Vite + React. Chart rendering moves to Apache ECharts 6. Data transport on the wire is Apache Arrow IPC.

The atomic product unit becomes a chart (one component definition + one Arrow data file per date per query). Notebooks retire as authoring format and as user-facing concept. Python retires entirely.

Two product requirements drive the shape of this design:

1. **Silky smooth UX.** Every interaction (pane open, pane close, date change, resize, split) must feel instant. First paint is fast; subsequent interactions feel frameless.
2. **Simple, LLM-friendly authoring flow.** Adding or editing a chart is one small file. No hooks, no effects, no orchestration. Types and schemas guide an LLM (or a human) to correct code in one edit.

Both goals point at the same architecture: component-based chart authoring with a minimal declarative surface, canvas-based rendering, data shared across panes via HTTP cache, aggressive prefetching, and a single language end-to-end.

## Goals

1. Users compose arbitrarily deep binary-tree layouts of panes. Each pane shows one chart for one date.
2. Per-pane date is independent; a "last set date" cascades as the default for newly opened panes.
3. Workspaces are shareable via URL with no backend (state encodes to a single URL segment). Personal named layouts are saved in localStorage.
4. Charts are atomic (one visualisation per pane) with a "related charts" affordance that splits the pane and opens a related chart above or below in one action.
5. Charts are discovered via a flat, topic-tagged catalog in a left sidebar plus a Cmd-K command palette. Sidebar is a long scrollable list with non-interactive topic section headers and multi-select topic filter pills at the top.
6. Mobile (< ~768px) collapses the pane tree to a single-visible-pane navigator; all panes remain reachable via a tab strip.
7. Chart versioning is first-class: each chart carries an `activeFrom` / `activeTo` date range; old URLs pointing to historical dates continue to resolve to the correct chart version.
8. Old notebook URLs (`/YYYY/MM/DD/{notebook_id}`, `/latest/{notebook_id}`) redirect to equivalent workspaces.
9. Chart authoring is a single TypeScript file per chart (or per topic when charts share helpers), containing id, metadata, data schema, transform, and an ECharts `option` builder. No React hooks or lifecycle concerns in the author-facing surface.
10. The pipeline runs on Bun with ClickHouse queries emitting Apache Arrow IPC files per (query, date). Pre-aggregations identified during the stress test are first-class queries in the same registry.
11. First paint is under 500 ms on a warm cache; date change within an open pane is under 100 ms; pane split transition is 180 ms with no layout thrash.

## Non-goals

- No live ClickHouse queries from the browser. All data is pre-fetched at build time.
- No server-side chart rendering. Charts render client-side on canvas via ECharts.
- No backend persistence of workspaces. Sharing is URL-based; personal saves are localStorage only.
- No migration to Vega-Lite or a declarative chart-spec DSL.
- No authentication, user accounts, or write APIs.
- No Python in the pipeline. No Altair. No Plotly. No papermill. No nbconvert. No Jupyter.
- No Astro in the site layer.
- No CSS-in-JS runtime; styles use Tailwind and CSS Modules.

## High-level architecture

```
BUILD TIME (Bun CLI)                                  RUNTIME (browser)
--------------------                                  -----------------
bun run fetch                                         Workspace React app
  ClickHouse --> build/data/{date}/{query}.arrow
                                                      1. Fetch registry.json + dates.json in parallel
bun run build-manifest                                2. Decode URL → WorkspaceState tree
  Scan site/src/workspace/charts/**                   3. For each pane's unique topic, dynamic-import
    extracts metadata, writes build/registry.json        its chart bundle (code-split)
    + build/dates.json                                4. For each unique (chart_id, date),
                                                        fetch required Arrow files in Web Worker,
bun run build                                           decode, call chart.transform(rows),
  vite build (copies build/** into site/dist/)          call chart.option(data), render via ECharts
  outputs content-addressable bundles + data
                                                      5. Resize and date changes re-run steps 3-4
bun run upload
  scripts/upload_r2.ts: CAS upload, new manifest       Service Worker caches Arrow files + chunks
```

Three independent layers, each cacheable at its natural granularity:

| Layer | Granularity | Cache lifetime | Wire format |
|---|---|---|---|
| Chart logic | 1 per chart (or per topic chunk) | Browser session + Service Worker | JS module |
| Query data | 1 per (query, date) | Immutable per build | Apache Arrow IPC |
| Metadata | 1 registry, 1 dates | Short TTL with revalidation | JSON |

A single fetch of `block_events/2026-04-22.arrow` serves every chart in every pane that references `block_events` on that date.

## Repo layout

```
observatory/                                  # Bun CLI package
├── clickhouse.ts                             # @clickhouse/client wrapper
├── config.ts                                 # Load pipeline.yaml (typed)
├── queries/                                  # Query modules (topic-grouped)
│   ├── registry.ts                           # query() helper + QUERY_REGISTRY
│   ├── types.ts                              # Shared row types (imported by site too)
│   ├── block_production.ts
│   ├── blob_inclusion.ts
│   ├── column_propagation.ts
│   ├── mempool.ts
│   ├── block_propagation.ts
│   ├── blob_flow.ts
│   └── aggregated/                           # Pre-aggregation queries
│       ├── col_first_seen_binned.ts
│       ├── block_timeline_cdf.ts
│       ├── region_size_matrix.ts
│       └── blob_flow_edges.ts
├── fetch.ts                                  # CLI: run queries × dates → Arrow files
├── manifest.ts                               # CLI: scan charts, emit registry.json + dates.json
├── staleness.ts                              # Hash-based invalidation
├── build.ts                                  # Orchestrator (runs fetch → manifest → vite build)
└── upload.ts                                 # R2 CAS upload

site/                                         # Vite + React app
├── src/
│   ├── main.tsx                              # Vite entry
│   ├── routes/
│   │   ├── Home.tsx                          # / (flagship workspace)
│   │   ├── Workspace.tsx                     # /w/:encoded
│   │   ├── Archive.tsx                       # /archive
│   │   ├── About.tsx                         # /about
│   │   └── Legacy.tsx                        # Old URL redirect resolver
│   ├── workspace/
│   │   ├── Workspace.tsx                     # Root workspace component
│   │   ├── charts/
│   │   │   ├── define.ts                     # defineChart() helper + types
│   │   │   ├── topics.ts                     # registerTopic() + TOPIC_REGISTRY
│   │   │   ├── PlotRenderer.tsx              # The only React/ECharts glue
│   │   │   ├── theme.ts                      # Design tokens (OKLCH palette)
│   │   │   ├── context/{topic}/{chart}.md    # Context card markdown
│   │   │   ├── blob_inclusion/               # One file per chart (or multi)
│   │   │   │   ├── density_scatter.ts
│   │   │   │   ├── count_stacked_epoch.ts
│   │   │   │   ├── popularity_heatmap.ts
│   │   │   │   ├── slot_heatmap_vertical.ts
│   │   │   │   └── slot_heatmap_facet.ts
│   │   │   ├── blob_flow/
│   │   │   │   ├── entity_blobcount_sankey.ts
│   │   │   │   ├── relay_blobcount_sankey.ts
│   │   │   │   ├── entity_relay_sankey.ts
│   │   │   │   └── entity_relay_blobcount_sankey.ts
│   │   │   ├── column_propagation/
│   │   │   │   ├── first_seen_heatmap.ts
│   │   │   │   ├── delta_heatmap.ts
│   │   │   │   ├── normalized_heatmap.ts
│   │   │   │   ├── spread_histogram.ts
│   │   │   │   ├── spread_timeseries.ts
│   │   │   │   └── missing_heatmap.ts
│   │   │   ├── mempool/
│   │   │   │   ├── coverage_stacked_bar.ts
│   │   │   │   ├── hourly_coverage_lines.ts
│   │   │   │   ├── tx_volume_stacked_time.ts
│   │   │   │   ├── coverage_heatmap.ts
│   │   │   │   ├── age_percentile_lines.ts
│   │   │   │   ├── age_histogram_facets.ts
│   │   │   │   ├── delay_percentile_lines.ts
│   │   │   │   ├── delay_histogram_facets.ts
│   │   │   │   └── sentry_coverage_bar.ts
│   │   │   ├── mev_pipeline/                 # charts 5.1-5.13
│   │   │   ├── block_column_timing/          # charts 6.1-6.4
│   │   │   ├── propagation_anomalies/        # charts 7.1-7.6
│   │   │   ├── missed_slots/                 # charts 8.1-8.5
│   │   │   └── block_propagation_size/       # charts 9.1-9.20
│   │   ├── data/
│   │   │   ├── queries.ts                    # Import query types from observatory/queries
│   │   │   ├── fetcher.ts                    # HTTP + Arrow decode (Web Worker boundary)
│   │   │   ├── worker.ts                     # Arrow decode Web Worker
│   │   │   ├── cache.ts                      # In-memory + Service Worker coordination
│   │   │   └── registry.ts                   # Typed registry.json loader
│   │   ├── tree/
│   │   │   ├── PaneTree.tsx                  # react-mosaic-component wrapper
│   │   │   └── ops.ts                        # Binary-tree operations
│   │   ├── state/
│   │   │   ├── store.ts                      # Zustand store
│   │   │   ├── url.ts                        # encode/decode WorkspaceState ↔ URL
│   │   │   ├── saves.ts                      # localStorage named-workspace persistence
│   │   │   └── types.ts
│   │   ├── pane/
│   │   │   ├── Pane.tsx
│   │   │   ├── PaneHeader.tsx                # Chart picker, date picker, related, split, close
│   │   │   ├── ContextCard.tsx
│   │   │   └── DatePicker.tsx
│   │   └── chrome/
│   │       ├── Sidebar.tsx                   # Search, topic pills, scrollable chart list
│   │       ├── CommandPalette.tsx            # Cmd-K with uFuzzy
│   │       ├── Header.tsx
│   │       └── MobileNav.tsx
│   ├── lib/
│   │   ├── utils.ts
│   │   ├── markdown.ts                       # ?raw markdown import helpers
│   │   └── date.ts
│   └── styles/                               # Tailwind globals + OKLCH tokens
├── public/                                   # Static assets (favicon, fonts)
├── sw.ts                                     # Service Worker
└── vite.config.ts

build/                                        # Gitignored; regenerated at CI
├── data/
│   └── {YYYY-MM-DD}/
│       └── {query_id}.arrow
├── registry.json
├── dates.json
├── .cache.json                               # Staleness cache
└── .failures.json                            # Per-stage failure log

worker/                                       # Cloudflare Worker (unchanged structure)
├── src/
│   ├── index.ts                              # Serve from manifest; redirect legacy URLs
│   └── legacy.ts                             # Shared with site/src/routes/Legacy.tsx
└── wrangler.toml

scripts/                                      # Only CI glue
└── ci.ts

pipeline.yaml                                 # dates + settings + parallelism only
package.json                                  # Single workspace package.json; Bun-managed
bunfig.toml
tsconfig.json                                 # strict, noUncheckedIndexedAccess, noImplicitOverride
justfile
README.md
CLAUDE.md
```

All tests live next to the source as `*.test.ts` (Vitest-compatible; Bun's test runner executes them).

## Data model

### Workspace state

```ts
// site/src/workspace/state/types.ts

export type WorkspaceState = {
  root: Node | null;
  focusedPaneId: string | null;
  defaultDate: string;              // ISO YYYY-MM-DD, the "last set" cascade source
};

export type Node = Split | Pane;

export type Split = {
  kind: 'split';
  id: string;                       // ULID, stable across re-renders
  orientation: 'h' | 'v';           // h: children side-by-side; v: children stacked
  ratio: number;                    // 0..1, first child's share; clamped [0.1, 0.9]
  a: Node;                          // left / top
  b: Node;                          // right / bottom
};

export type Pane = {
  kind: 'pane';
  id: string;                       // ULID, stable across re-renders
  chartId: string;
  date: string;                     // ISO YYYY-MM-DD
};
```

All tree operations return new trees (immutable). See `site/src/workspace/tree/ops.ts` for split, close, focus, resize, and swap.

### Registry schema (critical path, loaded once)

`build/registry.json`, size target under 15 KB gzipped for ~60 charts:

```json
{
  "schemaVersion": "2.0",
  "generatedAt": "2026-04-23T10:00:00Z",
  "topics": [
    { "id": "blob-inclusion",        "title": "Blob inclusion",         "order": 1 },
    { "id": "blob-flow",             "title": "Blob flow",              "order": 2 },
    { "id": "column-propagation",    "title": "Column propagation",     "order": 3 },
    { "id": "mempool-visibility",    "title": "Mempool visibility",     "order": 4 },
    { "id": "mev-pipeline",          "title": "MEV pipeline",           "order": 5 },
    { "id": "block-column-timing",   "title": "Block / column timing",  "order": 6 },
    { "id": "propagation-anomalies", "title": "Propagation anomalies",  "order": 7 },
    { "id": "missed-slots",          "title": "Missed slots",           "order": 8 },
    { "id": "block-propagation",     "title": "Block propagation",      "order": 9 }
  ],
  "charts": {
    "block-propagation-by-size": {
      "id": "block-propagation-by-size",
      "topic": "block-propagation",
      "title": "Block propagation by wire size",
      "description": "Timing vs wire size, MEV-classified",
      "related": ["block-propagation-by-region"],
      "order": 1,
      "activeFrom": "2025-12-03",
      "activeTo": null
    }
  }
}
```

The registry carries only what the sidebar, Cmd-K, related-chart menu, and per-pane dropdown need to render synchronously. Context markdown is not in the registry; it is bundled into each chart's topic chunk via Vite's `?raw` imports and loads with the component.

### Dates schema

`build/dates.json`, roughly 3 KB gzipped for 365 dates:

```json
{ "dates": ["2025-12-03", "2025-12-04", "...", "2026-04-22"], "latest": "2026-04-22" }
```

Per-chart date range is determined from `activeFrom` / `activeTo` against this global list. A gap (failed build for one (chart, date)) is detected at fetch time via 404; no metadata encodes gaps.

### Per-(query, date) Arrow files

`build/data/{YYYY-MM-DD}/{query_id}.arrow`:

- Apache Arrow IPC file format (stream or file format; we use file format for random-access friendliness).
- Immutable per build; content-addressed on upload.
- Typical sizes: 10 KB for tiny aggregates, up to ~2 MB for raw `block_events`.
- Client decodes via `apache-arrow` in a Web Worker; columns become typed arrays consumable zero-copy by ECharts.

Shared across charts: every chart that references `block_events` in its `queries` field receives the same Arrow Table from the same fetch.

## Query authoring

### The `query()` helper

```ts
// observatory/queries/registry.ts

import type { ClickHouseClient } from '@clickhouse/client';
import type { z } from 'zod';

export type QueryContext = {
  date: string;                     // ISO YYYY-MM-DD
  database: string;                 // Default 'default'; some queries use 'contributoor'
};

export type QueryDef<Schema extends z.ZodTypeAny> = {
  id: string;
  topic: string;
  description: string;
  database?: 'default' | 'contributoor';
  schema: Schema;
  fetch: (client: ClickHouseClient, ctx: QueryContext) => Promise<Array<z.infer<Schema>>>;
};

export const QUERY_REGISTRY = new Map<string, QueryDef<z.ZodTypeAny>>();

export function query<S extends z.ZodTypeAny>(def: QueryDef<S>): QueryDef<S> {
  if (QUERY_REGISTRY.has(def.id)) {
    throw new Error(`Duplicate query id: ${def.id}`);
  }
  QUERY_REGISTRY.set(def.id, def);
  return def;
}
```

Each query file auto-registers via a top-level `query({...})` call. The builder imports `observatory/queries/**` at start, triggering registration.

### Full query example

```ts
// observatory/queries/block_production.ts

import { z } from 'zod';
import { query } from './registry';

export const BlockEventsRow = z.object({
  slot: z.number().int(),
  slot_start: z.coerce.date(),
  event_type: z.enum([
    'bid_received',
    'bid_winning',
    'block_arrival',
    'first_column_seen',
    'last_column_seen',
  ]),
  builder_pubkey: z.string().nullable(),
  proposer_pubkey: z.string(),
  relay: z.string().nullable(),
  region: z.string().nullable(),
  wire_size_bytes: z.number().int().nullable(),
  latency_ms: z.number().nullable(),
  is_mev: z.boolean(),
  blob_count: z.number().int(),
  winning_bid_value_wei: z.string().nullable(),  // bigint-as-string
});
export type BlockEventsRow = z.infer<typeof BlockEventsRow>;

export const blockEvents = query({
  id: 'block_events',
  topic: 'block-production',
  description: 'Row-level block-production events for the day: bidding, arrival, column propagation.',
  schema: BlockEventsRow,
  async fetch(client, { date }) {
    const sql = `
      SELECT
        slot,
        slot_start_date_time AS slot_start,
        event_type,
        builder_pubkey,
        proposer_pubkey,
        relay_name AS relay,
        region,
        wire_size_bytes,
        latency_ms,
        is_mev,
        blob_count,
        toString(winning_bid_value_wei) AS winning_bid_value_wei
      FROM ...
      WHERE toDate(slot_start_date_time) = {date:Date}
      ORDER BY slot, event_type
    `;
    const result = await client.query({
      query: sql,
      query_params: { date },
      format: 'JSONEachRow',
    });
    const rows = await result.json<unknown[]>();
    return rows.map((r) => BlockEventsRow.parse(r));
  },
});
```

Zod validates every row at the ClickHouse boundary per the project's TypeScript rules. No `as` casts.

### Primary datasets over per-chart queries

Queries are **primary datasets**, not per-chart results. A single wide `block_events` feeds every block-production chart. A single `blob_events` feeds blob-inclusion charts. Charts slice on the client. This consolidation is a migration-time audit of the 14 queries in the current `pipeline.yaml`. Proposed consolidated query list:

| New query id | Replaces | Notes |
|---|---|---|
| `block_events` | `block_production_timeline` | Row-level events: bidding, arrival, column first/last seen. Wider schema than today. |
| `block_size_events` | `block_propagation_by_size` | Kept separate because source table differs; could be merged if data model allows. |
| `block_region_events` | `block_propagation_by_region` | Sentry-based, one row per arrival with region tag. |
| `block_region_contrib_events` | `block_propagation_by_region_contributoor` | Contributoor-based; parallel to above. |
| `blob_events` | `blobs_per_slot`, `blocks_blob_epoch`, `blob_popularity`, `slot_in_epoch` | Row-level blob inclusion events. Charts slice/aggregate. |
| `blob_flow_rows` | `blob_flow` | Unchanged in spirit; existing. |
| `col_first_seen` | Unchanged | Row-level 128 × 7200. |
| `mempool_events` | `tx_per_slot`, `mempool_coverage`, `sentry_coverage`, `mempool_availability` | Row-level mempool visibility events. |

Plus four aggregated queries described in the next section.

## Pre-aggregation queries

Identified by the stress test as necessary for performance and correctness. These run as regular `@query` definitions in `observatory/queries/aggregated/`. Each uses ClickHouse SQL for the aggregation; the browser receives a small, pre-computed table.

### `col_first_seen_binned`

Reduces the 128 × 7200 grid to 128 × 480 (5-minute time buckets) for the default column-propagation view.

```ts
// observatory/queries/aggregated/col_first_seen_binned.ts

import { z } from 'zod';
import { query } from '../registry';

export const ColFirstSeenBinnedRow = z.object({
  column_index: z.number().int(),       // 0..127
  time_bucket: z.number().int(),        // 0..479 (5-min buckets)
  median_ms: z.number().nullable(),
  p95_ms: z.number().nullable(),
  min_ms: z.number().nullable(),
  max_ms: z.number().nullable(),
  missing_count: z.number().int(),
});
export type ColFirstSeenBinnedRow = z.infer<typeof ColFirstSeenBinnedRow>;

export const colFirstSeenBinned = query({
  id: 'col_first_seen_binned',
  topic: 'column-propagation',
  description: '128 columns x 480 (5-min buckets) aggregated column first-seen timing.',
  schema: ColFirstSeenBinnedRow,
  async fetch(client, { date }) {
    const sql = `
      SELECT
        column_index,
        toUInt32(floor((toUnixTimestamp(slot_start) - toUnixTimestamp(toDateTime('${date} 00:00:00'))) / 300)) AS time_bucket,
        quantileExact(0.5)(first_seen_ms) AS median_ms,
        quantileExact(0.95)(first_seen_ms) AS p95_ms,
        min(first_seen_ms) AS min_ms,
        max(first_seen_ms) AS max_ms,
        countIf(first_seen_ms IS NULL) AS missing_count
      FROM col_first_seen_source
      WHERE toDate(slot_start) = {date:Date}
      GROUP BY column_index, time_bucket
      ORDER BY column_index, time_bucket
    `;
    const rows = await (await client.query({ query: sql, query_params: { date }, format: 'JSONEachRow' })).json<unknown[]>();
    return rows.map((r) => ColFirstSeenBinnedRow.parse(r));
  },
});
```

Output: 128 × 480 = 61,440 rows, roughly 1.5 MB raw JSON, ~300 KB Arrow with dictionary encoding. The raw `col_first_seen` query stays available for drill-down panes.

### `block_timeline_cdf`

101-point CDFs per (region × source × size_bucket × builder_type) for chart 9.10.

```ts
export const BlockTimelineCdfRow = z.object({
  region: z.enum(['eu-west', 'eu-east', 'us-east', 'us-west']),
  source: z.enum(['sentry', 'contributoor']),
  size_bucket: z.enum(['tiny', 'small', 'medium', 'large']),
  builder_type: z.enum(['mev', 'local']),
  percentile: z.number().int().min(0).max(100),
  value_ms: z.number(),
});
```

Computed via `quantileExact(percentile/100)` over the joined event table. 4 × 2 × 4 × 2 × 101 = 6,464 rows, ~150 KB raw.

### `region_size_matrix`

4 × 4 × 2 medians for chart 9.12.

```ts
export const RegionSizeMatrixRow = z.object({
  region: z.string(),
  size_bucket: z.string(),
  source: z.enum(['sentry', 'contributoor']),
  median_ms: z.number(),
  count: z.number().int(),
});
```

32 rows, ~2 KB. Trivial.

### `blob_flow_edges`

Edge lists for notebook 02's 4 Sankey diagrams.

```ts
export const BlobFlowEdgesRow = z.object({
  stage: z.enum(['entity_to_blob', 'relay_to_blob', 'entity_to_relay', 'entity_to_relay_to_blob']),
  source: z.string(),
  target: z.string(),
  intermediate: z.string().nullable(),        // for 3-stage
  value: z.number().int(),                    // count of blocks/blobs
});
```

~1,500 rows total across all four Sankey shapes, ~30 KB.

## Chart authoring

### The `defineChart()` helper

```ts
// site/src/workspace/charts/define.ts

import type { EChartsOption } from 'echarts';
import type { z } from 'zod';
import type { Table } from 'apache-arrow';

export type ChartContext = {
  date: string;
  isDark: boolean;
};

export type QueryRowTypes = Record<string, unknown>;  // narrowed per chart

export type ChartDef<
  Raw extends QueryRowTypes,
  Data,
  DataSchema extends z.ZodTypeAny = z.ZodType<Data>,
> = {
  id: string;
  topic: string;
  title: string;
  description: string;
  queries: ReadonlyArray<keyof Raw & string>;
  related?: ReadonlyArray<string>;
  context?: () => Promise<{ default: string }>;       // Vite `?raw` import
  activeFrom: string;                                 // YYYY-MM-DD
  activeTo: string | null;
  order?: number;
  dataSchema: DataSchema;
  transform: (raw: { [K in keyof Raw]: Table }) => Data;
  option: (data: Data, ctx: ChartContext) => EChartsOption;
};

export function defineChart<
  Raw extends QueryRowTypes,
  Data,
  Schema extends z.ZodTypeAny = z.ZodType<Data>,
>(def: ChartDef<Raw, Data, Schema>): ChartDef<Raw, Data, Schema> {
  return def;
}
```

The `Raw` generic constrains `queries` and types the `transform` input. The `Data` generic flows from `dataSchema` into `option`. `ChartContext` passes `date` (so option builders can label axes with it) and `isDark` (so theme-sensitive colors resolve correctly).

### Topic registration

```ts
// site/src/workspace/charts/topics.ts

export type TopicDef = { id: string; title: string; order: number };

export const TOPIC_REGISTRY: Record<string, TopicDef> = {
  'blob-inclusion':        { id: 'blob-inclusion',        title: 'Blob inclusion',         order: 1 },
  'blob-flow':             { id: 'blob-flow',             title: 'Blob flow',              order: 2 },
  'column-propagation':    { id: 'column-propagation',    title: 'Column propagation',     order: 3 },
  'mempool-visibility':    { id: 'mempool-visibility',    title: 'Mempool visibility',     order: 4 },
  'mev-pipeline':          { id: 'mev-pipeline',          title: 'MEV pipeline',           order: 5 },
  'block-column-timing':   { id: 'block-column-timing',   title: 'Block / column timing',  order: 6 },
  'propagation-anomalies': { id: 'propagation-anomalies', title: 'Propagation anomalies',  order: 7 },
  'missed-slots':          { id: 'missed-slots',          title: 'Missed slots',           order: 8 },
  'block-propagation':     { id: 'block-propagation',     title: 'Block propagation',      order: 9 },
};
```

### Sample chart: scatter with overlay

```ts
// site/src/workspace/charts/block_propagation_size/by_size.ts

import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import type { BlockSizeEventsRow } from '@/observatory/queries/block_propagation';

const Data = z.object({
  mev: z.array(z.object({ size: z.number(), latency: z.number() })),
  local: z.array(z.object({ size: z.number(), latency: z.number() })),
});
type Data = z.infer<typeof Data>;

type Raw = { block_size_events: BlockSizeEventsRow };

export default defineChart<Raw, Data>({
  id: 'block-propagation-by-size',
  topic: 'block-propagation',
  title: 'Block propagation by wire size',
  description: 'Timing vs wire size with MEV vs local classification',
  queries: ['block_size_events'],
  related: ['block-propagation-by-region', 'compression-ratio-scatter'],
  context: () => import('../context/block_propagation/by_size.md?raw'),
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 1,
  dataSchema: Data,
  transform: ({ block_size_events: t }) => {
    const size = t.getChild('wire_size_bytes')!.toArray() as Float64Array;
    const latency = t.getChild('latency_ms')!.toArray() as Float64Array;
    const mev = t.getChild('is_mev')!.toArray() as Uint8Array;
    const mevRows: Array<{ size: number; latency: number }> = [];
    const localRows: Array<{ size: number; latency: number }> = [];
    for (let i = 0; i < t.numRows; i++) {
      const row = { size: size[i], latency: latency[i] };
      (mev[i] ? mevRows : localRows).push(row);
    }
    return { mev: mevRows, local: localRows };
  },
  option: (data, { isDark }) => ({
    tooltip: { trigger: 'item' },
    legend: { data: ['MEV', 'Local'], top: 0 },
    xAxis: { type: 'log', name: 'wire size (bytes)' },
    yAxis: { type: 'value', name: 'latency (ms)' },
    series: [
      {
        name: 'MEV',
        type: 'scatter',
        data: data.mev.map((d) => [d.size, d.latency]),
        symbolSize: 4,
        itemStyle: { color: isDark ? '#f87171' : '#ef4444', opacity: 0.4 },
        large: true,
        largeThreshold: 2000,
      },
      {
        name: 'Local',
        type: 'scatter',
        data: data.local.map((d) => [d.size, d.latency]),
        symbolSize: 4,
        itemStyle: { color: isDark ? '#60a5fa' : '#3b82f6', opacity: 0.4 },
        large: true,
        largeThreshold: 2000,
      },
    ],
  }),
});
```

**Per chart, the author writes**: metadata (8 fields), one `dataSchema`, one `transform` (Arrow columns → plain shape), one `option` (plain shape → ECharts config). No React, no hooks, no mosaic, no URL, no fetch, no mounting, no resize, no theme plumbing. An LLM edits one file to add a chart; types constrain what can be written.

### Sample chart: Sankey

```ts
// site/src/workspace/charts/blob_flow/entity_blobcount.ts

const Data = z.object({
  nodes: z.array(z.object({ name: z.string() })),
  links: z.array(z.object({ source: z.string(), target: z.string(), value: z.number() })),
});

export default defineChart<{ blob_flow_edges: BlobFlowEdgesRow }, z.infer<typeof Data>>({
  id: 'entity-blobcount-sankey',
  topic: 'blob-flow',
  title: 'Entity to blob count',
  description: 'Sankey: proposing entity to blob count per block.',
  queries: ['blob_flow_edges'],
  related: ['relay-blobcount-sankey', 'entity-relay-sankey'],
  context: () => import('../context/blob_flow/entity_blobcount.md?raw'),
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 1,
  dataSchema: Data,
  transform: ({ blob_flow_edges: t }) => {
    const stage = t.getChild('stage')!.toArray();
    const src = t.getChild('source')!.toArray();
    const tgt = t.getChild('target')!.toArray();
    const val = t.getChild('value')!.toArray();
    const nodes = new Set<string>();
    const links: Array<{ source: string; target: string; value: number }> = [];
    for (let i = 0; i < t.numRows; i++) {
      if (stage[i] !== 'entity_to_blob') continue;
      nodes.add(src[i]); nodes.add(tgt[i]);
      links.push({ source: src[i], target: tgt[i], value: Number(val[i]) });
    }
    return { nodes: [...nodes].map((name) => ({ name })), links };
  },
  option: (data) => ({
    tooltip: { trigger: 'item' },
    series: [{
      type: 'sankey',
      data: data.nodes,
      links: data.links,
      emphasis: { focus: 'adjacency' },
      lineStyle: { color: 'gradient', curveness: 0.5 },
    }],
  }),
});
```

### Sample chart: boxplot with groups

```ts
const Data = z.object({
  categories: z.array(z.string()),
  series: z.array(z.object({
    name: z.string(),
    data: z.array(z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()])),  // min, q1, median, q3, max
  })),
});

// option: ECharts `type: 'boxplot'` with grouped categories
```

### Sample chart: 900k-cell heatmap with dataZoom

```ts
const Data = z.object({
  xLabels: z.array(z.string()),               // time buckets (480)
  yLabels: z.array(z.string()),               // column indices (128)
  values: z.array(z.tuple([z.number(), z.number(), z.number().nullable()])),  // [x, y, v]
});

// option:
{
  tooltip: { position: 'top' },
  grid: { height: '80%' },
  xAxis: { type: 'category', data: data.xLabels, splitArea: { show: true } },
  yAxis: { type: 'category', data: data.yLabels, splitArea: { show: true } },
  visualMap: {
    min: 0, max: 12000, calculable: true, orient: 'horizontal', left: 'center', bottom: 10,
    inRange: { color: ['#050510', '#ffffb0'] },
  },
  dataZoom: [{ type: 'inside', xAxisIndex: 0 }, { type: 'slider', xAxisIndex: 0 }],
  series: [{
    type: 'heatmap',
    data: data.values,
    emphasis: { itemStyle: { shadowBlur: 10 } },
    progressive: 5000,
    progressiveThreshold: 10000,
  }],
}
```

Uses `progressive` rendering for the dense case: ECharts streams the draw in chunks so the frame rate stays up.

### Sample chart: percentile ribbon

```ts
const Data = z.object({
  x: z.array(z.number()),
  p50: z.array(z.number()),
  p95: z.array(z.number()),
  band: z.array(z.tuple([z.number(), z.number()])),    // [p25, p75] for ribbon
});

// option: three series: two `line` (bottom of ribbon, top of ribbon stacked with areaStyle)
// and one `line` for p50.
```

### Context markdown sidecar

```markdown
<!-- site/src/workspace/charts/context/block_propagation/by_size.md -->

Block propagation time is the interval between a block's slot start and when
it first arrives at distributed sentries. Larger blocks take longer; MEV-built
blocks show a distinct pattern reflecting builder-side delay before the block
goes on the wire.
```

Imported by the chart module via `() => import('../context/block_propagation/by_size.md?raw')`. Vite bundles it into the topic chunk as a string. No extra network round-trip.

## Build pipeline

### Orchestrator

```
observatory/build.ts
  1. Load pipeline.yaml → parallelism, dates, settings.
  2. Import observatory/queries/** (triggers @query registration).
  3. Fetch stage: for each (query, date) needing refresh, run query.fetch(),
     parse rows with schema, write to build/data/{date}/{query_id}.arrow.
  4. Import site/src/workspace/charts/** as metadata-only (extract id, topic,
     title, description, related, order, activeFrom, activeTo via a Vite
     `scan` call: parses the file via Babel/TS, reads the defineChart call).
  5. Emit build/registry.json and build/dates.json.
  6. Run `vite build`; it copies build/** into site/dist/.
  7. Run scripts/ci.ts → upload_r2 with content-addressed blobs.
```

Steps 3 and 4 are independent; they can run in parallel. Step 5 depends on step 4.

### Parallelism

```yaml
# pipeline.yaml
parallelism:
  fetch: 4        # concurrent ClickHouse queries (Promise.all + p-limit)
  build: 4        # concurrent Vite bundles if we ever split; today: 1
```

CLI overrides: `bun run fetch --workers 8`. Fetch workers use `p-limit`. No ProcessPool needed because ClickHouse I/O is the bottleneck, not JS compute.

### Staleness and incremental builds

Three inputs determine whether to re-fetch a (query, date):

1. **Query source hash**: SHA-256 of the query's SQL template + fetch function body + Zod schema AST. Computed via `esbuild` transform + `crypto.subtle`. Docstrings excluded.
2. **Date**: if the date isn't in the configured window, skip.
3. **Force flag**: `--force` rebuilds everything.

Stored in `build/.cache.json`:

```json
{
  "queries": {
    "block_events": {
      "hash": "8a3f...",
      "dates": {
        "2026-04-22": { "fetched_at": "2026-04-22T10:00:00Z", "arrow_hash": "2b91..." }
      }
    }
  }
}
```

A (query, date) re-fetches only if the hash differs, the output file is missing, or `--force` is set.

### Failure handling

One (query, date) failure does not abort the run. The error is appended to `build/.failures.json`; other tasks continue; the build exits non-zero at the end if any task failed.

```json
{
  "block_events": {
    "2026-04-22": {
      "error": "ConnectionError: ...",
      "traceback": "...",
      "attempt": 1
    }
  }
}
```

At runtime, a missing Arrow file produces a 404 and the pane shows "no data for this date" state with prev/next navigation.

### Registry scan

```ts
// observatory/manifest.ts: sketch

import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import fs from 'node:fs/promises';
import path from 'node:path';

async function scanCharts(rootDir: string) {
  const files = await glob(`${rootDir}/**/*.ts`, { ignore: ['**/*.test.ts', '**/define.ts', '**/topics.ts'] });
  const entries: RegistryChart[] = [];
  for (const file of files) {
    const src = await fs.readFile(file, 'utf8');
    const ast = parse(src, { sourceType: 'module', plugins: ['typescript'] });
    traverse(ast, {
      CallExpression(path) {
        if (isDefineChartCall(path.node)) {
          entries.push(extractMetadataFields(path.node));
        }
      },
    });
  }
  return entries;
}
```

Metadata-only scan is fast (under 1 second for 60 chart files). No runtime side effects.

## Runtime data flow and rendering

### On workspace open

```
GET /w/:encoded
  HTML shell (~3 KB gzipped) mounts React root
    Fires in parallel:
      GET /registry.json
      GET /dates.json
    URL state decoded → set of required (chart_id, date) pairs
    For each unique topic in required set:
      dynamic-import('./workspace/charts/{topic}/index.ts') → code-split chunk
    For each unique (query_id, date):
      Worker.fetchArrow(url)
```

Registry is the only thing on the critical path. Chart chunks and Arrow data load concurrently per pane.

### Pane render lifecycle

```tsx
// site/src/workspace/pane/Pane.tsx (sketch)

function Pane({ paneId }: { paneId: string }) {
  const { chartId, date } = useSelector((s) => s.panes[paneId]);
  const chartDef = useChartModule(chartId);        // Suspense-ful dynamic import
  const rawData = useQueryBundle(chartDef.queries, date);  // Suspense-ful Arrow fetch
  const data = useMemo(() => chartDef.transform(rawData), [rawData, chartDef]);
  const parsed = useMemo(() => chartDef.dataSchema.parse(data), [data, chartDef]);
  const { isDark } = useTheme();
  const option = useMemo(() => chartDef.option(parsed, { date, isDark }), [parsed, date, isDark]);

  return (
    <div className="flex h-full flex-col">
      <PaneHeader paneId={paneId} chartDef={chartDef} date={date} />
      <div className="flex-1 min-h-0">
        <PlotRenderer option={option} />
      </div>
      <ContextCard chartDef={chartDef} />
    </div>
  );
}
```

Each `useMemo` has stable inputs; only the final `option` object changes cause ECharts to `setOption`.

### PlotRenderer

```tsx
// site/src/workspace/charts/PlotRenderer.tsx

import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
// Series types are registered on-demand by individual chart chunks via
// echarts.use([...]) at module load; base registration here covers defaults.

export function PlotRenderer({ option }: { option: EChartsOption }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    chartRef.current = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    return () => { chartRef.current?.dispose(); };
  }, []);

  useLayoutEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  useResize(ref, () => chartRef.current?.resize());

  return <div ref={ref} className="h-full w-full" />;
}
```

- Canvas renderer always (never SVG; our charts include 900k cells, which SVG can't handle).
- `setOption({ notMerge: true, lazyUpdate: true })` replaces the option cleanly; ECharts diffs internally for smooth transitions.
- `useResize` uses `ResizeObserver` throttled to `requestAnimationFrame`.
- On unmount, `dispose()` frees canvas + internal state.

### Web Worker for Arrow decode

```ts
// site/src/workspace/data/worker.ts

import { tableFromIPC } from 'apache-arrow';

self.onmessage = async (e: MessageEvent<{ url: string; id: number }>) => {
  const res = await fetch(e.data.url);
  if (!res.ok) {
    self.postMessage({ id: e.data.id, error: res.status });
    return;
  }
  const buf = await res.arrayBuffer();
  const table = tableFromIPC(new Uint8Array(buf));
  // Transfer the Arrow buffers to the main thread zero-copy
  self.postMessage({ id: e.data.id, table }, [buf]);
};
```

Parsing Arrow on the main thread blocks animations. The worker keeps the main thread free.

### Fetch memoisation

```ts
// site/src/workspace/data/cache.ts

const inflight = new Map<string, Promise<Table>>();

export function fetchArrow(queryId: string, date: string): Promise<Table> {
  const key = `${queryId}:${date}`;
  const existing = inflight.get(key);
  if (existing) return existing;

  const url = `/data/${date}/${queryId}.arrow`;
  const promise = workerPool.decode(url).catch((err) => {
    inflight.delete(key);
    throw err;
  });
  inflight.set(key, promise);
  return promise;
}
```

Three panes on the same (query, date) trigger one network fetch and one decode. Different panes using different subsets of the same Arrow Table share the table zero-copy.

### Prefetching

```ts
// Hover-intent on prev/next date arrow
function PaneHeader({ paneId, chartDef, date }: Props) {
  const dates = useDates();
  const idx = dates.indexOf(date);
  const next = dates[idx + 1];

  const onHoverNext = useCallback(() => {
    if (next) {
      // Fire-and-forget prefetch after 120ms hover
      chartDef.queries.forEach((q) => fetchArrow(q, next));
    }
  }, [next, chartDef]);
  // ...
}
```

Also prefetch: on first pane open, prefetch the previous and next dates for that pane's queries. Background, non-blocking.

### Service Worker

Cache strategy:
- `**/*.arrow`: cache-first, immutable (content-addressed).
- `**/*.js` (chart chunks): cache-first, immutable.
- `registry.json`, `dates.json`: stale-while-revalidate, 5-minute revalidation.
- HTML shell: network-first, falls back to cache when offline.

A returning user on a warm cache: zero network requests for any chart they've seen before.

## Silky-smoothness contract

Explicit performance targets with concrete engineering answers.

| Event | Target | How we hit it |
|---|---|---|
| First paint (cold cache) | < 1.2 s | Minimal HTML shell, preload registry.json + dates.json, code-split per topic, Service Worker precaches critical assets on install |
| First paint (warm cache) | < 400 ms | Everything but the initial fetch is cached |
| Pane split transition | 180 ms, 0 dropped frames | Framer Motion `scale+opacity`, pane mounts synchronously with cached topic chunk, Suspense boundary waits on data invisibly |
| Pane close transition | 120 ms | Same |
| Date change on open pane | < 100 ms on warm cache, < 400 ms cold | Prefetched on arrow-hover (120 ms delay), Arrow decode in Worker, `setOption` with `lazyUpdate: true` |
| Drag-resize of pane gutter | 60 fps | `react-mosaic` debounces via RAF, ECharts `resize()` called at most once per frame |
| Cmd-K open + first result | < 50 ms | `uFuzzy` fuzzy match, registry in memory, results rendered in same frame |
| Sidebar scroll | 60 fps with 60 charts | `react-virtual` virtualization |
| Dark mode toggle | < 100 ms, no layout shift | Theme tokens re-applied via CSS variables; charts re-render via cheap `option()` call with new `isDark` |

### Perceptual polish items

- Chart skeletons match the eventual chart's aspect ratio so there's no layout shift on data arrival.
- The context card collapses to one line by default; expand on click. On mobile it's always expanded.
- Date picker's keyboard navigation (`ArrowLeft` / `ArrowRight`) has 16 ms repeat throttling when held.
- Pane focus ring uses a 2 px OKLCH-accent color, 120 ms ease-in fade.
- Service Worker "new version available" banner is a single non-blocking toast.

## Workspace state and URL encoding

### URL scheme

- `/` serves a flagship single-pane workspace (curated chart id at latest date).
- `/w` serves an empty workspace landing.
- `/w/:encoded` restores a workspace from encoded state.
- `/archive` static archive page.
- `/about` static page.

### Encoding

Compact positional-array encoding with string interning, then JSON-stringify → gzip → base64url. Single URL path segment.

```
state  := [charts, dates, defaultDateIdx, tree]
charts := string[]
dates  := string[]
defaultDateIdx := number
tree   := pane | split
pane   := ["p", chartIdx, dateIdx]
split  := [orient, ratio10, tree, tree]
orient := "s" (horizontal) | "S" (vertical)
ratio10 := 0..100 (5% steps)
```

Example (3 panes, vertical split left, single pane right):

```json
[
  ["block-propagation-by-size", "blob-density-scatter"],
  ["2026-04-22", "2026-04-15"],
  0,
  ["s", 50,
    ["S", 60, ["p", 0, 0], ["p", 1, 0]],
    ["p", 0, 1]
  ]
]
```

~130 bytes raw → ~90 chars base64url. A dozen panes fit in a few hundred characters.

Long-URL fallback: if encoded length exceeds 2000 chars (very long workspaces), switch to hash-fragment encoding (`/w/#{encoded}`), which bypasses share-surface URL length limits.

### localStorage saves

```json
{
  "version": 1,
  "saves": [
    { "name": "blob day comparison", "created_at": "2026-04-22T11:00:00Z", "state": {...} }
  ]
}
```

Actions: "Save current as…", "Load", "Rename", "Delete". In the workspace menu and Cmd-K.

### Decode validation

- Unknown chart id → pane becomes an "unknown chart" placeholder with pick-a-replacement CTA. Other panes render.
- Date outside chart's active range → "not available for this date" state with nearest-available-date nav.
- Malformed tree → fall back to empty workspace + non-blocking toast.
- Decoding never throws to the user.

## UI interactions

### Layout chrome

```
Header: logo · workspace menu (save/load) · theme toggle · about
Sidebar: search · topic filter pills · scrollable chart list (virtualized)
Main: react-mosaic binary-tree canvas
```

### Sidebar

- Long scrollable list, all charts visible; no collapse/expand.
- Topic section headers are small-caps labels with a divider rule; not interactive.
- Topic filter pills above the list, multi-select.
- Search box filters by title + description; combines with pills via AND.
- Charts outside the focused pane's date range render in a dimmed state with a "not available for {date}" hover hint.

Click behaviours: single-click replaces focused pane's chart; shift-click splits below; alt-click splits right; middle-click opens in a new top-level split.

### Command palette (Cmd-K)

`uFuzzy` fuzzy match over:
- Chart titles and descriptions
- Topic names
- Workspace actions: save, load, close all, duplicate pane, set date…, swap panes, toggle theme, toggle sidebar

### Pane header

```
[chart title ▼]  [date ◀ YYYY-MM-DD ▶]  [related ⤢]  [split]  [×]
```

- **Chart title dropdown**: topic-grouped picker, scoped to this pane.
- **Date prev/next**: uses global `dates.json`. Disabled outside chart's active range. Clicking the date label opens a flat navigable list.
- **Related popover**: lists `chartDef.related`. Each row offers "Open here" (replace) and "Split below" (new pane beneath) with an optional "Split above."
- **Split menu**: right / below / left / above. Creates an empty pane; user picks a chart via sidebar/Cmd-K/dropdown.
- **Close**: removes the pane; sibling is promoted.

Focused pane header has a subtle accent ring.

### Context card

Below the Plotly area. Rendered from the chart module's imported markdown. Collapsed to a teaser; click to expand. Always expanded on mobile.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd-K` | Command palette |
| `Cmd-B` | Toggle sidebar |
| `Cmd-\` | Split focused pane right |
| `Cmd-Shift-\` | Split focused pane below |
| `Cmd-W` | Close focused pane |
| `Cmd-[` / `Cmd-]` | Prev / next date on focused pane |
| `Cmd-Shift-S` | Save workspace |
| `Cmd-Alt-Arrow` | Move focus to neighbour pane |

All shortcuts are discoverable via Cmd-K.

### Date cascading

- Pane's `date` is stored in the tree.
- `defaultDate` is the "last date the user set in any pane"; starts at `dates.latest`.
- New panes inherit `defaultDate` at open time.
- Changing a pane's date updates `defaultDate` for future opens only; already-open panes are not retroactively changed.
- `defaultDate` is serialised in the URL so shared links reproduce the exact cascade state.

### Mobile (< 768px)

- Pane tree flattens in-order to a linear list.
- One pane visible at a time; tab strip across the top represents siblings.
- Split actions hidden; close and swap-chart remain.
- Sidebar collapses to a drawer (hamburger). Cmd-K becomes a search icon.
- Context card always expanded.
- Multi-pane URLs still render; user lands on the first pane and tabs through others.

### Empty states

- Empty workspace (no root): "Pick a chart to begin" centred CTA with sidebar hint.
- Empty pane (split but unpicked): "Pick a chart for this pane" with inline picker.
- Unknown chart: "This chart no longer exists" + replacement CTA.
- Date out of range: "This chart doesn't cover {date}" + nearest-date link.

## Old URL migration

### URL mapping

- `/latest/{notebook_id}` → 302 to `/w/:encoded` with that notebook's charts at `dates.latest`.
- `/{YYYY}/{MM}/{DD}` → 301 to `/w/:encoded` with empty tree and `defaultDate` set to that date.
- `/{YYYY}/{MM}/{DD}/{notebook_id}` → 301 to `/w/:encoded` with the notebook's charts at that date.
- `/data/*` (parquet download) stays as-is.

### Notebook → charts preset

```ts
// worker/src/legacy.ts (shared with site/src/routes/Legacy.tsx)

export const NOTEBOOK_PRESETS = {
  'blob-inclusion':        ['blob-density-scatter', 'blob-slot-histogram', 'blob-popularity-heatmap', 'blob-slot-heatmap-vertical'],
  'blob-flow':             ['entity-blobcount-sankey', 'relay-blobcount-sankey', 'entity-relay-sankey', 'entity-relay-blobcount-sankey'],
  'column-propagation':    ['column-first-seen-heatmap', 'column-delta-heatmap', 'column-spread-timeseries'],
  'mempool-visibility':    ['hourly-coverage-lines', 'coverage-heatmap', 'age-percentile-lines', 'sentry-coverage-bar'],
  'mev-pipeline':          ['bid-vs-block-scatter', 'bid-value-vs-block', 'bidding-duration-vs-block'],
  'block-column-timing':   ['block-to-column-histogram', 'block-to-column-boxplot', 'block-to-column-timeseries', 'column-spread-boxplot-blob'],
  'propagation-anomalies': ['anomaly-regression-scatter', 'anomalies-by-relay-bar', 'anomalies-by-blobcount-bar'],
  'missed-slots':          ['missed-slots-by-entity-bar', 'entity-miss-rate-bar', 'missed-slots-hourly-bar', 'missed-slots-timeline-scatter'],
  'block-propagation-size': [
    'block-propagation-by-size', 'block-propagation-by-region',
    'corrected-vs-size-scatter', 'regional-cdf-subplots',
  ],
} as const;
```

### Preset-layout rules

- N = 1: single pane.
- N = 2: horizontal split, ratio 0.5.
- N = 3: horizontal split; right side split vertically. 0.5 / (0.5, 0.5).
- N = 4: 2×2 grid.
- N ≥ 5: 2×2 grid of the first 4 preset ids; remainder available via sidebar.

### Redirect implementation

Two layers:

1. **Site-side** (`site/src/routes/Legacy.tsx`): Vite / React Router catches old-shape paths, computes encoded state via the shared encoder, returns `<Navigate to={url} replace />` (301-style client-side).
2. **Worker-side** (`worker/src/index.ts`): for requests that miss the manifest, if the path matches `^/\d{4}/\d{2}/\d{2}(/[a-z0-9-]+)?$` or `^/latest/[a-z0-9-]+$`, compute the redirect and issue 301/302 server-side. Safety net for direct hits that bypass the SPA.

Both layers import the same `encoder.ts` + `NOTEBOOK_PRESETS` from `worker/src/legacy.ts`.

## Deployment

- `bun run build` generates `site/dist/` with code-split chunks, Arrow files, registry.json, dates.json.
- `bun run upload` (replaces `scripts/upload_r2.py`) content-addresses every file, uploads to R2, emits a new environment manifest (`manifests/main.json` or `manifests/pr-N.json`).
- Cloudflare Worker serves:
  - Any manifested path: fetch blob, stream with correct headers.
  - `**/*.arrow`: `Cache-Control: public, max-age=31536000, immutable`.
  - `**/*.js`, `**/*.css`: same (content-addressed).
  - `registry.json`, `dates.json`: `public, max-age=0, s-maxage=300, must-revalidate`.
  - HTML shell: `public, max-age=0, must-revalidate`.
  - Legacy URL regex: redirect per section above.
- CI workflow updated: `setup-bun` action (replaces `setup-python`), single `bun install` step.

## Testing strategy

### Unit (Bun test / Vitest-compatible)

- `observatory/staleness.ts`: hash stability, force flag behaviour.
- `observatory/queries/*`: schema validation round-trips on fixture rows.
- `observatory/aggregations/*`: aggregation correctness on fixture inputs.
- `site/src/workspace/state/url.ts`: round-trip encode/decode for all workspace state shapes (single pane, nested splits, maximum depth, unknown chart, out-of-range date, malformed input fallback).
- `site/src/workspace/tree/ops.ts`: pure-function invariants (split, close, focus, resize, swap); property-based tests with `fast-check` for shape preservation.
- `site/src/workspace/charts/*/*.ts`: per chart, test that `transform(fixtureTable)` produces a `dataSchema.safeParse(...).success === true`; test that `option()` returns a valid ECharts option (structural assertion).

### Integration

- `bun run fetch --date 2026-04-22 --only block_events` against a live-ish fixture ClickHouse: verify the Arrow file writes and round-trip-parses.
- End-to-end: a fixture Arrow file feeds through `fetchArrow → transform → option → Mock ECharts`. No real ECharts rendering; assertions on the `option` structure.

### Visual regression

- One fixture date's data for each chart → Playwright loads the flagship workspace, opens each chart, takes a PNG; diff against committed baselines. Run on CI. Tolerance: 0.1% pixel change.
- A gallery page (`site/src/routes/__gallery.tsx`, dev-only) mounts all charts at the latest date in a vertical grid: fast visual diff during development.

### Performance

- Playwright scripts that open a 4-pane workspace and measure `performance.mark()`s for first paint, first chart render, and date change. Asserts against the budgets in the silky-smoothness contract.

### Legacy redirect

- One HTTP integration test per redirect class verifying the `Location` header and that the target decodes back to the expected WorkspaceState.

## Phasing

Single cutover with the following internal ordering. Every step is green (types check, tests pass) before the next begins.

1. **Bun + Vite scaffold.** Create `package.json`, `tsconfig.json`, `vite.config.ts`, `justfile`. Port the existing Astro routes for `/`, `/archive`, `/about`, `/data/*` to Vite React Router pages. Deploy parity with today's site on a staging PR; no functional change.
2. **Observatory package skeleton.** Create `observatory/` with config, clickhouse, query registry, staleness. Bun test infrastructure.
3. **Query migration.** Port existing Python queries to TS. Consolidate to primary datasets (see table in the query-authoring section). Implement new aggregated queries (`col_first_seen_binned`, `block_timeline_cdf`, `region_size_matrix`, `blob_flow_edges`).
4. **Arrow pipeline.** Replace Parquet output with Arrow IPC file-format. Verify round-trip fidelity on fixture data.
5. **Chart authoring scaffold.** Implement `defineChart()`, `registerTopic()`, `PlotRenderer`, theme, context sidecar loader. One sample chart per family (scatter, line, heatmap, boxplot, sankey, density, percentile ribbon). Gallery page. Baseline visual regression.
6. **Chart migration.** Port charts topic by topic from Plotly/Altair to ECharts via `defineChart`. One PR per topic; visual-diff against Plotly reference on merge.
7. **Workspace island.** Binary tree, pane, sidebar, Cmd-K, pane header, related menu, context card, URL encoding, localStorage saves, mobile behaviour.
8. **Legacy redirect layer.** Site route + Worker rule sharing the same `legacy.ts`.
9. **Observability.** Instrumentation via Workers Analytics for redirect success rate and by-chart render latency (console counter + telemetry endpoint).
10. **Cutover commit.** Delete all Python, Astro, notebooks, papermill, nbconvert, ipykernel, altair, plotly, notebooks/templates, notebooks/data, site/rendered, pipeline.yaml queries/notebooks sections.
11. **Staging validation.** Full PR preview deploy; manually verify every redirect; open sample shared URLs across devices.
12. **Production promote.**

## Cleanup / deletion list (cutover commit)

Python side (entire ecosystem):
- `notebooks/` (all 9 `.ipynb`, `templates/`, `__pycache__/`, `loaders.py`, `plotly_theme.py`)
- `notebooks/data/` (renamed to `build/data/`)
- `queries/` (top-level, ported to `observatory/queries/`)
- `scripts/pipeline.py`, `scripts/fetch_data.py`, `scripts/render_notebooks.py`, `scripts/extract_charts.py`
- `site/rendered/` directory
- `pyproject.toml`, `uv.lock`
- All Python deps (papermill, nbconvert, ipykernel, nbformat, traitlets, altair, plotly, pandas-or-polars if unused post-migration, clickhouse-connect, pyarrow, etc.)

Site side:
- `site/astro.config.mjs`, `site/src/layouts/`, `site/src/components/NotebookEmbed.astro`, `site/src/components/CodeToggle.tsx`, `site/src/components/TableOfContents.astro`, `site/src/components/DateNav.astro`, `site/src/components/MobileNav.astro`, `site/src/components/Sidebar.astro`, `site/src/pages/[year]/[month]/[day]/`, `site/src/pages/latest/`, `site/src/lib/chart-manifest.ts`, `site/src/lib/workspace.ts`, `site/src/components/BinaryTreeLayout.tsx`, `site/src/components/ChartCell.tsx`, `site/src/components/ChartRenderer.tsx`, `site/src/components/ChartSelector.tsx`
- Astro dependency; replaced by Vite.

Config:
- `pipeline.yaml`: drop `queries:` and `notebooks:` sections; keep `dates:`, `settings:`, add `parallelism:`.

Tooling:
- `.python-version`, `pytest.ini` or Python test config.
- GitHub Actions Python setup step; replaced by `oven-sh/setup-bun@v2`.

## Risks and open items

1. **Chart migration effort.** ~60 charts to port from Plotly/Altair to ECharts. Effort is mechanical per chart (~45-90 min each based on effort scores). Phased topic-by-topic with visual-diff gates contains the risk. Estimated 5-8 engineering days of sustained work.
2. **Arrow on Cloudflare Workers.** Workers already serve static assets fine; no Arrow-specific worker logic needed. Browser Arrow decode is well-supported in modern browsers (Chrome, Safari, Firefox all ship native TypedArray + streams); no polyfill needed for our target browsers.
3. **ECharts bundle size.** Tree-shake to only the series types actually used; estimate ~230 KB gzipped for the full chart surface (scatter, line, bar, boxplot, heatmap, sankey, custom). Code-split per topic keeps the initial chunk smaller; Cmd-K's lazy chart picker doesn't force loading every topic.
4. **Data wrangling in TS.** DuckDB-WASM is the backup plan for complex aggregations that don't fit naturally in SQL. None of the identified charts need it; the existing Python notebook transforms (filter, bin, percentile, pivot) all map to ClickHouse SQL or simple TypedArray loops. If a future chart truly needs client-side SQL (e.g., crossfilter on millions of rows), DuckDB-WASM drops in behind the same `transform` API with no author-facing change.
5. **Web Worker portability.** One shared worker-pool for Arrow decode. Consider transferring `ArrayBuffer` ownership via `postMessage` transfer list to avoid copying; measure memory with dev tools on the 900k-cell case and verify no leaks.
6. **Bun in CI.** GitHub Actions `setup-bun` is first-class and stable. Cloudflare Workers dev (`wrangler`) runs fine under Bun. Verify on a stub PR before committing.
7. **Chart versioning with same id.** Two `@chart` definitions sharing an id must have non-overlapping date ranges. Build-time validation catches violations.
8. **URL length for deep workspaces.** Hash-fragment fallback triggered at 2000 chars. If users hit this regularly, the fallback is seamless; otherwise the path-segment encoding keeps shareable links clean.
9. **Visual parity during migration.** Visual regression baselines must be regenerated as each topic ports. Chart titles and axis labels may shift slightly (ECharts defaults differ from Plotly). One-time audit per topic.
10. **Context markdown bundle size.** Each topic chunk includes its charts' context markdown. For average-length prose (200-400 words per chart, 3-5 charts per topic), per-topic chunk overhead from markdown is ~5-10 KB gzipped: negligible.

## Appendix A: Chart inventory (60 charts + 3 HTML tables)

Source: stress-test enumeration across all 9 notebooks. Columns: new `chartId`, topic, ECharts primitive, key features, query dependencies, rows/day rendered.

| # | chartId | topic | ECharts primitive | Features | Queries | Rows/day |
|---|---|---|---|---|---|---|
| 1.1 | blob-density-scatter | blob-inclusion | scatter | continuous color by count | blob_events | 7200 |
| 1.2 | blob-count-stacked-epoch | blob-inclusion | bar (stacked) | ordered categorical color | blob_events | 2250 |
| 1.3 | blob-popularity-heatmap | blob-inclusion | heatmap | 2D customdata, inferno | blob_events | 2250 |
| 1.4 | blob-slot-heatmap-vertical | blob-inclusion | heatmap | reversed y-axis | blob_events | 7200 |
| 1.5 | blob-slot-heatmap-facet | blob-inclusion | heatmap + grid facets | 4-chunk horizontal layout via grid | blob_events | 7200 |
| 2.1 | entity-blobcount-sankey | blob-flow | sankey | weighted node positioning | blob_flow_edges | ~400 edges |
| 2.2 | relay-blobcount-sankey | blob-flow | sankey | | blob_flow_edges | ~150 edges |
| 2.3 | entity-relay-sankey | blob-flow | sankey | | blob_flow_edges | ~300 edges |
| 2.4 | entity-relay-blobcount-sankey | blob-flow | sankey (3-stage) | multi-level flow | blob_flow_edges | ~700 edges |
| 3.1 | column-first-seen-heatmap | column-propagation | heatmap (canvas, progressive, dataZoom) | 128 × 480 binned | col_first_seen_binned | 61,440 |
| 3.2 | column-delta-heatmap | column-propagation | heatmap | 128 × 480 binned, delta | col_first_seen_binned | 61,440 |
| 3.3 | column-normalized-heatmap | column-propagation | heatmap | 128 × 480 binned, normalized | col_first_seen_binned | 61,440 |
| 3.4 | column-spread-histogram | column-propagation | bar (binned) | 60-bin histogram | col_first_seen | ~7200 |
| 3.5 | column-spread-timeseries | column-propagation | scatter | 7200 points | col_first_seen | ~7200 |
| 3.6 | column-missing-heatmap | column-propagation | heatmap (binary) | 128 × 480 binned | col_first_seen_binned | 61,440 |
| 4.1 | coverage-stacked-bar | mempool-visibility | bar (stacked) | tx type × visibility | mempool_events | 5 |
| 4.2 | hourly-coverage-lines | mempool-visibility | line | 24 × 5 | mempool_events | 120 |
| 4.3 | tx-volume-stacked-time | mempool-visibility | bar (stacked over time) | | mempool_events | 72 |
| 4.4 | coverage-heatmap | mempool-visibility | heatmap | 5 × 24 | mempool_events | 120 |
| 4.5 | age-percentile-lines | mempool-visibility | line (log-y) | p50-p99 | mempool_events | 35 |
| 4.6 | age-histogram-facets | mempool-visibility | bar × grid facets | facet_col_wrap=2 | mempool_events | 75 |
| 4.7 | delay-percentile-lines | mempool-visibility | line (log-y) | | mempool_events | 35 |
| 4.8 | delay-histogram-facets | mempool-visibility | bar × grid facets | | mempool_events | 75 |
| 4.9 | sentry-coverage-bar | mempool-visibility | bar (horizontal) | top 15 | mempool_events | 15 |
| 5.1 | bid-trace-coverage-stacked | mev-pipeline | bar (stacked horizontal) | | block_events | ~15 |
| 5.2 | bid-vs-block-scatter | mev-pipeline | scatter | continuous color | block_events | ~7000 |
| 5.3 | bid-to-block-scatter-median | mev-pipeline | scatter + line overlay | median per blob count | block_events | ~7000 |
| 5.4 | bid-value-vs-block | mev-pipeline | scatter (log-x) | | block_events | ~7000 |
| 5.5 | bidding-duration-vs-block | mev-pipeline | scatter | | block_events | ~7000 |
| 5.6 | relay-box-by-blobbin | mev-pipeline | boxplot (grouped) | 8 × 5 | block_events | 40 boxes |
| 5.7 | blocks-by-blobcount-mev-local | mev-pipeline | boxplot (horizontal, grouped) | ~10 × 2 | block_events | 20 boxes |
| 5.8 | first-col-by-blob-mev-local | mev-pipeline | boxplot (horizontal, grouped) | | block_events | 20 boxes |
| 5.9 | last-col-by-blob-mev-local | mev-pipeline | boxplot (horizontal, grouped) | | block_events | 20 boxes |
| 5.10 | builder-density-facets | mev-pipeline | heatmap × grid facets | 9 facets 2D density | block_events | ~7000 |
| 5.11 | relay-density-facets | mev-pipeline | heatmap × grid facets | | block_events | ~7000 |
| 5.12 | bid-timing-density-outliers | mev-pipeline | heatmap + scatter overlay | 2D density + outliers | block_events | ~7000 |
| 5.13 | bid-timing-density-facets | mev-pipeline | heatmap × grid facets | per blob bin | block_events | ~7000 |
| 6.1 | block-to-column-histogram | block-column-timing | bar (overlaid) | 60 bins | block_events | ~5000 |
| 6.2 | block-to-column-boxplot | block-column-timing | boxplot (grouped) | | block_events | ~5000 |
| 6.3 | block-to-column-timeseries | block-column-timing | scatter | | block_events | ~5000 |
| 6.4 | column-spread-boxplot-blob | block-column-timing | boxplot (grouped) | | block_events | ~5000 |
| 7.1 | anomaly-regression-scatter | propagation-anomalies | line + markArea + scatter ×2 | band + regression + normals + anomalies | block_events | ~2000 + ~100 |
| 7.2 | anomalies-by-relay-bar | propagation-anomalies | bar (horizontal) | top 15 | block_events | 15 |
| 7.3 | anomalies-by-proposer-bar | propagation-anomalies | bar (horizontal) | top 15 | block_events | 15 |
| 7.4 | anomalies-by-builder-bar | propagation-anomalies | bar (horizontal) | top 15 | block_events | 15 |
| 7.5 | anomalies-by-blobcount-bar | propagation-anomalies | bar | | block_events | ~10 |
| 7.6 | anomalies-table | propagation-anomalies | TanStack Table | HTML table with Lab links | block_events | ~100 |
| 8.1 | missed-slots-by-entity-bar | missed-slots | bar (horizontal) | | block_events | ~30 |
| 8.2 | entity-miss-rate-bar | missed-slots | bar + visualMap | color by rate | block_events | ~30 |
| 8.3 | missed-slots-hourly-bar | missed-slots | bar | 24 bins | block_events | 24 |
| 8.4 | missed-slots-timeline-scatter | missed-slots | scatter (1D strip) | x-symbol markers | block_events | ~80 |
| 8.5 | missed-slots-table | missed-slots | TanStack Table | HTML table with Lab links | block_events | ~80 |
| 9.1 | size-dist-histogram | block-propagation | bar (overlaid) | 50 bins | block_size_events | ~7200 |
| 9.2 | compression-ratio-scatter | block-propagation | scatter + line + reference | 1:1 line + regression | block_size_events | ~7200 |
| 9.3 | winning-bid-histogram | block-propagation | bar (binned) | | block_events | ~5000 |
| 9.4 | building-vs-network-stacked | block-propagation | bar (stacked horizontal) | 4 buckets | block_events + block_size_events | 4 |
| 9.5 | raw-vs-corrected-box | block-propagation | boxplot | 2 boxes | block_size_events + block_events | ~5000 |
| 9.6 | corrected-vs-size-scatter | block-propagation | scatter | render ordering | block_size_events | ~7200 |
| 9.7 | corrected-by-sizebucket-box | block-propagation | boxplot (horizontal, grouped) | 2D grouping | block_size_events | ~7200 |
| 9.8 | corrected-density-by-builder | block-propagation | heatmap × 2 grid | 2-panel density | block_size_events | ~7200 |
| 9.9 | regional-corrected-box | block-propagation | boxplot (grouped × grid) | 3-way + 2-panel facet | block_region_events + block_region_contrib_events | ~25000 |
| 9.10 | regional-cdf-subplots | block-propagation | line × 4×2 grid | 8 panels × 8 lines | block_timeline_cdf | 6464 |
| 9.11 | region-winner-grouped-bar | block-propagation | bar (grouped) | | region_size_matrix | 8 |
| 9.12 | region-size-heatmap-subplots | block-propagation | heatmap × 2 grid | text overlays | region_size_matrix | 32 |
| 9.13 | spread-by-size-box | block-propagation | boxplot (horizontal, grouped) | | block_size_events | ~7200 |
| 9.14 | spread-vs-size-scatter | block-propagation | scatter | | block_size_events | ~7200 |
| 9.15 | entity-percentile-bars | block-propagation | bar + scatter ×3 overlay | P50 bar + P75/P90/P95 markers | block_events + block_size_events | 20 × 4 |
| 9.16 | top-entity-density-facets | block-propagation | heatmap × grid | 10 facets | block_events + block_size_events | ~5000 |
| 9.17 | size-residuals-scatter | block-propagation | scatter + markLine | hline at 0 | block_size_events + block_events | ~7200 |
| 9.18 | slow-blocks-table | block-propagation | TanStack Table | top 20 slow blocks | block_size_events + block_events | 20 |
| 9.19 | double-outlier-quadrant-scatter | block-propagation | scatter + 2 markLines | P90 quadrant | block_size_events + block_events | ~7200 |
| 9.20 | entity-anomaly-rate-bar | block-propagation | bar (horizontal) + markLine | 5% reference | block_events + block_size_events | 15 |

Total: **60 charts + 3 tables = 63 visualisations.** HTML tables (7.6, 8.5, 9.18) render via TanStack Table, which doesn't need ECharts.

## Appendix B: Key type definitions

```ts
// site/src/workspace/types.ts

export type Theme = 'light' | 'dark';

export type FetchStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; data: Table }
  | { kind: 'error'; status: number; message: string };

export type PaneStatus =
  | { kind: 'rendering' }
  | { kind: 'empty' }
  | { kind: 'unknown-chart' }
  | { kind: 'date-out-of-range'; nearest: string }
  | { kind: 'no-data-for-date' }
  | { kind: 'fetch-error'; message: string }
  | { kind: 'render-error'; message: string };
```

## Appendix C: ECharts series types used

Tree-shake only these:

```ts
// site/src/workspace/charts/PlotRenderer.tsx (or dedicated plotly-setup.ts)

import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import {
  BarChart, LineChart, ScatterChart, HeatmapChart,
  SankeyChart, BoxplotChart, CustomChart,
} from 'echarts/charts';
import {
  GridComponent, TooltipComponent, LegendComponent,
  VisualMapComponent, DataZoomComponent, MarkAreaComponent,
  MarkLineComponent, TitleComponent, AxisPointerComponent,
} from 'echarts/components';

echarts.use([
  CanvasRenderer,
  BarChart, LineChart, ScatterChart, HeatmapChart,
  SankeyChart, BoxplotChart, CustomChart,
  GridComponent, TooltipComponent, LegendComponent,
  VisualMapComponent, DataZoomComponent, MarkAreaComponent,
  MarkLineComponent, TitleComponent, AxisPointerComponent,
]);
```

Estimated gzipped bundle after tree-shake: ~210 KB (vs ~900 KB full ECharts).

## Appendix D: Justfile (post-migration)

```
default:
  @just --list

install:
  bun install

dev:
  bun run --cwd site dev

fetch date="":
  bun run observatory/fetch.ts {{date}}

build-manifest:
  bun run observatory/manifest.ts

build:
  bun run observatory/build.ts

check-stale:
  bun run observatory/staleness.ts --report

upload:
  bun run observatory/upload.ts

clean:
  rm -rf build site/dist

typecheck:
  bunx tsc --noEmit

lint:
  bunx eslint . --ext .ts,.tsx

test:
  bun test

test-watch:
  bun test --watch

visual:
  bunx playwright test tests/visual

verify:
  just typecheck && just lint && just test
```

## Appendix E: pipeline.yaml (post-migration)

```yaml
version: "2.0"

dates:
  mode: rolling
  rolling:
    window: 365
    start: "2025-12-03"

parallelism:
  fetch: 4
  build: 4

settings:
  network: mainnet
  timezone: UTC
  flagship_chart_id: "block-propagation-by-size"
  data_dir: "build/data"
  dist_dir: "site/dist"
```

## Appendix F: Dependencies

### Bun / CLI

- `@clickhouse/client`: ClickHouse Node client, works on Bun.
- `apache-arrow`: Arrow IPC read/write.
- `zod`: runtime schema validation.
- `yaml`: pipeline.yaml parsing.
- `p-limit`: fetch concurrency control.
- `@babel/parser`, `@babel/traverse`: chart-metadata scanner.
- `fast-glob`: file discovery.
- `aws-sdk/client-s3` or `@cloudflare/workers-types` + `wrangler`: R2 upload.

### Site

- `react`, `react-dom`
- `react-router`: routing.
- `zustand`: workspace state.
- `react-mosaic-component`: binary-tree pane layout.
- `framer-motion`: pane transitions.
- `@tanstack/react-virtual`: sidebar virtualization.
- `@tanstack/react-table`: HTML tables (7.6, 8.5, 9.18).
- `ufuzzy`: Cmd-K fuzzy search.
- `echarts` (tree-shaken; see Appendix C).
- `apache-arrow`: client Arrow decode.
- Tailwind CSS: styling.

### Dev

- `vite`, `@vitejs/plugin-react`
- `typescript` (5.x, strict mode, `noUncheckedIndexedAccess`, `noImplicitOverride`)
- `vitest` (or Bun's native test runner, Vitest-compatible)
- `@playwright/test`: visual + E2E.
- `eslint` + `@typescript-eslint` + `eslint-plugin-react` + `eslint-plugin-react-hooks`.
- `prettier`.

### Deleted

- Python: `uv`, `python`, `plotly`, `altair`, `pandas`, `pyarrow`, `clickhouse-connect`, `papermill`, `nbconvert`, `ipykernel`, `nbformat`, `traitlets`, all of `pyproject.toml`.
- Astro and all `@astrojs/*` packages.
- `ts-node`, `jest` (replaced by Bun test / Vitest).
