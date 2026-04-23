# Plan 04: chart authoring scaffold

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`.
>
> **BEFORE STARTING, READ `docs/superpowers/plans/ERRATA.md` IN FULL.** Entries override this plan.
>
> **IF YOU DEVIATE**, append to `ERRATA.md` BEFORE marking the step complete.

**Goal:** Build the infrastructure that turns a `defineChart({...})` module into a rendered ECharts chart in the browser. Produce `registry.json` + `dates.json` at build time, fetch Arrow data in a Web Worker, render via a single shared ECharts bundle, and prove the whole loop with one worked chart.

**Architecture:** `defineChart()` returns a typed, immutable object with `id`, metadata, `dataSchema`, `transform`, and `option`. A `charts/index.ts` auto-imports every chart module. At build time, a Bun CLI (`observatory/src/manifest.ts`) walks those modules, extracts metadata via Babel, and emits `registry.json` (small) plus `dates.json`. At runtime, the workspace (Plan 06) passes a chart id + date to a pane; the pane looks up the chart module via dynamic import, fetches its Arrow dependencies in a Web Worker, runs `transform` + `option`, and mounts them into an ECharts canvas renderer.

**Tech Stack:** ECharts 6 (tree-shaken imports), React 19, Vite `?raw` markdown imports, Web Worker, Apache Arrow (client-side decode). Tests: Vitest + a small Playwright route-level smoke.

---

## Scope and non-scope

**In scope:**
- `site/src/workspace/charts/define.ts` + `types.ts`.
- `site/src/workspace/charts/topics.ts`.
- `site/src/workspace/charts/theme.ts` (ECharts theme JSON).
- `site/src/workspace/charts/PlotRenderer.tsx` + `echarts-setup.ts` (tree-shaken registration).
- `site/src/workspace/data/` (fetcher, worker, cache, registry loader, types).
- `observatory/src/manifest.ts` CLI: scan charts/, emit registry.json + dates.json.
- One worked chart end-to-end (pick `region-winner-grouped-bar`; smallest data, proves the loop).
- `site/src/__gallery__/Chart.tsx` route displays the sample chart for a chosen date.
- Unit tests: defineChart typing, theme shape, ECharts mount/unmount, worker memoisation, registry scan.
- Playwright: visit the gallery chart route, confirm a `<canvas>` renders with non-zero dimensions.

**Out of scope:**
- All charts other than the one worked example (Plan 05).
- Workspace UI, pane tree, URL encoding (Plan 06).
- Legacy URL redirects (Plan 07).

## File structure

```
site/src/workspace/
├── charts/
│   ├── define.ts                 # defineChart() helper + ChartDef type
│   ├── types.ts                  # ChartContext, ChartData, shared types
│   ├── topics.ts                 # TOPIC_REGISTRY
│   ├── theme.ts                  # ECharts theme JSON (light)
│   ├── echarts-setup.ts          # echarts.use([...]) with tree-shaken imports
│   ├── PlotRenderer.tsx          # React wrapper that mounts an ECharts instance
│   ├── index.ts                  # Auto-imports every chart module
│   └── block_propagation/
│       └── region_winner_grouped_bar.ts   # Sample chart (Plan 05 adds all others)
├── data/
│   ├── registry.ts               # Typed registry.json loader
│   ├── dates.ts                  # Typed dates.json loader
│   ├── fetcher.ts                # fetchArrow(queryId, date) API surface
│   ├── cache.ts                  # in-memory promise memoisation
│   ├── worker.ts                 # Web Worker source (Arrow decode)
│   └── types.ts                  # QueryRowTypes, shared types
└── __gallery__/
    └── Chart.tsx                 # Dev-only route: /__gallery__/chart?id=...&date=...

observatory/src/
├── manifest.ts                   # CLI entry: write registry.json + dates.json
└── scanner.ts                    # Babel-based defineChart metadata extractor

site/src/routes/
└── (unchanged; gallery routes live under __gallery__)

build/
├── registry.json                 # emitted by manifest CLI
├── dates.json                    # emitted by manifest CLI
└── data/{date}/{query_id}.arrow  # from Plan 02/03
```

---

## Task 01: types and `defineChart` helper

**Files:**
- Create: `site/src/workspace/charts/types.ts`
- Create: `site/src/workspace/charts/define.ts`

- [ ] **Step 1: Write `types.ts`**

```ts
import type { EChartsOption } from 'echarts';
import type { Table } from 'apache-arrow';
import type { z } from 'zod';

export type ChartContext = {
  date: string;          // ISO YYYY-MM-DD
  isDark: boolean;
};

export type QueryMap = Record<string, Table>;

export type ChartDef<
  Queries extends readonly string[] = readonly string[],
  Data = unknown,
> = {
  id: string;
  topic: string;
  title: string;
  description: string;
  queries: Queries;
  related?: readonly string[];
  context?: () => Promise<{ default: string }>;    // Vite ?raw lazy import
  activeFrom: string;                              // YYYY-MM-DD
  activeTo: string | null;
  order?: number;
  dataSchema: z.ZodType<Data>;
  transform: (raw: QueryMap) => Data;
  option: (data: Data, ctx: ChartContext) => EChartsOption;
};
```

- [ ] **Step 2: Write `define.ts`**

```ts
import type { ChartDef } from './types';

export function defineChart<
  Queries extends readonly string[],
  Data,
>(def: ChartDef<Queries, Data>): ChartDef<Queries, Data> {
  return def;
}
```

- [ ] **Step 3: Commit**

```bash
git add site/src/workspace/charts/types.ts site/src/workspace/charts/define.ts
git commit -m "feat(workspace): defineChart() helper + types"
```

## Task 02: topic registry

**Files:**
- Create: `site/src/workspace/charts/topics.ts`

- [ ] **Step 1: Write**

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

export function sortedTopics(): readonly TopicDef[] {
  return Object.values(TOPIC_REGISTRY).sort((a, b) => a.order - b.order);
}
```

- [ ] **Step 2: Commit**

```bash
git add site/src/workspace/charts/topics.ts
git commit -m "feat(workspace): topic registry"
```

## Task 03: ECharts theme

**Files:**
- Create: `site/src/workspace/charts/theme.ts`

- [ ] **Step 1: Write** (tokens mirror `.impeccable.md`)

```ts
// site/src/workspace/charts/theme.ts
import type { EChartsOption } from 'echarts';

export const LIGHT_TOKENS = {
  bg0:     '#f4f0e8',
  bg1:     '#e8e3d8',
  border:  '#d0c9ba',
  muted:   '#7a7165',
  fg:      '#2c2822',
  hi:      '#1a1714',
  accent: {
    amber:  '#b8872e',
    teal:   '#2e7f92',
    green:  '#4d8a32',
    purple: '#8b4fa0',
  },
  palette: (hue: number, lightness = 38): string => `hsl(${hue}, 50%, ${lightness}%)`,
} as const;

export const HUE_CYCLE = [
  30, 195, 275, 140, 100, 55, 335, 15, 175, 240,
  70, 305, 160, 210, 120, 350, 45, 185, 260, 90, 5, 225,
];

export function observatoryThemeLight(): EChartsOption {
  const t = LIGHT_TOKENS;
  return {
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'Xray Mono, monospace', color: t.fg, fontSize: 12 },
    title: {
      textStyle: { fontFamily: 'Xray Mono, monospace', color: t.hi, fontSize: 13, fontWeight: 700 },
    },
    legend: { textStyle: { color: t.fg, fontFamily: 'Xray Mono, monospace', fontSize: 10 } },
    tooltip: {
      backgroundColor: t.bg1,
      borderColor: t.border,
      borderWidth: 1,
      textStyle: { color: t.fg, fontFamily: 'Xray Mono, monospace', fontSize: 12 },
      extraCssText: 'border-radius:0; box-shadow:none;',
    },
    color: [t.accent.amber, t.accent.teal, t.accent.green, t.accent.purple,
            ...HUE_CYCLE.slice(4).map((h) => t.palette(h))],
    grid: { top: 32, right: 16, bottom: 32, left: 48, containLabel: true },
    xAxis: {
      axisLine:  { lineStyle: { color: t.border } },
      axisTick:  { lineStyle: { color: t.border } },
      axisLabel: { color: t.muted, fontSize: 10 },
      splitLine: { show: true, lineStyle: { color: t.border, opacity: 0.35 } },
      nameTextStyle: { color: t.muted, fontSize: 10 },
    },
    yAxis: {
      axisLine:  { lineStyle: { color: t.border } },
      axisTick:  { lineStyle: { color: t.border } },
      axisLabel: { color: t.muted, fontSize: 10 },
      splitLine: { show: true, lineStyle: { color: t.border, opacity: 0.35 } },
      nameTextStyle: { color: t.muted, fontSize: 10 },
    },
    visualMap: {
      textStyle: { color: t.fg, fontFamily: 'Xray Mono, monospace' },
    },
    dataZoom: [
      { type: 'inside' },
      { type: 'slider', borderColor: t.border, backgroundColor: t.bg1, fillerColor: 'rgba(0,0,0,0.08)' },
    ],
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add site/src/workspace/charts/theme.ts
git commit -m "feat(workspace): echarts light theme derived from design tokens"
```

## Task 04: ECharts tree-shaken setup

**Files:**
- Create: `site/src/workspace/charts/echarts-setup.ts`
- Modify: `site/package.json` (add `echarts` dependency)

- [ ] **Step 1: Add echarts**

```bash
cd site && bun add echarts
```

- [ ] **Step 2: Write `echarts-setup.ts`**

```ts
import * as echarts from 'echarts/core';
import {
  BarChart, LineChart, ScatterChart, HeatmapChart,
  SankeyChart, BoxplotChart, CustomChart,
} from 'echarts/charts';
import {
  GridComponent, TooltipComponent, LegendComponent,
  VisualMapComponent, DataZoomComponent, MarkAreaComponent,
  MarkLineComponent, TitleComponent, AxisPointerComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { observatoryThemeLight } from './theme';

let registered = false;

export function ensureEchartsRegistered(): void {
  if (registered) return;
  echarts.use([
    CanvasRenderer,
    BarChart, LineChart, ScatterChart, HeatmapChart,
    SankeyChart, BoxplotChart, CustomChart,
    GridComponent, TooltipComponent, LegendComponent,
    VisualMapComponent, DataZoomComponent, MarkAreaComponent,
    MarkLineComponent, TitleComponent, AxisPointerComponent,
  ]);
  echarts.registerTheme('observatory-light', observatoryThemeLight());
  registered = true;
}

export { echarts };
```

- [ ] **Step 3: Commit**

```bash
git add site/package.json site/bun.lock site/src/workspace/charts/echarts-setup.ts
git commit -m "feat(workspace): echarts tree-shaken registration"
```

## Task 05: `PlotRenderer` React component

**Files:**
- Create: `site/src/workspace/charts/PlotRenderer.tsx`
- Create: `site/tests/workspace/PlotRenderer.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// site/tests/workspace/PlotRenderer.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { PlotRenderer } from '@/workspace/charts/PlotRenderer';

afterEach(cleanup);

describe('PlotRenderer', () => {
  it('mounts an ECharts instance into its container', () => {
    const option = {
      xAxis: { type: 'category' as const, data: ['a', 'b'] },
      yAxis: { type: 'value' as const },
      series: [{ type: 'bar' as const, data: [1, 2] }],
    };
    const { container } = render(<PlotRenderer option={option} />);
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
  });

  it('cleans up on unmount', () => {
    const option = {
      xAxis: { type: 'category' as const, data: ['a'] },
      yAxis: { type: 'value' as const },
      series: [{ type: 'bar' as const, data: [1] }],
    };
    const { unmount, container } = render(<PlotRenderer option={option} />);
    unmount();
    // After dispose, the canvas should be gone from the DOM
    expect(container.querySelector('canvas')).toBeNull();
  });
});
```

- [ ] **Step 2: Verify it fails**

```bash
cd site && bun run test PlotRenderer
```

Expected: module not found.

- [ ] **Step 3: Implement `PlotRenderer.tsx`**

```tsx
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { EChartsOption } from 'echarts';
import { ensureEchartsRegistered, echarts } from './echarts-setup';

interface Props {
  option: EChartsOption;
  className?: string;
}

export function PlotRenderer({ option, className }: Props) {
  ensureEchartsRegistered();
  const divRef = useRef<HTMLDivElement>(null);
  const instRef = useRef<echarts.ECharts | null>(null);

  useLayoutEffect(() => {
    if (!divRef.current) return;
    instRef.current = echarts.init(divRef.current, 'observatory-light', { renderer: 'canvas' });
    return () => {
      if (instRef.current) {
        instRef.current.dispose();
        instRef.current = null;
      }
    };
  }, []);

  useLayoutEffect(() => {
    instRef.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;
    let rafId = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => instRef.current?.resize());
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, []);

  return <div ref={divRef} className={className ?? 'h-full w-full'} />;
}
```

- [ ] **Step 4: Run tests**

```bash
cd site && bun run test PlotRenderer
```

Expected: 2 passing. If `jsdom` doesn't support canvas, Vitest may need `environmentOptions: { jsdom: { resources: "usable" } }` or use `happy-dom` with canvas stub. If a stub is required, add it to `tests/setup.ts`:

```ts
// tests/setup.ts
import '@testing-library/jest-dom/vitest';
HTMLCanvasElement.prototype.getContext = () => null as unknown as CanvasRenderingContext2D;
```

Append any needed stubbing to ERRATA.

- [ ] **Step 5: Commit**

```bash
git add site/src/workspace/charts/PlotRenderer.tsx site/tests/workspace/PlotRenderer.test.tsx site/tests/setup.ts
git commit -m "feat(workspace): plot renderer mounts and resizes echarts"
```

## Task 06: context markdown loader

**Files:**
- Create: `site/src/workspace/charts/context.ts`
- Create: `site/src/workspace/charts/context/README.md` (placeholder so the directory is tracked)

- [ ] **Step 1: Write the helper**

Vite supports `?raw` imports out of the box; no loader plugin is needed. The helper just normalises the dynamic-import contract for `defineChart`.

```ts
// site/src/workspace/charts/context.ts
import { marked } from 'marked';

export async function renderContext(
  loader: (() => Promise<{ default: string }>) | undefined,
): Promise<string> {
  if (!loader) return '';
  const mod = await loader();
  return marked.parse(mod.default) as string;
}
```

- [ ] **Step 2: Install `marked`**

```bash
cd site && bun add marked
```

- [ ] **Step 3: Create the context directory placeholder**

```bash
mkdir -p site/src/workspace/charts/context
echo "Chart context markdown files live under topic-named subdirectories here." > site/src/workspace/charts/context/README.md
```

- [ ] **Step 4: Commit**

```bash
git add site/src/workspace/charts/context.ts site/src/workspace/charts/context/README.md site/package.json site/bun.lock
git commit -m "feat(workspace): context markdown renderer"
```

## Task 07: Web Worker for Arrow decode

**Files:**
- Create: `site/src/workspace/data/worker.ts`
- Create: `site/src/workspace/data/types.ts`

- [ ] **Step 1: Write `types.ts`**

```ts
// site/src/workspace/data/types.ts

export type WorkerRequest = { id: number; url: string };
export type WorkerResponse =
  | { id: number; kind: 'ok'; buffer: ArrayBuffer }
  | { id: number; kind: 'error'; status: number; message: string };
```

- [ ] **Step 2: Write `worker.ts`**

```ts
// site/src/workspace/data/worker.ts
import type { WorkerRequest, WorkerResponse } from './types';

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, url } = e.data;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const msg: WorkerResponse = { id, kind: 'error', status: res.status, message: res.statusText };
      (self as unknown as Worker).postMessage(msg);
      return;
    }
    const buf = await res.arrayBuffer();
    const out: WorkerResponse = { id, kind: 'ok', buffer: buf };
    (self as unknown as Worker).postMessage(out, [buf]);
  } catch (err) {
    const msg: WorkerResponse = {
      id,
      kind: 'error',
      status: 0,
      message: err instanceof Error ? err.message : 'unknown worker error',
    };
    (self as unknown as Worker).postMessage(msg);
  }
};
```

- [ ] **Step 3: Commit**

```bash
git add site/src/workspace/data
git commit -m "feat(workspace): arrow decode worker + types"
```

## Task 08: Arrow fetch + memoisation

**Files:**
- Create: `site/src/workspace/data/cache.ts`
- Create: `site/src/workspace/data/fetcher.ts`
- Create: `site/tests/workspace/fetcher.test.ts`

- [ ] **Step 1: Install apache-arrow**

```bash
cd site && bun add apache-arrow
```

- [ ] **Step 2: Write `cache.ts`**

```ts
// site/src/workspace/data/cache.ts
import type { Table } from 'apache-arrow';

const cache = new Map<string, Promise<Table>>();

export function getOrCreate(key: string, factory: () => Promise<Table>): Promise<Table> {
  const existing = cache.get(key);
  if (existing) return existing;
  const created = factory().catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, created);
  return created;
}

export function clearCacheForTests(): void {
  cache.clear();
}
```

- [ ] **Step 3: Write `fetcher.ts`**

```ts
// site/src/workspace/data/fetcher.ts
import { tableFromIPC, type Table } from 'apache-arrow';
import type { WorkerRequest, WorkerResponse } from './types';
import { getOrCreate } from './cache';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (b: ArrayBuffer) => void; reject: (e: unknown) => void }>();

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (e: MessageEvent<WorkerResponse>) => {
    const m = e.data;
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.kind === 'ok') p.resolve(m.buffer);
    else p.reject(new FetchError(m.status, m.message));
  });
  return worker;
}

export class FetchError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'FetchError';
  }
}

async function requestBuffer(url: string): Promise<ArrayBuffer> {
  const w = ensureWorker();
  const id = nextId++;
  const req: WorkerRequest = { id, url };
  return new Promise<ArrayBuffer>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage(req);
  });
}

function dataUrl(queryId: string, date: string): string {
  return `/data/${date}/${queryId}.arrow`;
}

export function fetchArrow(queryId: string, date: string): Promise<Table> {
  const key = `${queryId}:${date}`;
  return getOrCreate(key, async () => {
    const buf = await requestBuffer(dataUrl(queryId, date));
    return tableFromIPC(new Uint8Array(buf));
  });
}

export function fetchArrowBundle(
  queryIds: readonly string[],
  date: string,
): Promise<Record<string, Table>> {
  return Promise.all(queryIds.map((id) => fetchArrow(id, date).then((t) => [id, t] as const)))
    .then((entries) => Object.fromEntries(entries));
}
```

- [ ] **Step 4: Write a memoisation test**

```ts
// site/tests/workspace/fetcher.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearCacheForTests } from '@/workspace/data/cache';

// For the pure cache test we exercise getOrCreate directly; the worker-based
// fetchArrow is covered by Playwright in a later task.
import { getOrCreate } from '@/workspace/data/cache';

beforeEach(clearCacheForTests);

describe('cache.getOrCreate', () => {
  it('shares a promise across concurrent callers', async () => {
    const factory = vi.fn(async () => ({ numRows: 1 } as any));
    const [a, b] = await Promise.all([
      getOrCreate('k', factory),
      getOrCreate('k', factory),
    ]);
    expect(a).toBe(b);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('re-runs after failure', async () => {
    let call = 0;
    const factory = vi.fn(async () => {
      call++;
      if (call === 1) throw new Error('x');
      return { numRows: 2 } as any;
    });
    await expect(getOrCreate('k', factory)).rejects.toThrow('x');
    await expect(getOrCreate('k', factory)).resolves.toEqual({ numRows: 2 });
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 5: Run tests**

```bash
cd site && bun run test fetcher
```

Expected: 2 passing.

- [ ] **Step 6: Commit**

```bash
git add site/src/workspace/data site/tests/workspace/fetcher.test.ts site/package.json site/bun.lock
git commit -m "feat(workspace): arrow fetcher with worker and promise memoisation"
```

## Task 09: typed registry loader

**Files:**
- Create: `site/src/workspace/data/registry.ts`
- Create: `site/src/workspace/data/dates.ts`

- [ ] **Step 1: Write `registry.ts`**

```ts
// site/src/workspace/data/registry.ts
import { z } from 'zod';

const TopicEntry = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number().int(),
});

const ChartEntry = z.object({
  id: z.string(),
  topic: z.string(),
  title: z.string(),
  description: z.string().default(''),
  related: z.array(z.string()).default([]),
  order: z.number().int().optional(),
  activeFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  activeTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});

export const RegistrySchema = z.object({
  schemaVersion: z.literal('2.0'),
  generatedAt: z.string(),
  topics: z.array(TopicEntry),
  charts: z.record(z.string(), ChartEntry),
});

export type Registry = z.infer<typeof RegistrySchema>;

let cached: Promise<Registry> | null = null;

export function loadRegistry(): Promise<Registry> {
  cached ??= fetch('/registry.json')
    .then((r) => { if (!r.ok) throw new Error(`registry.json ${r.status}`); return r.json(); })
    .then((raw) => RegistrySchema.parse(raw));
  return cached;
}
```

- [ ] **Step 2: Write `dates.ts`**

```ts
// site/src/workspace/data/dates.ts
import { z } from 'zod';

export const DatesSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  latest: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type Dates = z.infer<typeof DatesSchema>;

let cached: Promise<Dates> | null = null;

export function loadDates(): Promise<Dates> {
  cached ??= fetch('/dates.json')
    .then((r) => { if (!r.ok) throw new Error(`dates.json ${r.status}`); return r.json(); })
    .then((raw) => DatesSchema.parse(raw));
  return cached;
}
```

- [ ] **Step 3: Commit**

```bash
git add site/src/workspace/data/registry.ts site/src/workspace/data/dates.ts
git commit -m "feat(workspace): typed registry + dates loaders"
```

## Task 10: chart metadata scanner (Bun CLI)

**Files:**
- Create: `observatory/src/scanner.ts`
- Create: `observatory/src/manifest.ts`
- Modify: `observatory/package.json` (add `glob` dep and a `manifest` script)

- [ ] **Step 1: Install `fast-glob` if not already**

```bash
cd observatory && bun add fast-glob
```

- [ ] **Step 2: Write `scanner.ts`** (Babel-based `defineChart` metadata extractor)

```ts
// observatory/src/scanner.ts
import parser from '@babel/parser';
import traverse from '@babel/traverse';
import type * as t from '@babel/types';
import fs from 'node:fs/promises';

export interface ScannedChart {
  id: string;
  topic: string;
  title: string;
  description: string;
  related: string[];
  order?: number;
  activeFrom: string;
  activeTo: string | null;
}

function lit(n: t.Node | null | undefined): string | number | boolean | null | undefined {
  if (!n) return undefined;
  if (n.type === 'StringLiteral')  return n.value;
  if (n.type === 'NumericLiteral') return n.value;
  if (n.type === 'BooleanLiteral') return n.value;
  if (n.type === 'NullLiteral')    return null;
  return undefined;
}

function arrayOfString(n: t.Node | null | undefined): string[] {
  if (!n || n.type !== 'ArrayExpression') return [];
  return n.elements.flatMap((e) => {
    if (!e) return [];
    if (e.type === 'StringLiteral') return [e.value];
    return [];
  });
}

function fromDefineChart(args: readonly t.Node[]): ScannedChart | null {
  const [arg] = args;
  if (!arg || arg.type !== 'ObjectExpression') return null;
  const get = (key: string): t.Node | undefined => {
    for (const p of arg.properties) {
      if (p.type !== 'ObjectProperty') continue;
      const k = p.key;
      if (k.type === 'Identifier'    && k.name  === key) return p.value;
      if (k.type === 'StringLiteral' && k.value === key) return p.value;
    }
    return undefined;
  };
  const id          = lit(get('id'));
  const topic       = lit(get('topic'));
  const title       = lit(get('title'));
  if (typeof id !== 'string' || typeof topic !== 'string' || typeof title !== 'string') return null;
  const description = lit(get('description'));
  const order       = lit(get('order'));
  const activeFrom  = lit(get('activeFrom'));
  const activeToRaw = lit(get('activeTo'));
  if (typeof activeFrom !== 'string') return null;
  return {
    id,
    topic,
    title,
    description: typeof description === 'string' ? description : '',
    related: arrayOfString(get('related')),
    order: typeof order === 'number' ? order : undefined,
    activeFrom,
    activeTo: typeof activeToRaw === 'string' ? activeToRaw : null,
  };
}

export async function scanFile(path: string): Promise<ScannedChart | null> {
  const src = await fs.readFile(path, 'utf8');
  const ast = parser.parse(src, { sourceType: 'module', plugins: ['typescript'] });
  let found: ScannedChart | null = null;
  traverse(ast, {
    CallExpression(p) {
      const c = p.node.callee;
      const isDefineChart =
        (c.type === 'Identifier' && c.name === 'defineChart') ||
        (c.type === 'MemberExpression' && c.property.type === 'Identifier' && c.property.name === 'defineChart');
      if (!isDefineChart) return;
      const extracted = fromDefineChart(p.node.arguments as unknown as t.Node[]);
      if (extracted) { found = extracted; p.stop(); }
    },
  });
  return found;
}
```

- [ ] **Step 3: Write `manifest.ts`**

```ts
// observatory/src/manifest.ts
#!/usr/bin/env bun
import fg from 'fast-glob';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, resolveDates } from './config';
import { scanFile, type ScannedChart } from './scanner';
import { TOPIC_REGISTRY } from '../../site/src/workspace/charts/topics';

const CHARTS_GLOB = 'site/src/workspace/charts/**/*.ts';
const EXCLUDE = ['**/charts/index.ts', '**/charts/define.ts', '**/charts/types.ts', '**/charts/theme.ts',
                 '**/charts/echarts-setup.ts', '**/charts/context.ts', '**/charts/topics.ts',
                 '**/charts/PlotRenderer.tsx', '**/charts/context/**'];

async function main(): Promise<void> {
  const cfg = loadConfig('pipeline.yaml');

  const files = await fg(CHARTS_GLOB, { ignore: EXCLUDE, absolute: false });
  const scanned: ScannedChart[] = [];
  for (const f of files) {
    const s = await scanFile(f);
    if (s) scanned.push(s);
  }

  // Validate: duplicate ids forbidden; overlapping date ranges for same id forbidden.
  const byId = new Map<string, ScannedChart[]>();
  for (const c of scanned) {
    const list = byId.get(c.id) ?? [];
    list.push(c);
    byId.set(c.id, list);
  }
  for (const [id, list] of byId) {
    if (list.length === 1) continue;
    list.sort((a, b) => a.activeFrom.localeCompare(b.activeFrom));
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i]!;
      const b = list[i + 1]!;
      const aEnd = a.activeTo ?? '9999-12-31';
      if (aEnd >= b.activeFrom) {
        throw new Error(`Chart id ${id} has overlapping date ranges: ${a.activeFrom}..${a.activeTo} and ${b.activeFrom}..${b.activeTo}`);
      }
    }
  }

  // Validate topics are registered
  for (const c of scanned) {
    if (!TOPIC_REGISTRY[c.topic]) {
      throw new Error(`Chart ${c.id} references unknown topic ${c.topic}`);
    }
  }

  // Emit registry.json
  const registry = {
    schemaVersion: '2.0',
    generatedAt: new Date().toISOString(),
    topics: Object.values(TOPIC_REGISTRY).sort((a, b) => a.order - b.order),
    charts: Object.fromEntries(
      scanned.map((c) => [c.id, {
        id: c.id,
        topic: c.topic,
        title: c.title,
        description: c.description,
        related: c.related,
        order: c.order,
        activeFrom: c.activeFrom,
        activeTo: c.activeTo,
      }]),
    ),
  };
  await fs.mkdir('build', { recursive: true });
  await fs.writeFile('build/registry.json', JSON.stringify(registry, null, 2));

  // Emit dates.json from resolved config
  const dates = resolveDates(cfg, new Date());
  await fs.writeFile('build/dates.json', JSON.stringify({
    dates,
    latest: dates[dates.length - 1] ?? '',
  }, null, 2));

  // Copy into site/public so Vite bundles them for dev (and can be served)
  await fs.mkdir('site/public', { recursive: true });
  await fs.copyFile('build/registry.json', 'site/public/registry.json');
  await fs.copyFile('build/dates.json',    'site/public/dates.json');

  console.log(`Wrote ${scanned.length} charts to registry.json and ${dates.length} dates to dates.json.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Add a `manifest` script to `observatory/package.json`**

In the `scripts` object add:

```json
"manifest": "bun run src/manifest.ts"
```

- [ ] **Step 5: Sanity run (will emit empty registry until Task 11 adds a chart)**

```bash
cd observatory && bun run manifest
```

Expected: writes `build/registry.json` with `charts: {}` and `site/public/registry.json` identical. Writes `build/dates.json` + `site/public/dates.json`.

```bash
cat build/registry.json | head -20
```

- [ ] **Step 6: Commit**

```bash
git add observatory/src/scanner.ts observatory/src/manifest.ts observatory/package.json observatory/bun.lock
git commit -m "feat(observatory): chart metadata scanner + manifest emitter"
```

## Task 11: sample chart end-to-end

**Files:**
- Create: `site/src/workspace/charts/context/block_propagation/region_winner.md`
- Create: `site/src/workspace/charts/block_propagation/region_winner_grouped_bar.ts`
- Create: `site/src/workspace/charts/index.ts`

- [ ] **Step 1: Write the context sidecar**

```markdown
<!-- site/src/workspace/charts/context/block_propagation/region_winner.md -->

Median block propagation latency per region, split by observation source.
Sentries and contributoors observe from different vantage points; divergence
between the two bars in a region suggests methodology or coverage differences.
```

- [ ] **Step 2: Write the chart module**

```ts
// site/src/workspace/charts/block_propagation/region_winner_grouped_bar.ts
import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const Row = z.object({
  region: z.string(),
  source: z.enum(['sentry', 'contributoor']),
  median_ms: z.number(),
});
type Row = z.infer<typeof Row>;

const DataSchema = z.object({
  regions: z.array(z.string()),
  sentry:  z.array(z.number()),
  contributoor: z.array(z.number()),
});

export default defineChart({
  id: 'region-winner-grouped-bar',
  topic: 'block-propagation',
  title: 'Region winner by source',
  description: 'Median propagation latency per region, grouped by source.',
  queries: ['region_size_matrix'],
  related: [],
  context: () => import('../context/block_propagation/region_winner.md?raw'),
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 11,
  dataSchema: DataSchema,
  transform: ({ region_size_matrix: t }) => {
    const region = t.getChild('region')?.toArray() ?? [];
    const source = t.getChild('source')?.toArray() ?? [];
    const median = t.getChild('median_ms')?.toArray() ?? [];

    const byRegion = new Map<string, { sentry: number; contributoor: number }>();
    for (let i = 0; i < (t as Table).numRows; i++) {
      const r = String(region[i]);
      const s = String(source[i]);
      const v = Number(median[i]);
      const entry = byRegion.get(r) ?? { sentry: 0, contributoor: 0 };
      if (s === 'sentry')       entry.sentry = v;
      if (s === 'contributoor') entry.contributoor = v;
      byRegion.set(r, entry);
    }
    const regions = [...byRegion.keys()].sort();
    return {
      regions,
      sentry:       regions.map((r) => byRegion.get(r)!.sentry),
      contributoor: regions.map((r) => byRegion.get(r)!.contributoor),
    };
  },
  option: (data) => ({
    legend: { top: 0 },
    xAxis: { type: 'category', data: data.regions, name: 'region' },
    yAxis: { type: 'value', name: 'median latency (ms)' },
    series: [
      { name: 'sentry',       type: 'bar', data: data.sentry,       itemStyle: { color: LIGHT_TOKENS.accent.teal   } },
      { name: 'contributoor', type: 'bar', data: data.contributoor, itemStyle: { color: LIGHT_TOKENS.accent.purple } },
    ],
    tooltip: { trigger: 'axis' },
  }),
});
```

- [ ] **Step 3: Write the auto-imports barrel**

```ts
// site/src/workspace/charts/index.ts
// Re-exports every chart module for side-effect registration inside site code,
// and keeps Vite aware of them for code-splitting.

import regionWinnerGroupedBar from './block_propagation/region_winner_grouped_bar';

export const ALL_CHARTS = {
  [regionWinnerGroupedBar.id]: regionWinnerGroupedBar,
} as const;
```

Plan 05 will populate this barrel with every chart.

- [ ] **Step 4: Rerun the manifest scanner**

```bash
cd observatory && bun run manifest
cat build/registry.json | head -40
```

Expected: `charts` contains `region-winner-grouped-bar`.

- [ ] **Step 5: Commit**

```bash
git add site/src/workspace/charts/index.ts site/src/workspace/charts/block_propagation site/src/workspace/charts/context/block_propagation
git commit -m "feat(workspace): first chart region-winner-grouped-bar end-to-end"
```

## Task 12: dev-only gallery route for the sample chart

**Files:**
- Create: `site/src/__gallery__/Chart.tsx`
- Modify: `site/src/App.tsx` (wire the route guarded by `import.meta.env.DEV`)

- [ ] **Step 1: Write `Chart.tsx`**

```tsx
// site/src/__gallery__/Chart.tsx
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Table } from 'apache-arrow';
import { fetchArrowBundle } from '@/workspace/data/fetcher';
import { ALL_CHARTS } from '@/workspace/charts/index';
import { PlotRenderer } from '@/workspace/charts/PlotRenderer';
import { renderContext } from '@/workspace/charts/context';

export default function ChartGallery() {
  const [params] = useSearchParams();
  const id   = params.get('id')   ?? 'region-winner-grouped-bar';
  const date = params.get('date') ?? '';
  const chart = ALL_CHARTS[id as keyof typeof ALL_CHARTS];
  const [data, setData] = useState<Record<string, Table> | null>(null);
  const [ctx, setCtx]   = useState<string>('');
  const [err, setErr]   = useState<string>('');

  useEffect(() => {
    if (!chart || !date) return;
    setData(null); setErr(''); setCtx('');
    Promise.all([
      fetchArrowBundle(chart.queries, date),
      renderContext(chart.context),
    ]).then(([bundle, html]) => { setData(bundle); setCtx(html); })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  }, [chart, date]);

  if (!chart) return <div className="p-8 text-sm">unknown chart id: {id}</div>;
  if (!date)  return <div className="p-8 text-sm">pass ?date=YYYY-MM-DD</div>;
  if (err)    return <div className="p-8 text-sm text-destructive">error: {err}</div>;
  if (!data)  return <div className="p-8 text-sm text-muted">loading {id}@{date}</div>;

  const transformed = chart.transform(data);
  const parsed = chart.dataSchema.parse(transformed);
  const option = chart.option(parsed, { date, isDark: false });

  return (
    <div className="flex h-screen flex-col">
      <div className="border-b border-border p-3 font-mono text-xs text-muted">
        {id} @ {date}
      </div>
      <div className="flex-1 min-h-0">
        <PlotRenderer option={option} />
      </div>
      {ctx ? <div className="border-t border-border p-3 prose text-sm" dangerouslySetInnerHTML={{ __html: ctx }} /> : null}
    </div>
  );
}
```

- [ ] **Step 2: Add the route**

Modify `site/src/App.tsx`:

```tsx
import Gallery from '@/__gallery__/Gallery';
import ChartGallery from '@/__gallery__/Chart';

// Inside the <Routes>...
{isDev ? <Route path="/__gallery__"        element={<Gallery />} /> : null}
{isDev ? <Route path="/__gallery__/chart" element={<ChartGallery />} /> : null}
```

- [ ] **Step 3: Verify the end-to-end loop**

```bash
cd observatory && bun run fetch --only region_size_matrix --date $(date -v -1d +%F)
cd ../observatory && bun run manifest
cd ../site && bun run dev
```

Browse to `http://localhost:4321/__gallery__/chart?id=region-winner-grouped-bar&date=<yesterday>`. Expected: a two-series grouped bar chart renders within ~500 ms; no console errors; canvas is non-zero size.

- [ ] **Step 4: Commit**

```bash
git add site/src/__gallery__/Chart.tsx site/src/App.tsx
git commit -m "feat(site): gallery route renders a chart end-to-end"
```

## Task 13: Playwright smoke for the sample chart

**Files:**
- Create: `site/tests/e2e/chart-gallery.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from '@playwright/test';

test('sample chart renders a canvas', async ({ page }) => {
  // Precondition: build/data/<yesterday>/region_size_matrix.arrow + registry.json + dates.json
  // are already generated by the CI data-fetch step. If running locally, run
  //   just fetch && just manifest
  // before invoking.
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await page.goto(`/__gallery__/chart?id=region-winner-grouped-bar&date=${yesterday}`);
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 5_000 });
  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(50);
  expect(box?.height).toBeGreaterThan(50);
});
```

- [ ] **Step 2: Run Playwright**

```bash
cd site && bun run test:e2e chart-gallery
```

Expected: 1 passing (given the pre-requisites). If the CI runner doesn't have a ClickHouse connection, fixture Arrow files should be seeded by a pre-test hook; see the self-review.

- [ ] **Step 3: Commit**

```bash
git add site/tests/e2e/chart-gallery.spec.ts
git commit -m "test(site): playwright smoke for chart gallery"
```

## Task 14: CI wiring

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a `charts-manifest` step to the `site` job** that runs before `typecheck`:

```yaml
      - run: bun run --cwd observatory manifest
```

This writes `build/registry.json` / `build/dates.json` into the checkout. For CI, the Arrow files themselves require ClickHouse credentials; guard the Playwright e2e that needs real data behind an `if: env.CLICKHOUSE_URL != ''` condition and seed a fixture otherwise (add a `site/tests/fixtures/region_size_matrix.arrow` checked into git, ≤ 1 KB).

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run observatory manifest before site build"
```

## Self-review checklist

- [ ] `defineChart` returns exactly what it received; types flow correctly from `dataSchema` to `option`.
- [ ] `PlotRenderer` mounts an ECharts instance and disposes on unmount.
- [ ] The shared ECharts theme applies to the sample chart (look for the warm-paper background transparency + mono axis labels).
- [ ] `renderContext(loader)` returns HTML; `loader` is never executed until a pane needs it.
- [ ] `fetchArrow` memoises concurrent callers; errors evict the cache entry.
- [ ] Web Worker transfers the `ArrayBuffer` (verify by inspecting the worker's `postMessage` call).
- [ ] `registry.json` excludes `context_html`; `dates.json` lists dates derived from `pipeline.yaml`.
- [ ] `observatory/src/manifest.ts` validates unique chart ids and overlap-free date ranges.
- [ ] Gallery route at `/__gallery__/chart?id=...&date=...` renders a non-zero canvas in dev.
- [ ] ERRATA entries for any SQL/table substitutions, jsdom workarounds, or topic mappings.

## Done condition

`plan-04-chart-scaffold` PR merged. The authoring pipeline is now `.ts` file under `site/src/workspace/charts/` → `defineChart({...})` → manifest scanner → runtime render. One chart (`region-winner-grouped-bar`) proves the loop. Next: Plan 05 ports the remaining 59 charts using this scaffold.
