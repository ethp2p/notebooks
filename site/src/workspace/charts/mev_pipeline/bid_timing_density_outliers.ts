import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const DataSchema = z.object({
  // Heatmap cells: [x_bin, y_bin, count]
  cells: z.array(z.tuple([z.number(), z.number(), z.number()])),
  maxCount: z.number(),
  // Scatter overlay: [winning_bid_ms, block_arrival_ms] for P95+ outliers
  outliers: z.array(z.tuple([z.number(), z.number()])),
  xLabels: z.array(z.string()),
  yLabels: z.array(z.string()),
});

type Data = z.infer<typeof DataSchema>;

const X_BINS = 30;
const Y_BINS = 30;

function bin(value: number, min: number, max: number, bins: number): number {
  if (max <= min) return 0;
  return Math.min(Math.floor(((value - min) / (max - min)) * bins), bins - 1);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return ((sorted[lo] ?? 0) * (hi - idx) + (sorted[hi] ?? 0) * (idx - lo));
}

export default defineChart({
  id: 'bid-timing-density-outliers',
  topic: 'mev-pipeline',
  title: 'Bid timing density with P95 outliers',
  description: 'Heatmap of winning bid vs block arrival latency with P95 outliers overlaid as scatter points.',
  queries: ['block_events'] as const,
  related: ['bid-vs-block-scatter', 'bid-timing-density-facets'],
  context: () =>
    import(
      '../context/mev_pipeline/bid_timing_density_outliers.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 12,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return { cells: [], maxCount: 0, outliers: [], xLabels: [], yLabels: [] };

    const slotCol = t.getChild('slot');
    const typeCol = t.getChild('event_type');
    const latCol = t.getChild('latency_ms');

    const winningMs = new Map<number, number>();
    const arrivalMs = new Map<number, number>();

    for (let i = 0; i < t.numRows; i++) {
      const s = Number(slotCol?.get(i) ?? 0);
      const evType = String(typeCol?.get(i) ?? '');
      const lat = Number(latCol?.get(i) ?? 0);

      if (evType === 'bid_winning') {
        winningMs.set(s, lat);
      } else if (evType === 'block_arrival') {
        arrivalMs.set(s, lat);
      }
    }

    const pairs: Array<[number, number]> = [];
    for (const [s, w] of winningMs) {
      const a = arrivalMs.get(s);
      if (a == null) continue;
      pairs.push([w, a]);
    }

    if (pairs.length === 0) return { cells: [], maxCount: 0, outliers: [], xLabels: [], yLabels: [] };

    const xVals = pairs.map(([x]) => x).sort((a, b) => a - b);
    const yVals = pairs.map(([, y]) => y).sort((a, b) => a - b);

    const xMin = xVals[0] ?? 0;
    const xMax = xVals[xVals.length - 1] ?? 1;
    const yMin = yVals[0] ?? 0;
    const yMax = yVals[yVals.length - 1] ?? 1;

    const xP95 = percentile(xVals, 0.95);
    const yP95 = percentile(yVals, 0.95);

    const xStep = (xMax - xMin) / X_BINS;
    const yStep = (yMax - yMin) / Y_BINS;
    const xLabels = Array.from({ length: X_BINS }, (_, i) => String(Math.round(xMin + i * xStep)));
    const yLabels = Array.from({ length: Y_BINS }, (_, i) => String(Math.round(yMin + i * yStep)));

    const grid = new Map<number, number>();
    const outliers: Array<[number, number]> = [];

    for (const [x, y] of pairs) {
      const xi = bin(x, xMin, xMax, X_BINS);
      const yi = bin(y, yMin, yMax, Y_BINS);
      const key = yi * X_BINS + xi;
      grid.set(key, (grid.get(key) ?? 0) + 1);

      if (x >= xP95 || y >= yP95) {
        outliers.push([x, y]);
      }
    }

    let maxCount = 0;
    const cells: Array<[number, number, number]> = [];
    for (const [key, count] of grid) {
      const xi = key % X_BINS;
      const yi = Math.floor(key / X_BINS);
      cells.push([xi, yi, count]);
      if (count > maxCount) maxCount = count;
    }

    return { cells, maxCount, outliers, xLabels, yLabels } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      grid: { top: 40, right: 16, bottom: 48, left: 16, containLabel: true },
      xAxis: [
        {
          type: 'category',
          data: data.xLabels,
          name: 'winning bid (ms)',
          axisLabel: { fontSize: 9, interval: 4 },
        },
      ],
      yAxis: [
        {
          type: 'category',
          data: data.yLabels,
          name: 'block first-seen (ms)',
          axisLabel: { fontSize: 9, interval: 4 },
        },
      ],
      visualMap: {
        type: 'continuous',
        min: 0,
        max: data.maxCount,
        inRange: { color: [t.bg1, t.accent.teal] },
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        calculable: false,
        show: true,
      },
      series: [
        {
          type: 'heatmap' as const,
          data: data.cells,
          emphasis: { disabled: true },
        },
        {
          type: 'scatter' as const,
          data: data.outliers,
          symbolSize: 5,
          itemStyle: { color: '#ef4444', opacity: 0.7 },
          xAxisIndex: 0,
          yAxisIndex: 0,
          tooltip: {
            formatter: (params: unknown) => {
              const p = params as { value: [number, number] };
              return `bid: ${p.value[0]}ms, arrival: ${p.value[1]}ms`;
            },
          },
        },
      ],
      tooltip: { trigger: 'item' },
    };
  },
});
