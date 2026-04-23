import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';

const TX_TYPES = ['legacy', 'eip2930', 'eip1559', 'blob', 'setcode'] as const;
type TxType = (typeof TX_TYPES)[number];
const VISIBILITIES = ['before', 'after', 'never'] as const;

function txTypeLabel(n: number): TxType | null {
  if (n === 0) return 'legacy';
  if (n === 1) return 'eip2930';
  if (n === 2) return 'eip1559';
  if (n === 3) return 'blob';
  if (n === 4) return 'setcode';
  return null;
}

const DataSchema = z.object({
  types: z.array(z.string()),
  series: z.record(z.string(), z.array(z.number())),
});

export default defineChart({
  id: 'coverage-stacked-bar',
  topic: 'mempool-visibility',
  title: 'Mempool coverage by transaction type',
  description: 'Stacked bar showing before/after/never mempool visibility counts per transaction type.',
  queries: ['mempool_events'] as const,
  related: ['hourly-coverage-lines', 'coverage-heatmap'],
  context: () =>
    import(
      '../context/mempool_visibility/coverage_stacked.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 1,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['mempool_events'] as Table | undefined;
    if (!t) return { types: TX_TYPES.slice(), series: {} };

    const typeCol = t.getChild('tx_type')?.toArray() ?? [];
    const visCol = t.getChild('visibility')?.toArray() ?? [];

    const counts: Record<TxType, Record<string, number>> = {
      legacy: { before: 0, after: 0, never: 0 },
      eip2930: { before: 0, after: 0, never: 0 },
      eip1559: { before: 0, after: 0, never: 0 },
      blob: { before: 0, after: 0, never: 0 },
      setcode: { before: 0, after: 0, never: 0 },
    };

    for (let i = 0; i < t.numRows; i++) {
      const label = txTypeLabel(Number(typeCol[i]));
      if (!label) continue;
      const vis = String(visCol[i] ?? 'never');
      if (vis === 'before' || vis === 'after' || vis === 'never') {
        counts[label][vis] = (counts[label][vis] ?? 0) + 1;
      }
    }

    const series: Record<string, number[]> = {};
    for (const vis of VISIBILITIES) {
      series[vis] = TX_TYPES.map((k) => counts[k][vis] ?? 0);
    }

    return { types: TX_TYPES.slice(), series };
  },

  option(data) {
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, data: VISIBILITIES.slice() },
      xAxis: { type: 'category', data: data.types, name: 'tx type' },
      yAxis: { type: 'value', name: 'transactions' },
      series: VISIBILITIES.map((vis) => ({
        name: vis,
        type: 'bar' as const,
        stack: 'total',
        data: data.series[vis] ?? [],
      })),
    };
  },
});
