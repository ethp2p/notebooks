import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const DataSchema = z.object({
  // [wire_size_bytes, residual_ms] - residual = actual - predicted
  points: z.array(z.tuple([z.number(), z.number()])),
  xMin: z.number(),
  xMax: z.number(),
});

type Data = z.infer<typeof DataSchema>;

function ols(xs: number[], ys: number[]): { slope: number; intercept: number } | null {
  const n = xs.length;
  if (n < 2) return null;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i] ?? 0;
    sumY += ys[i] ?? 0;
    sumXY += (xs[i] ?? 0) * (ys[i] ?? 0);
    sumX2 += (xs[i] ?? 0) * (xs[i] ?? 0);
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  return {
    slope: (n * sumXY - sumX * sumY) / denom,
    intercept: (sumY - ((n * sumXY - sumX * sumY) / denom) * sumX) / n,
  };
}

export default defineChart({
  id: 'size-residuals-scatter',
  topic: 'block-propagation',
  title: 'Propagation latency residuals from size regression',
  description:
    'Scatter of residuals from a linear regression of propagation latency on wire size. Points above zero are slower than the model predicts.',
  queries: ['block_events'] as const,
  related: ['corrected-vs-size-scatter', 'double-outlier-quadrant-scatter'],
  context: () =>
    import(
      '../context/block_propagation/size_residuals_scatter.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 16,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return { points: [], xMin: 0, xMax: 1 };

    const typeCol = t.getChild('event_type');
    const sizeCol = t.getChild('wire_size_bytes');
    const latCol = t.getChild('latency_ms');

    if (!typeCol || !sizeCol || !latCol) return { points: [], xMin: 0, xMax: 1 };

    const xs: number[] = [];
    const ys: number[] = [];

    for (let i = 0; i < t.numRows; i++) {
      const evType = String(typeCol.get(i) ?? '');
      if (evType !== 'block_arrival') continue;
      xs.push(Number(sizeCol.get(i) ?? 0));
      ys.push(Number(latCol.get(i) ?? 0));
    }

    if (xs.length === 0) return { points: [], xMin: 0, xMax: 1 };

    const reg = ols(xs, ys);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);

    const points: Array<[number, number]> = xs.map((x, i) => {
      const predicted = reg ? reg.slope * x + reg.intercept : 0;
      return [x, (ys[i] ?? 0) - predicted];
    });

    return { points, xMin, xMax } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: { trigger: 'item' },
      xAxis: { type: 'value', name: 'Wire size (bytes)' },
      yAxis: { type: 'value', name: 'Residual (ms)' },
      series: [
        {
          type: 'scatter',
          data: data.points,
          symbolSize: 3,
          large: true,
          largeThreshold: 2000,
          itemStyle: { color: t.accent.teal, opacity: 0.5 },
        },
        {
          // Zero reference line
          type: 'line',
          data: [[data.xMin, 0], [data.xMax, 0]],
          lineStyle: { color: t.accent.amber, type: 'dashed', width: 1 },
          symbol: 'none',
          silent: true,
        },
      ],
    };
  },
});
