import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';

const TX_TYPES = ['legacy', 'eip2930', 'eip1559', 'blob', 'setcode'] as const;
type TxType = (typeof TX_TYPES)[number];

const PERCENTILES = [0.5, 0.75, 0.9, 0.95, 0.99] as const;
const PERCENTILE_LABELS = ['p50', 'p75', 'p90', 'p95', 'p99'] as const;
type PercentileLabel = (typeof PERCENTILE_LABELS)[number];

function txTypeLabel(n: number): TxType | null {
  if (n === 0) return 'legacy';
  if (n === 1) return 'eip2930';
  if (n === 2) return 'eip1559';
  if (n === 3) return 'blob';
  if (n === 4) return 'setcode';
  return null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(Math.floor(p * sorted.length), sorted.length - 1);
  return sorted[idx] ?? 0;
}

// byType[txType][pLabel] = value in ms
const DataSchema = z.object({
  byType: z.record(z.string(), z.record(z.string(), z.number())),
});

export default defineChart({
  id: 'delay-percentile-lines',
  topic: 'mempool-visibility',
  title: 'Post-inclusion delay percentiles by transaction type',
  description:
    'P50/P75/P90/P95/P99 of post-inclusion delay (ms) per transaction type, for transactions seen after inclusion.',
  queries: ['mempool_events'] as const,
  related: ['delay-histogram-facets', 'age-percentile-lines'],
  context: () =>
    import(
      '../context/mempool_visibility/delay_percentile_lines.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 7,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['mempool_events'] as Table | undefined;
    if (!t) return { byType: {} };

    const typeCol = t.getChild('tx_type')?.toArray() ?? [];
    const visCol = t.getChild('visibility')?.toArray() ?? [];
    const delayCol = t.getChild('delay_ms')?.toArray() ?? [];

    const buckets: Record<TxType, number[]> = {
      legacy: [],
      eip2930: [],
      eip1559: [],
      blob: [],
      setcode: [],
    };

    for (let i = 0; i < t.numRows; i++) {
      if (String(visCol[i] ?? '') !== 'after') continue;
      const delayRaw = delayCol[i];
      if (delayRaw === null || delayRaw === undefined) continue;
      const delay = Number(delayRaw);
      if (!isFinite(delay) || delay < 0) continue;
      const label = txTypeLabel(Number(typeCol[i]));
      if (!label) continue;
      buckets[label].push(delay);
    }

    const byType: Record<string, Record<string, number>> = {};
    for (const k of TX_TYPES) {
      const sorted = buckets[k].sort((a, b) => a - b);
      const pMap: Record<string, number> = {};
      for (let pi = 0; pi < PERCENTILES.length; pi++) {
        pMap[PERCENTILE_LABELS[pi] ?? 'p50'] = percentile(sorted, PERCENTILES[pi] ?? 0.5);
      }
      byType[k] = pMap;
    }

    return { byType };
  },

  option(data) {
    return {
      legend: { top: 0 },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v: unknown) => `${Number(v).toLocaleString()} ms`,
      },
      xAxis: { type: 'category', data: TX_TYPES.slice(), name: 'tx type' },
      yAxis: {
        type: 'log',
        name: 'delay (ms)',
        axisLabel: { formatter: (v: number) => `${v.toLocaleString()}` },
      },
      series: PERCENTILE_LABELS.map((pl: PercentileLabel) => ({
        name: pl,
        type: 'line' as const,
        data: TX_TYPES.map((k) => data.byType[k]?.[pl] ?? 0),
        symbolSize: 6,
        smooth: false,
      })),
    };
  },
});
