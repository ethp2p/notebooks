import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS, HUE_CYCLE } from '../theme';

// Region and source values as observed in block_timeline_cdf query.
// Using z.string() to tolerate actual values from the query without hard constraints.
const REGIONS = ['EU', 'NA', 'AS', 'OC'] as const;
const SOURCES = ['sentry', 'contributoor'] as const;

// Simplified: render one grid per (region, source) pair = 8 grids total.
// Lines within each grid are size buckets. Simplification: we aggregate
// all size buckets as separate named lines. Complexity: ECharts requires
// one axis set per grid; we use separate xAxis/yAxis per grid index.

const SeriesItemSchema = z.object({
  region: z.string(),
  source: z.string(),
  size_bucket: z.string(),
  xs: z.array(z.number()),
  ys: z.array(z.number()),
});

const DataSchema = z.object({
  // Key: `${region}:${source}`, value: per-size lines
  grids: z.array(
    z.object({
      region: z.string(),
      source: z.string(),
      lines: z.array(SeriesItemSchema),
    }),
  ),
  sizeBuckets: z.array(z.string()),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'regional-cdf-subplots',
  topic: 'block-propagation',
  title: 'Regional CDF subplots by source and size bucket',
  description:
    'CDF of block propagation latency in a 4x2 grid (4 regions x 2 sources). Each subplot shows one line per wire-size bucket.',
  queries: ['block_timeline_cdf'] as const,
  related: ['regional-corrected-box', 'region-size-heatmap-subplots'],
  context: () =>
    import(
      '../context/block_propagation/regional_cdf_subplots.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 10,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_timeline_cdf'] as Table | undefined;
    if (!t) return { grids: [], sizeBuckets: [] };

    const regionCol = t.getChild('region');
    const sourceCol = t.getChild('source');
    const sizeBucketCol = t.getChild('size_bucket');
    const latCol = t.getChild('latency_ms');
    const cdfCol = t.getChild('cdf');

    if (!regionCol || !sourceCol || !latCol) return { grids: [], sizeBuckets: [] };

    // Group rows by (region, source, size_bucket)
    type LineKey = string;
    const lineData = new Map<LineKey, { xs: number[]; ys: number[]; region: string; source: string; size_bucket: string }>();

    for (let i = 0; i < t.numRows; i++) {
      const region = String(regionCol.get(i) ?? '');
      const source = String(sourceCol.get(i) ?? '');
      const size_bucket = sizeBucketCol ? String(sizeBucketCol.get(i) ?? 'all') : 'all';
      const lat = Number(latCol.get(i) ?? 0);
      const cdf = cdfCol ? Number(cdfCol.get(i) ?? 0) : 0;

      const key = `${region}:${source}:${size_bucket}`;
      const existing = lineData.get(key) ?? { xs: [], ys: [], region, source, size_bucket };
      existing.xs.push(lat);
      existing.ys.push(cdf);
      lineData.set(key, existing);
    }

    // Sort each line by x
    for (const entry of lineData.values()) {
      const pairs = entry.xs.map((x, i) => [x, entry.ys[i] ?? 0] as [number, number]);
      pairs.sort((a, b) => a[0] - b[0]);
      entry.xs = pairs.map((p) => p[0]);
      entry.ys = pairs.map((p) => p[1]);
    }

    // Build 8 grids: 4 regions x 2 sources
    const sizeBucketSet = new Set<string>();
    for (const e of lineData.values()) sizeBucketSet.add(e.size_bucket);
    const sizeBuckets = [...sizeBucketSet].sort();

    const grids = [];
    for (const region of REGIONS) {
      for (const source of SOURCES) {
        const gridKey = `${region}:${source}`;
        const lines = [...lineData.values()].filter(
          (e) => e.region === region && e.source === source,
        );
        grids.push({ region, source, lines: lines.map(({ region: r, source: s, size_bucket, xs, ys }) => ({ region: r, source: s, size_bucket, xs, ys })) });
        void gridKey;
      }
    }

    return { grids, sizeBuckets } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    const n = data.grids.length;
    if (n === 0) return {};

    // 4 columns x 2 rows
    const COLS = 4;
    const ROWS = 2;
    const pctW = 100 / COLS;
    const pctH = 100 / ROWS;
    const padH = 3;
    const padV = 4;

    const grids = data.grids.map((_, idx) => {
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      return {
        left: `${col * pctW + padH}%`,
        top: `${row * pctH + padV + 5}%`,
        width: `${pctW - padH * 2}%`,
        height: `${pctH - padV * 2 - 6}%`,
        containLabel: false,
      };
    });

    const xAxes = data.grids.map((_, idx) => ({
      gridIndex: idx,
      type: 'value' as const,
      name: idx >= (ROWS - 1) * COLS ? 'ms' : '',
      axisLabel: { show: idx >= (ROWS - 1) * COLS, fontSize: 8 },
      axisTick: { show: false },
      splitLine: { show: false },
    }));

    const yAxes = data.grids.map((_, idx) => ({
      gridIndex: idx,
      type: 'value' as const,
      min: 0,
      max: 1,
      name: idx % COLS === 0 ? 'CDF' : '',
      axisLabel: { show: idx % COLS === 0, fontSize: 8 },
      axisTick: { show: false },
      splitLine: { show: false },
    }));

    const sizeBuckets = data.sizeBuckets;
    const colorMap = new Map<string, string>(
      sizeBuckets.map((b, i) => [b, t.palette(HUE_CYCLE[i % HUE_CYCLE.length] ?? 30)]),
    );

    const series = data.grids.flatMap((grid, gridIdx) =>
      grid.lines.map((line) => ({
        name: `${line.size_bucket}`,
        type: 'line' as const,
        xAxisIndex: gridIdx,
        yAxisIndex: gridIdx,
        data: line.xs.map((x, i) => [x, line.ys[i] ?? 0]),
        lineStyle: {
          color: colorMap.get(line.size_bucket) ?? t.accent.teal,
          type: line.source === 'contributoor' ? ('dashed' as const) : ('solid' as const),
          width: 1,
        },
        symbol: 'none' as const,
        silent: true,
        smooth: false,
      })),
    );

    const titles = data.grids.map((grid, idx) => {
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      return {
        text: `${grid.region} / ${grid.source}`,
        left: `${col * pctW + pctW / 2}%`,
        top: `${row * pctH + padV}%`,
        textAlign: 'center' as const,
        textStyle: { fontSize: 9, color: t.fg, fontWeight: 'normal' as const },
      };
    });

    return {
      title: titles,
      grid: grids,
      xAxis: xAxes,
      yAxis: yAxes,
      series,
      tooltip: { trigger: 'item' },
    };
  },
});
