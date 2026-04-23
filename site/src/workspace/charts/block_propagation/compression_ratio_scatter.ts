import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const DataSchema = z.object({
  // [wire_size_bytes, compression_ratio]
  points: z.array(z.tuple([z.number(), z.number()])),
  // Regression line endpoints: [[x0, y0], [x1, y1]]
  regressionLine: z.tuple([
    z.tuple([z.number(), z.number()]),
    z.tuple([z.number(), z.number()]),
  ]).nullable(),
  xMin: z.number(),
  xMax: z.number(),
});

type Data = z.infer<typeof DataSchema>;

function linearRegression(
  xs: number[],
  ys: number[],
): { slope: number; intercept: number } | null {
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
  id: 'compression-ratio-scatter',
  topic: 'block-propagation',
  title: 'Block compression ratio vs wire size',
  description:
    'Scatter of compression ratio (compressed/uncompressed) versus wire size in bytes. Includes a 1:1 reference line and an OLS regression line.',
  queries: ['block_events'] as const,
  related: ['size-dist-histogram', 'corrected-vs-size-scatter'],
  context: () =>
    import(
      '../context/block_propagation/compression_ratio_scatter.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 2,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return { points: [], regressionLine: null, xMin: 0, xMax: 1 };

    const sizeCol = t.getChild('wire_size_bytes');
    const compRatioCol = t.getChild('compression_ratio');
    const typeCol = t.getChild('event_type');

    if (!sizeCol || !typeCol) return { points: [], regressionLine: null, xMin: 0, xMax: 1 };

    const points: Array<[number, number]> = [];

    for (let i = 0; i < t.numRows; i++) {
      const evType = String(typeCol.get(i) ?? '');
      if (evType !== 'block_arrival') continue;

      const size = Number(sizeCol.get(i) ?? 0);
      const ratio = compRatioCol ? Number(compRatioCol.get(i) ?? 0) : 0;
      if (size > 0 && ratio > 0) {
        points.push([size, ratio]);
      }
    }

    if (points.length === 0) return { points: [], regressionLine: null, xMin: 0, xMax: 1 };

    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);

    const reg = linearRegression(xs, ys);
    const regressionLine: Data['regressionLine'] = reg
      ? [[xMin, reg.slope * xMin + reg.intercept], [xMax, reg.slope * xMax + reg.intercept]]
      : null;

    return { points, regressionLine, xMin, xMax } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    const refLine = data.regressionLine;
    return {
      tooltip: { trigger: 'item' },
      legend: { data: ['Blocks', '1:1 line', 'Regression'] },
      xAxis: { type: 'value', name: 'Wire size (bytes)' },
      yAxis: { type: 'value', name: 'Compression ratio' },
      series: [
        {
          name: 'Blocks',
          type: 'scatter',
          data: data.points,
          symbolSize: 3,
          large: true,
          largeThreshold: 2000,
          itemStyle: { color: t.accent.teal, opacity: 0.5 },
        },
        {
          name: '1:1 line',
          type: 'line',
          data: [[data.xMin, 1], [data.xMax, 1]],
          lineStyle: { color: t.muted, type: 'dashed', width: 1 },
          symbol: 'none',
          silent: true,
        },
        ...(refLine
          ? [
              {
                name: 'Regression',
                type: 'line' as const,
                data: [refLine[0], refLine[1]],
                lineStyle: { color: t.accent.amber, width: 2 },
                symbol: 'none' as const,
                silent: true,
              },
            ]
          : []),
      ],
    };
  },
});
