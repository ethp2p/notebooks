import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const RowSchema = z.object({
  region: z.string(),
  source: z.string(),
  size_bucket: z.string(),
  median_ms: z.number(),
  count: z.number(),
});

const DataSchema = z.object({
  regions: z.array(z.string()),
  sizeBuckets: z.array(z.string()),
  // Sentry grid: [region_idx][size_bucket_idx] = median_ms
  sentryCells: z.array(z.tuple([z.number(), z.number(), z.number()])), // [ri, si, value]
  contributoorCells: z.array(z.tuple([z.number(), z.number(), z.number()])),
  maxMs: z.number(),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'region-size-heatmap-subplots',
  topic: 'block-propagation',
  title: 'Region x size median latency heatmaps',
  description:
    'Two heatmaps (sentry and contributoor) showing median propagation latency by region (rows) and wire-size bucket (columns).',
  queries: ['region_size_matrix'] as const,
  related: ['regional-cdf-subplots', 'regional-corrected-box'],
  context: () =>
    import(
      '../context/block_propagation/region_size_heatmap_subplots.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 11,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['region_size_matrix'] as Table | undefined;
    const empty: Data = { regions: [], sizeBuckets: [], sentryCells: [], contributoorCells: [], maxMs: 0 };
    if (!t) return empty;

    const regionSet = new Set<string>();
    const sizeSet = new Set<string>();

    type Key = string;
    const sentrySums = new Map<Key, { sum: number; count: number }>();
    const contributoorSums = new Map<Key, { sum: number; count: number }>();

    for (let i = 0; i < t.numRows; i++) {
      const rowRaw = t.get(i);
      if (!rowRaw) continue;

      const parsed = RowSchema.safeParse(rowRaw.toJSON?.() ?? rowRaw);
      if (!parsed.success) continue;
      const row = parsed.data;

      regionSet.add(row.region);
      sizeSet.add(row.size_bucket);

      const key: Key = `${row.region}:${row.size_bucket}`;
      const target = row.source === 'sentry' ? sentrySums : contributoorSums;
      const existing = target.get(key) ?? { sum: 0, count: 0 };
      existing.sum += row.median_ms * row.count;
      existing.count += row.count;
      target.set(key, existing);
    }

    const regions = [...regionSet].sort();
    const sizeBuckets = [...sizeSet].sort();

    const toCell = (
      sums: Map<Key, { sum: number; count: number }>,
    ): Array<[number, number, number]> => {
      const cells: Array<[number, number, number]> = [];
      for (const [ri, region] of regions.entries()) {
        for (const [si, bucket] of sizeBuckets.entries()) {
          const e = sums.get(`${region}:${bucket}`);
          if (e && e.count > 0) {
            cells.push([si, ri, Math.round(e.sum / e.count)]);
          }
        }
      }
      return cells;
    };

    const sentryCells = toCell(sentrySums);
    const contributoorCells = toCell(contributoorSums);
    const allMs = [...sentryCells, ...contributoorCells].map((c) => c[2]);
    const maxMs = allMs.length > 0 ? Math.max(...allMs) : 1;

    return { regions, sizeBuckets, sentryCells, contributoorCells, maxMs } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    const pad = 4;

    const grids = [
      { left: `${pad}%`, top: '10%', width: `${50 - pad * 2}%`, height: '78%', containLabel: true },
      { left: '52%', top: '10%', width: `${50 - pad * 2}%`, height: '78%', containLabel: true },
    ];

    const axisBase = (idx: number) => ({
      gridIndex: idx,
      axisLabel: { fontSize: 9 },
      axisTick: { show: false },
      splitLine: { show: false },
    });

    return {
      title: [
        { text: 'Sentry', left: '25%', top: '2%', textAlign: 'center', textStyle: { fontSize: 11, color: t.fg, fontWeight: 'normal' as const } },
        { text: 'Contributoor', left: '75%', top: '2%', textAlign: 'center', textStyle: { fontSize: 11, color: t.fg, fontWeight: 'normal' as const } },
      ],
      grid: grids,
      xAxis: [
        { ...axisBase(0), type: 'category' as const, data: data.sizeBuckets, name: 'Size bucket' },
        { ...axisBase(1), type: 'category' as const, data: data.sizeBuckets, name: 'Size bucket' },
      ],
      yAxis: [
        { ...axisBase(0), type: 'category' as const, data: data.regions, name: 'Region' },
        { ...axisBase(1), type: 'category' as const, data: data.regions, axisLabel: { show: false, fontSize: 9 } },
      ],
      visualMap: {
        type: 'continuous',
        min: 0,
        max: data.maxMs,
        inRange: { color: [t.bg1, t.accent.purple] },
        calculable: true,
        orient: 'horizontal' as const,
        bottom: 0,
        left: 'center',
        text: [`${data.maxMs}ms`, '0'],
      },
      series: [
        {
          name: 'Sentry',
          type: 'heatmap' as const,
          data: data.sentryCells,
          xAxisIndex: 0,
          yAxisIndex: 0,
          emphasis: { disabled: true },
        },
        {
          name: 'Contributoor',
          type: 'heatmap' as const,
          data: data.contributoorCells,
          xAxisIndex: 1,
          yAxisIndex: 1,
          emphasis: { disabled: true },
        },
      ],
      tooltip: { trigger: 'item', formatter: (p: unknown) => {
        const params = p as { data: [number, number, number]; seriesName: string };
        return `${params.seriesName}: ${params.data[2]}ms`;
      }},
    };
  },
});
