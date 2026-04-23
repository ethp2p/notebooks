import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const MAX_BLOBS = 9;

const DataSchema = z.object({
  // Blob count buckets 0..MAX_BLOBS
  buckets: z.array(z.number()),
  counts: z.array(z.number()),
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

export default defineChart({
  id: 'anomalies-by-blobcount-bar',
  topic: 'propagation-anomalies',
  title: 'Anomalous blocks by blob count',
  description:
    'Anomaly count per blob-count bucket (0-9). Shows whether the anomaly rate rises uniformly with blob count or whether certain blob counts produce disproportionately many outliers.',
  queries: ['block_events'] as const,
  related: ['anomaly-regression-scatter'],
  context: () =>
    import(
      '../context/propagation_anomalies/by_blobcount_bar.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 5,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) {
      return {
        buckets: Array.from({ length: MAX_BLOBS + 1 }, (_, i) => i),
        counts: Array<number>(MAX_BLOBS + 1).fill(0),
      };
    }

    const typeCol = t.getChild('event_type');
    const latCol = t.getChild('latency_ms');
    const blobsCol = t.getChild('blob_count');

    type Entry = { blobCount: number; latency: number };
    const rows: Entry[] = [];

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

    // Count anomalies per bucket
    const anomalyCount = new Map<number, number>();
    for (let b = 0; b <= MAX_BLOBS; b++) anomalyCount.set(b, 0);
    for (const r of rows) {
      const threshold = p95.get(r.blobCount) ?? 0;
      if (r.latency > threshold) {
        anomalyCount.set(r.blobCount, (anomalyCount.get(r.blobCount) ?? 0) + 1);
      }
    }

    const buckets = Array.from({ length: MAX_BLOBS + 1 }, (_, i) => i);
    const counts = buckets.map((b) => anomalyCount.get(b) ?? 0);

    return { buckets, counts } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { top: 16, right: 32, bottom: 40, left: 48, containLabel: true },
      xAxis: {
        type: 'category',
        data: data.buckets.map(String),
        name: 'blob count',
        nameLocation: 'middle',
        nameGap: 28,
      },
      yAxis: { type: 'value', name: 'anomaly count' },
      series: [
        {
          name: 'Anomalies',
          type: 'bar' as const,
          data: data.counts,
          itemStyle: { color: t.accent.amber },
        },
      ],
    };
  },
});
