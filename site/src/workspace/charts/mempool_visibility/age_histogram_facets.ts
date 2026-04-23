import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';

const TX_TYPES = ['legacy', 'eip2930', 'eip1559', 'blob', 'setcode'] as const;
type TxType = (typeof TX_TYPES)[number];

// Log2-ish bucket boundaries in ms — matches mempool_visibility.ts BOUNDS_MS
const BOUNDS_MS = [
  500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000, 512000,
  1024000, 2048000, 3600000,
] as const;

function bucketLabel(lo: number | null, hi: number | null): string {
  const fmt = (ms: number) =>
    ms >= 60000
      ? `${(ms / 60000).toFixed(0)}m`
      : ms >= 1000
        ? `${(ms / 1000).toFixed(0)}s`
        : `${ms}ms`;
  if (lo === null) return `<${fmt(BOUNDS_MS[0])}`;
  if (hi === null) return `>=${fmt(lo)}`;
  return `${fmt(lo)}-${fmt(hi)}`;
}

const BUCKET_LABELS: string[] = [
  bucketLabel(null, BOUNDS_MS[0]),
  ...Array.from({ length: BOUNDS_MS.length - 1 }, (_, i) =>
    bucketLabel(BOUNDS_MS[i] ?? 0, BOUNDS_MS[i + 1] ?? null),
  ),
  bucketLabel(BOUNDS_MS[BOUNDS_MS.length - 1] ?? 0, null),
];

function toBucket(ms: number): number {
  for (let i = 0; i < BOUNDS_MS.length; i++) {
    if (ms < (BOUNDS_MS[i] ?? Infinity)) return i;
  }
  return BOUNDS_MS.length;
}

function txTypeLabel(n: number): TxType | null {
  if (n === 0) return 'legacy';
  if (n === 1) return 'eip2930';
  if (n === 2) return 'eip1559';
  if (n === 3) return 'blob';
  if (n === 4) return 'setcode';
  return null;
}

const DataSchema = z.object({
  labels: z.array(z.string()),
  // byType[txType] = array of counts per bucket
  byType: z.record(z.string(), z.array(z.number())),
});

export default defineChart({
  id: 'age-histogram-facets',
  topic: 'mempool-visibility',
  title: 'Mempool age distribution by transaction type',
  description:
    'Bar histogram of mempool age (ms before inclusion) per transaction type, using log-scale time buckets.',
  queries: ['mempool_events'] as const,
  related: ['age-percentile-lines', 'delay-histogram-facets'],
  context: () =>
    import(
      '../context/mempool_visibility/age_histogram_facets.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 6,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['mempool_events'] as Table | undefined;
    const numBuckets = BOUNDS_MS.length + 1;
    if (!t) {
      return {
        labels: BUCKET_LABELS,
        byType: Object.fromEntries(TX_TYPES.map((k) => [k, Array(numBuckets).fill(0)])),
      };
    }

    const typeCol = t.getChild('tx_type')?.toArray() ?? [];
    const visCol = t.getChild('visibility')?.toArray() ?? [];
    const ageCol = t.getChild('age_ms')?.toArray() ?? [];

    const counts: Record<TxType, number[]> = {
      legacy: Array(numBuckets).fill(0) as number[],
      eip2930: Array(numBuckets).fill(0) as number[],
      eip1559: Array(numBuckets).fill(0) as number[],
      blob: Array(numBuckets).fill(0) as number[],
      setcode: Array(numBuckets).fill(0) as number[],
    };

    for (let i = 0; i < t.numRows; i++) {
      if (String(visCol[i] ?? '') !== 'before') continue;
      const ageRaw = ageCol[i];
      if (ageRaw === null || ageRaw === undefined) continue;
      const age = Number(ageRaw);
      if (!isFinite(age) || age < 0) continue;
      const label = txTypeLabel(Number(typeCol[i]));
      if (!label) continue;
      const b = toBucket(age);
      counts[label][b] = (counts[label][b] ?? 0) + 1;
    }

    return {
      labels: BUCKET_LABELS,
      byType: Object.fromEntries(TX_TYPES.map((k) => [k, counts[k]])),
    };
  },

  option(data) {
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, show: false },
      grid: TX_TYPES.map((_, i) => ({
        left: `${(i * 20) + 2}%`,
        width: '16%',
        bottom: '15%',
        top: '60px',
      })),
      xAxis: TX_TYPES.map((k, i) => ({
        type: 'category' as const,
        data: data.labels,
        gridIndex: i,
        name: k,
        nameLocation: 'middle' as const,
        nameGap: 30,
        axisLabel: { show: false },
      })),
      yAxis: TX_TYPES.map((_, i) => ({
        type: 'value' as const,
        gridIndex: i,
        name: i === 0 ? 'count' : '',
        minInterval: 1,
      })),
      series: TX_TYPES.map((k, i) => ({
        name: k,
        type: 'bar' as const,
        xAxisIndex: i,
        yAxisIndex: i,
        data: data.byType[k] ?? [],
        barWidth: '80%',
      })),
    };
  },
});
