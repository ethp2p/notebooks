import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';

const TX_TYPES = ['legacy', 'eip2930', 'eip1559', 'blob', 'setcode'] as const;
type TxType = (typeof TX_TYPES)[number];

function txTypeLabel(n: number): TxType | null {
  if (n === 0) return 'legacy';
  if (n === 1) return 'eip2930';
  if (n === 2) return 'eip1559';
  if (n === 3) return 'blob';
  if (n === 4) return 'setcode';
  return null;
}

const DataSchema = z.object({
  hours: z.array(z.number().int()),
  byType: z.record(z.string(), z.array(z.number())),
});

export default defineChart({
  id: 'hourly-coverage-lines',
  topic: 'mempool-visibility',
  title: 'Hourly mempool coverage',
  description:
    'Fraction of transactions seen in the mempool before block inclusion, per hour per tx type.',
  queries: ['mempool_events'] as const,
  related: ['coverage-stacked-bar', 'coverage-heatmap'],
  context: () =>
    import(
      '../context/mempool_visibility/hourly_coverage_lines.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 2,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['mempool_events'] as Table | undefined;
    if (!t) return { hours: Array.from({ length: 24 }, (_, i) => i), byType: {} };

    const typeCol = t.getChild('tx_type')?.toArray() ?? [];
    const visCol = t.getChild('visibility')?.toArray() ?? [];
    const startCol = t.getChild('slot_start')?.toArray() ?? [];

    const totals: Record<TxType, number[]> = {
      legacy: Array(24).fill(0) as number[],
      eip2930: Array(24).fill(0) as number[],
      eip1559: Array(24).fill(0) as number[],
      blob: Array(24).fill(0) as number[],
      setcode: Array(24).fill(0) as number[],
    };
    const seen: Record<TxType, number[]> = {
      legacy: Array(24).fill(0) as number[],
      eip2930: Array(24).fill(0) as number[],
      eip1559: Array(24).fill(0) as number[],
      blob: Array(24).fill(0) as number[],
      setcode: Array(24).fill(0) as number[],
    };

    for (let i = 0; i < t.numRows; i++) {
      const h = new Date(String(startCol[i] ?? '')).getUTCHours();
      const label = txTypeLabel(Number(typeCol[i]));
      if (!label) continue;
      totals[label][h] = (totals[label][h] ?? 0) + 1;
      if (String(visCol[i] ?? '') === 'before') {
        seen[label][h] = (seen[label][h] ?? 0) + 1;
      }
    }

    const byType: Record<string, number[]> = {};
    for (const k of TX_TYPES) {
      byType[k] = totals[k].map((tot, i) =>
        tot === 0 ? 0 : (seen[k][i] ?? 0) / tot,
      );
    }

    return { hours: Array.from({ length: 24 }, (_, i) => i), byType };
  },

  option(data) {
    return {
      legend: { top: 0 },
      xAxis: { type: 'category', data: data.hours, name: 'hour (UTC)' },
      yAxis: {
        type: 'value',
        name: 'coverage',
        min: 0,
        max: 1,
        axisLabel: { formatter: (v: number) => `${(v * 100).toFixed(0)}%` },
      },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v: unknown) => `${(Number(v) * 100).toFixed(1)}%`,
      },
      series: TX_TYPES.map((k) => ({
        name: k,
        type: 'line' as const,
        data: data.byType[k] ?? [],
        symbolSize: 4,
        smooth: false,
      })),
    };
  },
});
