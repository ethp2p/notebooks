import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

// Per-blob-count P95 threshold + regression line through normals only.

const MAX_BLOBS = 9;

const DataSchema = z.object({
  normals: z.array(z.tuple([z.number(), z.number()])),
  anomalies: z.array(z.tuple([z.number(), z.number()])),
  // regression: [[x, y], ...] two points spanning x range
  regression: z.array(z.tuple([z.number(), z.number()])),
  // markArea bands: [[{xAxis: lo}, {xAxis: hi, yAxis: p95}], ...]
  bands: z.array(
    z.tuple([
      z.object({ coord: z.tuple([z.number(), z.number()]) }),
      z.object({ coord: z.tuple([z.number(), z.number()]) }),
    ]),
  ),
});

type Data = z.infer<typeof DataSchema>;

function computeP95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = 0.95 * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return (sorted[lo] ?? 0) * (hi - idx) + (sorted[hi] ?? 0) * (idx - lo);
}

function linearRegression(points: Array<[number, number]>): (x: number) => number {
  if (points.length < 2) return (x) => x * 0;
  let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
  const n = points.length;
  for (const [x, y] of points) {
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumXY += x * y;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return () => sumY / n;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return (x) => slope * x + intercept;
}

export default defineChart({
  id: 'anomaly-regression-scatter',
  topic: 'propagation-anomalies',
  title: 'Block arrival latency: anomaly scatter',
  description:
    'Block arrival latency vs blob count. Anomalies (above P95 for their blob-count bucket) are highlighted. Regression line fitted through normal events only.',
  queries: ['block_events'] as const,
  related: ['anomalies-by-blobcount-bar'],
  context: () =>
    import(
      '../context/propagation_anomalies/regression_scatter.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 1,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return { normals: [], anomalies: [], regression: [], bands: [] };

    const typeCol = t.getChild('event_type');
    const latCol = t.getChild('latency_ms');
    const blobsCol = t.getChild('blob_count');

    // Collect block_arrival rows
    const rows: Array<{ blobCount: number; latency: number }> = [];
    for (let i = 0; i < t.numRows; i++) {
      const evType = String(typeCol?.get(i) ?? '');
      if (evType !== 'block_arrival') continue;
      rows.push({
        blobCount: Math.min(Number(blobsCol?.get(i) ?? 0), MAX_BLOBS),
        latency: Number(latCol?.get(i) ?? 0),
      });
    }

    // Compute P95 per blob-count bucket
    const byBlob = new Map<number, number[]>();
    for (let b = 0; b <= MAX_BLOBS; b++) byBlob.set(b, []);
    for (const r of rows) {
      byBlob.get(r.blobCount)?.push(r.latency);
    }
    const p95 = new Map<number, number>();
    for (let b = 0; b <= MAX_BLOBS; b++) {
      p95.set(b, computeP95(byBlob.get(b) ?? []));
    }

    // Split into normals and anomalies
    const normals: Array<[number, number]> = [];
    const anomalies: Array<[number, number]> = [];
    for (const r of rows) {
      const threshold = p95.get(r.blobCount) ?? 0;
      if (r.latency > threshold) {
        anomalies.push([r.blobCount, r.latency]);
      } else {
        normals.push([r.blobCount, r.latency]);
      }
    }

    // Regression through normals only
    const regFn = linearRegression(normals);
    const regression: Array<[number, number]> = [
      [0, regFn(0)],
      [MAX_BLOBS, regFn(MAX_BLOBS)],
    ];

    // markArea bands: one rectangle per blob-count bucket from [b-0.5, 0] to [b+0.5, p95]
    const bands: Data['bands'] = [];
    for (let b = 0; b <= MAX_BLOBS; b++) {
      const threshold = p95.get(b) ?? 0;
      if (threshold <= 0) continue;
      bands.push([
        { coord: [b - 0.5, 0] },
        { coord: [b + 0.5, threshold] },
      ]);
    }

    return { normals, anomalies, regression, bands } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as { seriesName: string; value: [number, number] };
          return `${p.seriesName}<br/>blobs: ${p.value[0]}, latency: ${p.value[1].toFixed(0)} ms`;
        },
      },
      legend: { data: ['Normal', 'Anomaly', 'P95 band', 'Regression'] },
      xAxis: {
        type: 'value',
        name: 'blob count',
        minInterval: 1,
        min: -0.5,
        max: MAX_BLOBS + 0.5,
      },
      yAxis: { type: 'value', name: 'latency (ms)' },
      series: [
        {
          name: 'P95 band',
          type: 'line' as const,
          data: [],
          markArea: {
            silent: true,
            itemStyle: { color: t.accent.amber, opacity: 0.12 },
            data: data.bands,
          },
        },
        {
          name: 'Normal',
          type: 'scatter' as const,
          data: data.normals,
          symbolSize: 3,
          large: true,
          largeThreshold: 2000,
          itemStyle: { color: t.accent.teal, opacity: 0.4 },
        },
        {
          name: 'Anomaly',
          type: 'scatter' as const,
          data: data.anomalies,
          symbolSize: 5,
          itemStyle: { color: t.accent.amber },
        },
        {
          name: 'Regression',
          type: 'line' as const,
          data: data.regression,
          lineStyle: { color: t.accent.purple, width: 2, type: 'dashed' },
          itemStyle: { color: t.accent.purple },
          symbol: 'none',
          smooth: false,
        },
      ],
    };
  },
});
