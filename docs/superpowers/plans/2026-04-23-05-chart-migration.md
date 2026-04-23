# Plan 05: chart migration (60 charts + 3 tables)

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended).
>
> **BEFORE STARTING, READ `docs/superpowers/plans/ERRATA.md` IN FULL.** Entries override this plan.
>
> **IF YOU DEVIATE**, append to `ERRATA.md` BEFORE marking the step complete.

**Goal:** Port every chart from the existing 9 Jupyter notebooks to a `defineChart()` module under `site/src/workspace/charts/{topic}/`. One topic per PR, visual-diffed against the legacy Plotly/Altair rendering. Three HTML tables (7.6, 8.5, 9.18) migrate to TanStack Table components.

**Architecture:** Every chart becomes a single TS module producing an ECharts `option` object. Each module declares its `queries` against the consolidated/aggregated query ids from Plans 02-03. Data is fetched as Arrow, transformed pure-functionally, rendered via the `PlotRenderer` from Plan 04.

**Tech Stack:** Plan 04 scaffold (`defineChart`, `PlotRenderer`, `fetchArrowBundle`), ECharts 6 tree-shaken, `@tanstack/react-table` for the three data tables, Zod for per-chart data schemas.

---

## Scope and non-scope

**In scope:**
- One TS module per chart listed in the inventory below.
- Context markdown file per chart (short; 2-4 sentences; faithful to the legacy captions).
- Updates to `site/src/workspace/charts/index.ts` to register every chart.
- Tests for each topic's worked example chart (the rest share the same test via a generic harness: see Task Section 00).
- Visual regression baselines per chart (committed to `site/tests/e2e/__baselines__/`).
- `@tanstack/react-table`-backed TanTable components for charts 7.6, 8.5, 9.18.

**Out of scope:**
- Workspace UI (Plan 06).
- Legacy URL redirects (Plan 07).

## Preconditions

- Plans 01-04 are merged.
- `observatory/src/queries/` contains the consolidated + aggregated queries from Plan 03 and the originally-ported queries from Plan 02.
- `bun run fetch --date <yesterday>` and `bun run manifest` both succeed.
- `build/data/<yesterday>/*.arrow` exists.

## Section 00: shared harness

### Per-chart porting procedure (repeat for every chart)

1. Create `site/src/workspace/charts/{topic}/{chart_slug}.ts` (topic is kebab-case; slug mirrors the chart id).
2. Create `site/src/workspace/charts/context/{topic}/{chart_slug}.md` with a 2-4 sentence plain-text description. Copy the spirit of the original notebook prose; do not copy long passages. No em dashes; sentence case.
3. Declare a Zod `Row` schema for each input query row. Reuse schemas already exported from Plan 02/03 query modules via `import type { BlockEventsRow } from '@/observatory/queries/block_production_events'` (note: set up the TS path aliases to cross the workspace boundary, see Task 01.1).
4. Declare a Zod `DataSchema` for the transformed data shape this chart consumes.
5. Implement `transform(raw)`: pure TS, operates on Arrow `Table` columns, returns a value that passes `DataSchema.parse`.
6. Implement `option(data, ctx)`: returns an `EChartsOption`. Use tokens from `@/workspace/charts/theme` (`LIGHT_TOKENS`) for any explicit colors; prefer the default theme palette for categorical encoding.
7. Register the chart in `site/src/workspace/charts/index.ts` (`ALL_CHARTS[chart.id] = chart`).
8. Run `bun run --cwd observatory manifest` to refresh `registry.json`.
9. Visit `/__gallery__/chart?id={chart-id}&date=<yesterday>`; visually verify.
10. Capture a Playwright baseline: `bunx playwright test --update-snapshots tests/e2e/visual-regression.spec.ts -g {chart-id}`.
11. Commit: `feat(charts): port {chart-id}`.

### Generic visual regression spec

**Files:**
- Create: `site/tests/e2e/visual-regression.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// site/tests/e2e/visual-regression.spec.ts
import { test, expect } from '@playwright/test';
import registry from '../../../build/registry.json' assert { type: 'json' };

const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const ids = Object.keys((registry as { charts: Record<string, unknown> }).charts);

for (const id of ids) {
  test(`visual ${id}`, async ({ page }) => {
    await page.goto(`/__gallery__/chart?id=${id}&date=${yesterday}`);
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500); // allow any streaming render pass to finish
    await expect(canvas).toHaveScreenshot(`${id}.png`, { maxDiffPixelRatio: 0.005 });
  });
}
```

- [ ] **Step 2: Establish initial baselines once charts exist (run after a topic completes)**

```bash
cd site && bunx playwright test --update-snapshots visual-regression
```

Baselines commit to `site/tests/e2e/visual-regression.spec.ts-snapshots/`.

- [ ] **Step 3: Commit**

```bash
git add site/tests/e2e/visual-regression.spec.ts
git commit -m "test(charts): generic visual regression harness"
```

## Section 01: blob-inclusion (5 charts)

All charts use the consolidated `blob_events` query from Plan 03.

### Inventory

| id | description | ECharts primitive | notes |
|---|---|---|---|
| `blob-density-scatter`          | Blob count per slot, continuous color | `scatter` | color by blob_count float; `symbolSize: 4`; `large: true` at 7200 pts |
| `blob-count-stacked-epoch`      | Stacked bars per epoch by blob count  | `bar (stacked)` | group by `intDiv(slot, 32)` then pivot by blob_count |
| `blob-popularity-heatmap`       | Heatmap: blob_count × epoch time      | `heatmap` | y=blob_count, x=epoch; value = count |
| `blob-slot-heatmap-vertical`    | Slot-in-epoch × epoch time            | `heatmap` | reversed y-axis, horizontal colorbar |
| `blob-slot-heatmap-facet`       | 4-chunk horizontal layout             | `heatmap × 4 grid` | use ECharts `grid[]` array, one per chunk; drop manual vlines |

### Worked example: `blob-density-scatter`

**Files:**
- Create: `site/src/workspace/charts/blob_inclusion/density_scatter.ts`
- Create: `site/src/workspace/charts/context/blob_inclusion/density_scatter.md`

- [ ] **Step 1: Context sidecar**

```markdown
<!-- site/src/workspace/charts/context/blob_inclusion/density_scatter.md -->

Blobs per slot over the day. Each point is one slot, colored by its blob count.
Gaps reveal missed slots; clusters of high blob counts coincide with heavy
rollup activity.
```

- [ ] **Step 2: Chart module**

```ts
// site/src/workspace/charts/blob_inclusion/density_scatter.ts
import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS, HUE_CYCLE } from '../theme';

const DataSchema = z.object({
  times: z.array(z.number()),     // epoch ms
  counts: z.array(z.number()),
});
type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'blob-density-scatter',
  topic: 'blob-inclusion',
  title: 'Blobs per slot',
  description: 'One point per slot, colored by blob count.',
  queries: ['blob_events'],
  related: ['blob-count-stacked-epoch', 'blob-popularity-heatmap'],
  context: () => import('../context/blob_inclusion/density_scatter.md?raw'),
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 1,
  dataSchema: DataSchema,
  transform: ({ blob_events: t }) => {
    const start = t.getChild('slot_start')?.toArray() ?? [];
    const count = t.getChild('blob_count')?.toArray() ?? [];
    const times: number[] = [];
    const counts: number[] = [];
    for (let i = 0; i < (t as Table).numRows; i++) {
      times.push(new Date(String(start[i])).getTime());
      counts.push(Number(count[i]));
    }
    return { times, counts };
  },
  option: (data) => ({
    xAxis: { type: 'time', name: 'time' },
    yAxis: { type: 'value', name: 'blobs / slot', min: 0, max: 9, interval: 1 },
    visualMap: {
      type: 'continuous', min: 0, max: 9, dimension: 1,
      inRange: { color: [LIGHT_TOKENS.accent.teal, LIGHT_TOKENS.accent.amber] },
      calculable: true, orient: 'horizontal', left: 'center', bottom: 0,
    },
    series: [{
      type: 'scatter',
      data: data.times.map((t, i) => [t, data.counts[i]]),
      symbolSize: 4,
      large: true,
      largeThreshold: 2000,
    }],
    tooltip: { trigger: 'item', formatter: (p) => `slot ${new Date((p.data as [number, number])[0]).toISOString()}: ${(p.data as [number, number])[1]} blobs` },
  }),
});
```

- [ ] **Step 3: Register, manifest, visual check**

```bash
# Append to site/src/workspace/charts/index.ts
#   import blobDensityScatter from './blob_inclusion/density_scatter';
#   ALL_CHARTS[blobDensityScatter.id] = blobDensityScatter;
cd observatory && bun run manifest
cd ../site && bun run dev   # visit /__gallery__/chart?id=blob-density-scatter&date=<yesterday>
```

- [ ] **Step 4: Commit**

```bash
git add site/src/workspace/charts/blob_inclusion/density_scatter.ts \
        site/src/workspace/charts/context/blob_inclusion/density_scatter.md \
        site/src/workspace/charts/index.ts
git commit -m "feat(charts): port blob-density-scatter"
```

### Remaining blob-inclusion charts

Apply the generic procedure from Section 00 for each:

- `blob-count-stacked-epoch`: group by epoch, bucket by blob count, `bar` series per bucket with `stack: 'total'`. Legend shows blob-count buckets.
- `blob-popularity-heatmap`: `heatmap` series; `visualMap` with `inferno`-like ramp (use `LIGHT_TOKENS.accent.amber` to deep purple).
- `blob-slot-heatmap-vertical`: y = slot_in_epoch (0..31), x = epoch time. `yAxis.inverse: true`.
- `blob-slot-heatmap-facet`: chunk epochs into 4 horizontal groups via ECharts `grid[]` with `xAxisIndex`/`yAxisIndex` per grid. Do not reproduce the vertical divider lines; the grid gap provides the visual cue.

Commit each with: `feat(charts): port <chart-id>`.

## Section 02: blob-flow (4 sankeys)

All charts use `blob_flow_edges`.

### Inventory

| id | description | primitive |
|---|---|---|
| `entity-blobcount-sankey` | proposer entity → blob count buckets | `sankey` |
| `relay-blobcount-sankey` | relay → blob count buckets | `sankey` |
| `entity-relay-sankey` | entity → relay | `sankey` |
| `entity-relay-blobcount-sankey` | 3-stage: entity → relay → blob count | `sankey` (multi-level) |

### Worked example: `entity-blobcount-sankey`

```ts
// site/src/workspace/charts/blob_flow/entity_blobcount.ts
import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';

const DataSchema = z.object({
  nodes: z.array(z.object({ name: z.string() })),
  links: z.array(z.object({ source: z.string(), target: z.string(), value: z.number() })),
});

export default defineChart({
  id: 'entity-blobcount-sankey',
  topic: 'blob-flow',
  title: 'Entity to blob count',
  description: 'Block counts per (proposing entity, blob count) pair.',
  queries: ['blob_flow_edges'],
  related: ['relay-blobcount-sankey', 'entity-relay-sankey'],
  context: () => import('../context/blob_flow/entity_blobcount.md?raw'),
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 1,
  dataSchema: DataSchema,
  transform: ({ blob_flow_edges: t }) => {
    const stage = t.getChild('stage')?.toArray() ?? [];
    const src   = t.getChild('source')?.toArray() ?? [];
    const tgt   = t.getChild('target')?.toArray() ?? [];
    const val   = t.getChild('value')?.toArray() ?? [];
    const nodes = new Set<string>();
    const links: Array<{ source: string; target: string; value: number }> = [];
    for (let i = 0; i < (t as Table).numRows; i++) {
      if (String(stage[i]) !== 'entity_to_blob') continue;
      const s = String(src[i]), d = String(tgt[i]);
      nodes.add(s); nodes.add(d);
      links.push({ source: s, target: d, value: Number(val[i]) });
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
      lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.4 },
      label: { fontFamily: 'Xray Mono, monospace', fontSize: 10 },
    }],
  }),
});
```

### Remaining blob-flow charts

- `relay-blobcount-sankey`: change `stage` filter to `'relay_to_blob'`.
- `entity-relay-sankey`: `'entity_to_relay'`.
- `entity-relay-blobcount-sankey`: `'entity_to_relay_to_blob'`; build a 3-column sankey with nodes from `source`, `intermediate`, `target`. Each row in the Arrow table becomes two links: source→intermediate and intermediate→target (deduped + summed).

## Section 03: column-propagation (6 charts)

Heatmaps use `col_first_seen_binned` (128 × ≤480 pre-aggregated). Histograms + timeseries use the raw `col_first_seen`.

### Inventory

| id | queries | primitive | notes |
|---|---|---|---|
| `column-first-seen-heatmap` | `col_first_seen_binned` | `heatmap` | canvas, `progressive: 5000`, `progressiveThreshold: 10000`, add `dataZoom` inside + slider on x |
| `column-delta-heatmap`      | `col_first_seen_binned` | `heatmap` | value = `median_ms - rowMin(median_ms)` |
| `column-normalized-heatmap` | `col_first_seen_binned` | `heatmap` | value = `(median_ms - rowMin) / (rowMax - rowMin)` |
| `column-spread-histogram`   | `col_first_seen`        | `bar (binned)` | client-side 60-bin histogram |
| `column-spread-timeseries`  | `col_first_seen`        | `scatter` | 7200 pts |
| `column-missing-heatmap`    | `col_first_seen_binned` | `heatmap` | boolean from `missing_count > 0` |

### Worked example: `column-first-seen-heatmap`

```ts
// site/src/workspace/charts/column_propagation/first_seen_heatmap.ts
import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';

const Cell = z.tuple([z.number().int(), z.number().int(), z.number().nullable()]);
const DataSchema = z.object({
  cols: z.array(z.string()),
  buckets: z.array(z.string()),
  cells: z.array(Cell),
});

export default defineChart({
  id: 'column-first-seen-heatmap',
  topic: 'column-propagation',
  title: 'Column first-seen heatmap',
  description: 'Median first-seen ms per column per 5-minute bucket.',
  queries: ['col_first_seen_binned'],
  related: ['column-delta-heatmap', 'column-normalized-heatmap', 'column-missing-heatmap'],
  context: () => import('../context/column_propagation/first_seen_heatmap.md?raw'),
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 1,
  dataSchema: DataSchema,
  transform: ({ col_first_seen_binned: t }) => {
    const col = t.getChild('column_index')?.toArray() ?? [];
    const bkt = t.getChild('time_bucket')?.toArray() ?? [];
    const med = t.getChild('median_ms')?.toArray() ?? [];
    const cells: [number, number, number | null][] = [];
    for (let i = 0; i < (t as Table).numRows; i++) {
      const v = med[i] as unknown;
      cells.push([Number(col[i]), Number(bkt[i]), v == null ? null : Number(v)]);
    }
    return {
      cols: Array.from({ length: 128 }, (_, i) => String(i)),
      buckets: Array.from({ length: 480 }, (_, i) => String(i)),
      cells,
    };
  },
  option: (data) => ({
    tooltip: { position: 'top' },
    grid: { left: 48, right: 16, top: 24, bottom: 64 },
    xAxis: { type: 'category', data: data.buckets, splitArea: { show: false }, name: '5-min bucket' },
    yAxis: { type: 'category', data: data.cols,    splitArea: { show: false }, name: 'column index' },
    visualMap: {
      min: 0, max: 12000, calculable: true, orient: 'horizontal', left: 'center', bottom: 12,
      inRange: { color: ['#050510', '#f5efa8'] },
    },
    dataZoom: [{ type: 'inside', xAxisIndex: 0 }, { type: 'slider', xAxisIndex: 0, height: 12 }],
    series: [{
      type: 'heatmap',
      data: data.cells,
      progressive: 5000,
      progressiveThreshold: 10000,
      emphasis: { itemStyle: { borderColor: 'var(--fg)', borderWidth: 1 } },
    }],
  }),
});
```

### Remaining column-propagation charts

- `column-delta-heatmap`: in `transform`, compute per-column (row) minimum across time buckets and store `median_ms - rowMin`. Visual map range from 0 to observed max.
- `column-normalized-heatmap`: same as delta but normalize to [0, 1] per row.
- `column-spread-histogram`: client-side bin `max(first_seen_ms) - min(first_seen_ms)` per slot across 128 columns; 60 bins; `bar` series.
- `column-spread-timeseries`: scatter of per-slot spread over time; `symbolSize: 4`, `large: true`.
- `column-missing-heatmap`: boolean presence; `visualMap.type: 'piecewise'`, two colors.

## Section 04: mempool-visibility (9 charts)

All charts use `mempool_events`.

### Inventory

| id | primitive | notes |
|---|---|---|
| `coverage-stacked-bar` | `bar (stacked)` | 5 tx types × (before/after/never) |
| `hourly-coverage-lines` | `line` | coverage % per hour per tx type |
| `tx-volume-stacked-time` | `bar (stacked)` | hourly totals by visibility |
| `coverage-heatmap` | `heatmap` | 5 × 24 tx_type × hour |
| `age-percentile-lines` | `line` (log-y) | p50-p99 age per tx type |
| `age-histogram-facets` | `bar × grid facets` | 5-way facet across tx types |
| `delay-percentile-lines` | `line` (log-y) | p50-p99 delay |
| `delay-histogram-facets` | `bar × grid facets` | |
| `sentry-coverage-bar` | `bar (horizontal)` | top 15 by coverage % (uses grouped aggregate on `sentry`) |

### Worked example: `hourly-coverage-lines`

```ts
// site/src/workspace/charts/mempool_visibility/hourly_coverage_lines.ts
import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';

const TX_TYPES = ['legacy', 'eip2930', 'eip1559', 'blob', 'setcode'] as const;
type TxType = (typeof TX_TYPES)[number];

const DataSchema = z.object({
  hours: z.array(z.number().int().min(0).max(23)),
  byType: z.record(z.enum(TX_TYPES), z.array(z.number())),
});

export default defineChart({
  id: 'hourly-coverage-lines',
  topic: 'mempool-visibility',
  title: 'Hourly mempool coverage',
  description: 'Fraction of transactions seen in the mempool before block inclusion, per hour per tx type.',
  queries: ['mempool_events'],
  related: ['coverage-stacked-bar', 'coverage-heatmap'],
  context: () => import('../context/mempool_visibility/hourly_coverage_lines.md?raw'),
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 2,
  dataSchema: DataSchema,
  transform: ({ mempool_events: t }) => {
    const type = t.getChild('tx_type')?.toArray() ?? [];
    const vis  = t.getChild('visibility')?.toArray() ?? [];
    const start = t.getChild('slot_start')?.toArray() ?? [];
    const totals: Record<TxType, number[]>  = Object.fromEntries(TX_TYPES.map((k) => [k, Array(24).fill(0)])) as any;
    const seen:   Record<TxType, number[]>  = Object.fromEntries(TX_TYPES.map((k) => [k, Array(24).fill(0)])) as any;
    for (let i = 0; i < (t as Table).numRows; i++) {
      const h = new Date(String(start[i])).getUTCHours();
      const k = String(type[i]) as TxType;
      if (!TX_TYPES.includes(k)) continue;
      totals[k][h]!++;
      if (String(vis[i]) === 'before') seen[k][h]!++;
    }
    const byType = Object.fromEntries(
      TX_TYPES.map((k) => [k, totals[k].map((tot, i) => tot === 0 ? 0 : (seen[k][i] ?? 0) / tot)]),
    ) as Record<TxType, number[]>;
    return { hours: Array.from({ length: 24 }, (_, i) => i), byType };
  },
  option: (data) => ({
    legend: { top: 0 },
    xAxis: { type: 'category', data: data.hours, name: 'hour (UTC)' },
    yAxis: { type: 'value', name: 'coverage', min: 0, max: 1, axisLabel: { formatter: (v: number) => `${(v * 100).toFixed(0)}%` } },
    series: TX_TYPES.map((k) => ({
      name: k, type: 'line' as const, data: data.byType[k], symbolSize: 4, smooth: false,
    })),
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => `${(v * 100).toFixed(1)}%` },
  }),
});
```

### Remaining mempool charts

Apply the generic procedure. Key shortcuts:

- `coverage-stacked-bar`: aggregate (tx_type × visibility) counts; three stacked `bar` series.
- `tx-volume-stacked-time`: hourly totals; three `bar` series stacked by visibility.
- `coverage-heatmap`: 5 × 24 matrix; `heatmap` series.
- `age-percentile-lines`, `delay-percentile-lines`: compute per-tx-type (p50, p75, p90, p95, p99); log-y axis; seven `line` series.
- `age-histogram-facets`, `delay-histogram-facets`: 5 grids (one per tx type); bar series per grid.
- `sentry-coverage-bar`: top 15 by coverage %, horizontal `bar`.

## Section 05: mev-pipeline (13 charts)

All from `block_events`.

### Inventory

| id | primitive | notes |
|---|---|---|
| `bid-trace-coverage-stacked`     | `bar (stacked horizontal)` | per-relay two-stack |
| `bid-vs-block-scatter`           | `scatter` | color by blob_count float, 7000 pts |
| `bid-to-block-scatter-median`    | `scatter + line` | scatter + medians per blob count overlay |
| `bid-value-vs-block`             | `scatter` (log-x on x-axis) | |
| `bidding-duration-vs-block`      | `scatter` | |
| `relay-box-by-blobbin`           | `boxplot (grouped)` | 8 relays × blob bins |
| `blocks-by-blobcount-mev-local`  | `boxplot (horizontal grouped)` | 10 blob bins × 2 types |
| `first-col-by-blob-mev-local`    | `boxplot (horizontal grouped)` | |
| `last-col-by-blob-mev-local`     | `boxplot (horizontal grouped)` | |
| `builder-density-facets`         | `heatmap × 9 grids` | 9 builders × 2D density |
| `relay-density-facets`           | `heatmap × 9 grids` | 9 relays |
| `bid-timing-density-outliers`    | `heatmap + scatter overlay` | density + P95 outliers |
| `bid-timing-density-facets`      | `heatmap × grids per blob bin` | |

### Worked example: `bid-vs-block-scatter`

```ts
// site/src/workspace/charts/mev_pipeline/bid_vs_block_scatter.ts
import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';

const DataSchema = z.object({
  points: z.array(z.tuple([z.number(), z.number(), z.number()])),   // [bid_ms, block_ms, blob_count]
});

export default defineChart({
  id: 'bid-vs-block-scatter',
  topic: 'mev-pipeline',
  title: 'Winning bid ms vs first-seen ms',
  description: 'Per-slot comparison of when the winning bid landed versus when the block was first observed.',
  queries: ['block_events'],
  related: ['bid-to-block-scatter-median'],
  context: () => import('../context/mev_pipeline/bid_vs_block_scatter.md?raw'),
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 2,
  dataSchema: DataSchema,
  transform: ({ block_events: t }) => {
    const slot = t.getChild('slot')?.toArray() ?? [];
    const type = t.getChild('event_type')?.toArray() ?? [];
    const lat  = t.getChild('latency_ms')?.toArray() ?? [];
    const blobs = t.getChild('blob_count')?.toArray() ?? [];
    // Join bid_winning and block_arrival events on slot.
    const winningMs = new Map<number, number>();
    const arrivalMs = new Map<number, number>();
    const blobBySlot = new Map<number, number>();
    for (let i = 0; i < (t as Table).numRows; i++) {
      const s = Number(slot[i]);
      if (String(type[i]) === 'bid_winning') winningMs.set(s, Number(lat[i]));
      if (String(type[i]) === 'block_arrival') {
        arrivalMs.set(s, Number(lat[i]));
        blobBySlot.set(s, Number(blobs[i]));
      }
    }
    const points: [number, number, number][] = [];
    for (const [s, w] of winningMs) {
      const a = arrivalMs.get(s);
      if (a == null) continue;
      points.push([w, a, blobBySlot.get(s) ?? 0]);
    }
    return { points };
  },
  option: (data) => ({
    xAxis: { type: 'value', name: 'winning bid ms' },
    yAxis: { type: 'value', name: 'block first-seen ms' },
    visualMap: {
      type: 'continuous', dimension: 2, min: 0, max: 9,
      inRange: { color: ['#2e7f92', '#b8872e'] },
      calculable: true, orient: 'horizontal', left: 'center', bottom: 0,
    },
    series: [{
      type: 'scatter', data: data.points, symbolSize: 4, large: true, largeThreshold: 2000,
    }],
    tooltip: { trigger: 'item' },
  }),
});
```

### Remaining mev-pipeline charts

- Boxplots (5.6-5.9): use ECharts `boxplot` series. For grouped boxes, supply `data: [[min,q1,median,q3,max], ...]` arrays in order; use `xAxis.data` for categories; set `itemStyle.color` per series for MEV vs Local.
- `bid-to-block-scatter-median`: scatter series + one `line` series with per-blob-count medians computed client-side.
- `bid-value-vs-block`: `xAxis.type: 'log'` for bid value.
- Density facets: compute 2D histogram counts per (builder, x_bin, y_bin) using client-side binning; render one `grid[]` entry per builder; one `heatmap` series per grid.
- `bid-timing-density-outliers`: heatmap series + scatter series layered on the same grid; outlier scatter uses `itemStyle.color: '#ef4444'`.

## Section 06: block-column-timing (4 charts)

Queries: `block_events`.

| id | primitive |
|---|---|
| `block-to-column-histogram` | `bar (overlaid)`: two series (MEV vs Local), 60 bins each |
| `block-to-column-boxplot`   | `boxplot (grouped)` by blob_count × is_mev |
| `block-to-column-timeseries` | `scatter` colored by blob_count |
| `column-spread-boxplot-blob` | `boxplot (grouped)` |

Generic procedure applies; use the same client-side joining as `bid-vs-block-scatter` to stitch `block_arrival` to `last_column_seen` per slot.

## Section 07: propagation-anomalies (5 charts + 1 table)

Queries: `block_events`.

| id | primitive |
|---|---|
| `anomaly-regression-scatter` | `line` (regression) + `markArea` (band) + 2 × `scatter` (normals, anomalies) |
| `anomalies-by-relay-bar` | `bar (horizontal)`, top 15 |
| `anomalies-by-proposer-bar` | `bar (horizontal)`, top 15 |
| `anomalies-by-builder-bar` | `bar (horizontal)`, top 15 |
| `anomalies-by-blobcount-bar` | `bar` |
| `anomalies-table` | TanStack Table |

### HTML table special case: `anomalies-table`

Tables do NOT go through `defineChart`. Instead, define them in `site/src/workspace/tables/` with a parallel `defineTable()` helper. This keeps the chart registry chart-only.

**Files:**
- Create: `site/src/workspace/tables/define.ts`
- Create: `site/src/workspace/tables/propagation_anomalies/anomalies_table.tsx`

```ts
// site/src/workspace/tables/define.ts
import type { ColumnDef } from '@tanstack/react-table';

export type TableDef<Row> = {
  id: string;
  topic: string;
  title: string;
  description: string;
  queries: readonly string[];
  related?: readonly string[];
  context?: () => Promise<{ default: string }>;
  activeFrom: string;
  activeTo: string | null;
  order?: number;
  columns: ColumnDef<Row, unknown>[];
  rows: (raw: Record<string, unknown>) => Row[];     // raw is the Arrow bundle
};

export function defineTable<Row>(def: TableDef<Row>): TableDef<Row> {
  return def;
}
```

Install TanStack Table:

```bash
cd site && bun add @tanstack/react-table
```

Write the anomalies table:

```tsx
// site/src/workspace/tables/propagation_anomalies/anomalies_table.tsx
import type { Table } from 'apache-arrow';
import { defineTable } from '../define';

type Row = {
  slot: number;
  latency: number;
  expected: number;
  relay: string;
  builder: string;
  blobCount: number;
  link: string;
};

export default defineTable<Row>({
  id: 'anomalies-table',
  topic: 'propagation-anomalies',
  title: 'Anomaly detail',
  description: 'Per-slot list of propagation anomalies with drill-through links.',
  queries: ['block_events'],
  related: ['anomaly-regression-scatter'],
  context: () => import('../../charts/context/propagation_anomalies/anomalies_table.md?raw'),
  activeFrom: '2025-12-03',
  activeTo: null,
  columns: [
    { accessorKey: 'slot', header: 'slot', cell: (c) => c.getValue<number>() },
    { accessorKey: 'latency', header: 'latency (ms)' },
    { accessorKey: 'expected', header: 'expected' },
    { accessorKey: 'relay', header: 'relay' },
    { accessorKey: 'builder', header: 'builder' },
    { accessorKey: 'blobCount', header: 'blobs' },
    {
      id: 'link', header: '', cell: (c) => {
        const slot = c.row.original.slot;
        return <a className="underline" href={`https://lab.ethpandaops.io/ethereum/slots/${slot}`} target="_blank" rel="noreferrer">view</a>;
      },
    },
  ],
  rows: ({ block_events }: { block_events: Table }) => {
    // Filter anomalies client-side using the same criterion the notebook used
    // (e.g. latency > P95 for its blob_count bucket). Return the top 100 slots.
    // See the legacy notebook for exact threshold; replicate here.
    const rows: Row[] = [];
    // ...transform block_events into rows...
    return rows;
  },
});
```

The rendering component `site/src/workspace/tables/TableRenderer.tsx` mounts TanStack Table with the same styling constraints (mono font, 1px borders, no radii).

## Section 08: missed-slots (4 charts + 1 table)

Queries: `block_events`.

| id | primitive |
|---|---|
| `missed-slots-by-entity-bar` | `bar (horizontal)` |
| `entity-miss-rate-bar` | `bar (horizontal)` + `visualMap` color |
| `missed-slots-hourly-bar` | `bar` |
| `missed-slots-timeline-scatter` | `scatter` (1D strip, x-symbols) |
| `missed-slots-table` | TanStack Table |

## Section 09: block-propagation (20 charts + 1 table)

The largest topic; uses multiple queries.

### Inventory

| id | queries | primitive |
|---|---|---|
| `size-dist-histogram` | `block_events` | `bar (overlaid)` |
| `compression-ratio-scatter` | `block_events` | `scatter + line + line` (1:1 + regression) |
| `winning-bid-histogram` | `block_events` | `bar (binned)` |
| `building-vs-network-stacked` | `block_events` | `bar (stacked horizontal)` |
| `raw-vs-corrected-box` | `block_events` | `boxplot` |
| `corrected-vs-size-scatter` | `block_events` | `scatter` |
| `corrected-by-sizebucket-box` | `block_events` | `boxplot (grouped horizontal)` |
| `corrected-density-by-builder` | `block_events` | `heatmap × 2 grids` |
| `regional-corrected-box` | `block_region_events` + `block_region_contrib_events` | `boxplot (grouped × grid)` |
| `regional-cdf-subplots` | `block_timeline_cdf` | `line × 4x2 grid` |
| `region-winner-grouped-bar` | `region_size_matrix` | `bar (grouped)` |
| `region-size-heatmap-subplots` | `region_size_matrix` | `heatmap × 2 grids` |
| `spread-by-size-box` | `block_events` | `boxplot (grouped horizontal)` |
| `spread-vs-size-scatter` | `block_events` | `scatter` |
| `entity-percentile-bars` | `block_events` | `bar + scatter × 3 overlay` |
| `top-entity-density-facets` | `block_events` | `heatmap × 10 grids` |
| `size-residuals-scatter` | `block_events` | `scatter + markLine` |
| `double-outlier-quadrant-scatter` | `block_events` | `scatter + 2 markLines` |
| `entity-anomaly-rate-bar` | `block_events` | `bar (horizontal) + markLine` |
| `slow-blocks-table` | `block_events` | TanStack Table |

`region-winner-grouped-bar` is already implemented (Plan 04 Task 11); mark it done here and move on.

### Worked example: `regional-cdf-subplots`

This is the chart the `block_timeline_cdf` aggregation was built for. 4 × 2 = 8 grids; 8 line series per grid; dashed for contributoor, solid for sentry.

```ts
// site/src/workspace/charts/block_propagation/regional_cdf_subplots.ts
import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';

const REGIONS = ['eu-west', 'eu-east', 'us-east', 'us-west'] as const;
const SIZES   = ['tiny', 'small', 'medium', 'large'] as const;
const BUILDERS = ['mev', 'local'] as const;
const SOURCES  = ['sentry', 'contributoor'] as const;

type Region = (typeof REGIONS)[number];
type Size   = (typeof SIZES)[number];

const Series = z.object({
  region: z.enum(REGIONS),
  source: z.enum(SOURCES),
  size:   z.enum(SIZES),
  builder: z.enum(BUILDERS),
  xs: z.array(z.number()),   // percentiles 0..100
  ys: z.array(z.number()),   // ms
});

const DataSchema = z.object({ series: z.array(Series) });

export default defineChart({
  id: 'regional-cdf-subplots',
  topic: 'block-propagation',
  title: 'Regional propagation CDFs',
  description: 'Per-region CDFs split by size bucket, builder type, and observation source.',
  queries: ['block_timeline_cdf'],
  related: ['regional-corrected-box', 'region-size-heatmap-subplots'],
  context: () => import('../context/block_propagation/regional_cdf_subplots.md?raw'),
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 10,
  dataSchema: DataSchema,
  transform: ({ block_timeline_cdf: t }) => {
    const region  = t.getChild('region')?.toArray() ?? [];
    const source  = t.getChild('source')?.toArray() ?? [];
    const size    = t.getChild('size_bucket')?.toArray() ?? [];
    const builder = t.getChild('builder_type')?.toArray() ?? [];
    const pct     = t.getChild('percentile')?.toArray() ?? [];
    const val     = t.getChild('value_ms')?.toArray() ?? [];
    const map = new Map<string, { xs: number[]; ys: number[]; meta: z.infer<typeof Series> }>();
    for (let i = 0; i < (t as Table).numRows; i++) {
      const k = `${region[i]}|${source[i]}|${size[i]}|${builder[i]}`;
      const entry = map.get(k) ?? {
        xs: [], ys: [],
        meta: {
          region: String(region[i]) as Region,
          source: String(source[i]) as 'sentry' | 'contributoor',
          size:   String(size[i]) as Size,
          builder: String(builder[i]) as 'mev' | 'local',
          xs: [], ys: [],
        },
      };
      entry.xs.push(Number(pct[i]));
      entry.ys.push(Number(val[i]));
      map.set(k, entry);
    }
    return {
      series: [...map.values()].map(({ xs, ys, meta }) => ({ ...meta, xs, ys })),
    };
  },
  option: (data) => {
    // 4 x 2 grid: rows = regions, cols = size buckets (picking 2 size buckets per chart).
    // To keep a single 4x2 grid simple, we show ALL 4 sizes on the x-axis by stacking
    // per-size series with a shared legend, and face rows by region. If the notebook
    // used 4x2 as regions x sources, follow that instead: adjust here.
    // For clarity, render 4 rows (regions) x 2 columns (sources):
    const grids = REGIONS.flatMap((_region, rIdx) =>
      SOURCES.map((_src, sIdx) => ({
        top: `${4 + rIdx * 24}%`, bottom: `${76 - rIdx * 24}%`,
        left: `${sIdx === 0 ? 6 : 52}%`, right: `${sIdx === 0 ? 52 : 6}%`,
      })),
    );
    const xAxes = grids.map((_, i) => ({ type: 'value' as const, gridIndex: i, min: 0, max: 100 }));
    const yAxes = grids.map((_, i) => ({ type: 'value' as const, gridIndex: i, name: i % 2 === 0 ? 'ms' : '', nameGap: 30 }));

    const series = data.series.map((s) => {
      const r = REGIONS.indexOf(s.region);
      const c = SOURCES.indexOf(s.source);
      const gIdx = r * SOURCES.length + c;
      return {
        type: 'line' as const, gridIndex: gIdx, xAxisIndex: gIdx, yAxisIndex: gIdx,
        data: s.xs.map((x, i) => [x, s.ys[i]]),
        name: `${s.size}/${s.builder}`,
        showSymbol: false,
        lineStyle: { type: (s.builder === 'local' ? 'dashed' : 'solid') },
      };
    });

    return {
      legend: { top: 0 },
      tooltip: { trigger: 'axis' },
      grid: grids,
      xAxis: xAxes,
      yAxis: yAxes,
      series,
    };
  },
});
```

### Remaining block-propagation charts

Apply the generic procedure; most of these are straightforward scatter/bar/heatmap/boxplot variants already covered. For tables (`slow-blocks-table`), use `defineTable` per Section 07.

## Per-topic PR gate

For each topic:

- [ ] All charts in the topic ported.
- [ ] `bun run --cwd observatory manifest` succeeds.
- [ ] `/__gallery__/chart` renders each chart at yesterday's date.
- [ ] Visual regression baselines committed (`bunx playwright test --update-snapshots`).
- [ ] `bun run test:e2e visual-regression` passes green.
- [ ] PR open, reviewed, merged.

## Self-review checklist (all topics complete)

- [ ] 60 chart modules exist under `site/src/workspace/charts/{topic}/`.
- [ ] Each chart has a context markdown sidecar.
- [ ] `site/src/workspace/charts/index.ts` exports all 60 (`ALL_CHARTS[id] = chart`).
- [ ] `build/registry.json` lists 60 chart entries, 9 topics, no duplicates.
- [ ] 3 HTML tables live under `site/src/workspace/tables/`.
- [ ] Visual regression baselines committed for every chart + table.
- [ ] All tests green on CI.
- [ ] No chart module imports Plotly or Altair. (grep: `grep -rE "plotly|altair" site/src/workspace`)
- [ ] Every chart has `activeFrom` set to `"2025-12-03"` unless the query only supports a later start.
- [ ] ERRATA entries for any chart whose query dependencies had to be renamed, extended, or replaced.

## Done condition

Plans 05 PRs all merged. Every chart renders via `defineChart` + ECharts + Arrow; the `/__gallery__/chart` route demos any chart for any date. Next: Plan 06 builds the workspace UI that composes these charts into user-driven layouts.
