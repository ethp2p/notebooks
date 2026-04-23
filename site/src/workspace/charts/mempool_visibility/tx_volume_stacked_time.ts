import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';

const VISIBILITIES = ['before', 'after', 'never'] as const;

const DataSchema = z.object({
  hours: z.array(z.string()),
  series: z.record(z.string(), z.array(z.number())),
});

export default defineChart({
  id: 'tx-volume-stacked-time',
  topic: 'mempool-visibility',
  title: 'Transaction volume by visibility and hour',
  description:
    'Hourly transaction totals stacked by mempool visibility (before/after/never).',
  queries: ['mempool_events'] as const,
  related: ['coverage-stacked-bar', 'hourly-coverage-lines'],
  context: () =>
    import(
      '../context/mempool_visibility/tx_volume_stacked_time.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 3,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['mempool_events'] as Table | undefined;
    const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00');
    if (!t) return { hours, series: {} };

    const visCol = t.getChild('visibility')?.toArray() ?? [];
    const startCol = t.getChild('slot_start')?.toArray() ?? [];

    const counts: Record<string, number[]> = {
      before: Array(24).fill(0) as number[],
      after: Array(24).fill(0) as number[],
      never: Array(24).fill(0) as number[],
    };

    for (let i = 0; i < t.numRows; i++) {
      const h = new Date(String(startCol[i] ?? '')).getUTCHours();
      const vis = String(visCol[i] ?? 'never');
      if (vis === 'before' || vis === 'after' || vis === 'never') {
        const arr = counts[vis];
        if (arr) arr[h] = (arr[h] ?? 0) + 1;
      }
    }

    return { hours, series: counts };
  },

  option(data) {
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, data: VISIBILITIES.slice() },
      xAxis: { type: 'category', data: data.hours, name: 'hour (UTC)' },
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
