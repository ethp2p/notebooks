import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

// Thresholds: p95 of wire_size_bytes and p95 of latency_ms define the quadrant boundaries.
// Computed from data; stored in DataSchema so the option function can draw the lines.

const DataSchema = z.object({
  // [wire_size_bytes, latency_ms]
  points: z.array(z.tuple([z.number(), z.number()])),
  sizeThreshold: z.number(),
  latencyThreshold: z.number(),
});

type Data = z.infer<typeof DataSchema>;

function p95(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const pos = 0.95 * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return (sorted[lo] ?? 0) + ((sorted[hi] ?? 0) - (sorted[lo] ?? 0)) * (pos - lo);
}

export default defineChart({
  id: 'double-outlier-quadrant-scatter',
  topic: 'block-propagation',
  title: 'Double-outlier quadrant: large and slow blocks',
  description:
    'Scatter of propagation latency vs wire size with p95 threshold lines defining four quadrants. Points in the top-right quadrant are both large and slow.',
  queries: ['block_events'] as const,
  related: ['size-residuals-scatter', 'entity-anomaly-rate-bar'],
  context: () =>
    import(
      '../context/block_propagation/double_outlier_quadrant_scatter.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 17,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return { points: [], sizeThreshold: 0, latencyThreshold: 0 };

    const typeCol = t.getChild('event_type');
    const sizeCol = t.getChild('wire_size_bytes');
    const latCol = t.getChild('latency_ms');

    if (!typeCol || !sizeCol || !latCol) {
      return { points: [], sizeThreshold: 0, latencyThreshold: 0 };
    }

    const points: Array<[number, number]> = [];

    for (let i = 0; i < t.numRows; i++) {
      const evType = String(typeCol.get(i) ?? '');
      if (evType !== 'block_arrival') continue;
      points.push([Number(sizeCol.get(i) ?? 0), Number(latCol.get(i) ?? 0)]);
    }

    if (points.length === 0) return { points: [], sizeThreshold: 0, latencyThreshold: 0 };

    const sortedSizes = [...points.map((p) => p[0])].sort((a, b) => a - b);
    const sortedLats = [...points.map((p) => p[1])].sort((a, b) => a - b);

    return {
      points,
      sizeThreshold: p95(sortedSizes),
      latencyThreshold: p95(sortedLats),
    } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    const { sizeThreshold: st, latencyThreshold: lt } = data;

    const sizes = data.points.map((p) => p[0]);
    const lats = data.points.map((p) => p[1]);
    const xMin = sizes.length > 0 ? Math.min(...sizes) : 0;
    const xMax = sizes.length > 0 ? Math.max(...sizes) : 1;
    const yMin = lats.length > 0 ? Math.min(...lats) : 0;
    const yMax = lats.length > 0 ? Math.max(...lats) : 1;

    return {
      tooltip: { trigger: 'item' },
      xAxis: { type: 'value', name: 'Wire size (bytes)', min: xMin, max: xMax },
      yAxis: { type: 'value', name: 'Latency (ms)', min: yMin, max: yMax },
      series: [
        {
          type: 'scatter',
          data: data.points,
          symbolSize: 3,
          large: true,
          largeThreshold: 2000,
          itemStyle: { color: t.accent.teal, opacity: 0.4 },
        },
        {
          // Vertical size threshold
          name: `p95 size: ${Math.round(st / 1000)}KB`,
          type: 'line',
          data: [[st, yMin], [st, yMax]],
          lineStyle: { color: t.accent.amber, type: 'dashed', width: 1.5 },
          symbol: 'none',
          silent: true,
        },
        {
          // Horizontal latency threshold
          name: `p95 latency: ${Math.round(lt)}ms`,
          type: 'line',
          data: [[xMin, lt], [xMax, lt]],
          lineStyle: { color: t.accent.purple, type: 'dashed', width: 1.5 },
          symbol: 'none',
          silent: true,
        },
      ],
      legend: {
        data: [
          `p95 size: ${Math.round(st / 1000)}KB`,
          `p95 latency: ${Math.round(lt)}ms`,
        ],
      },
    };
  },
});
