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

// Cells: [hour (0-23), tx_type_index (0-4), coverage_fraction]
const DataSchema = z.object({
  cells: z.array(z.tuple([z.number(), z.number(), z.number()])),
});

export default defineChart({
  id: 'coverage-heatmap',
  topic: 'mempool-visibility',
  title: 'Mempool coverage heatmap (tx type × hour)',
  description:
    'Heatmap of mempool coverage fraction across 5 transaction types and 24 hours of the day.',
  queries: ['mempool_events'] as const,
  related: ['hourly-coverage-lines', 'coverage-stacked-bar'],
  context: () =>
    import(
      '../context/mempool_visibility/coverage_heatmap.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 4,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['mempool_events'] as Table | undefined;
    if (!t) return { cells: [] };

    const typeCol = t.getChild('tx_type')?.toArray() ?? [];
    const visCol = t.getChild('visibility')?.toArray() ?? [];
    const startCol = t.getChild('slot_start')?.toArray() ?? [];

    // totals[typeIdx][hour], seen[typeIdx][hour]
    const totals: number[][] = Array.from({ length: 5 }, () => Array(24).fill(0) as number[]);
    const seen: number[][] = Array.from({ length: 5 }, () => Array(24).fill(0) as number[]);

    for (let i = 0; i < t.numRows; i++) {
      const typeN = Number(typeCol[i]);
      const label = txTypeLabel(typeN);
      if (!label) continue;
      const typeIdx = TX_TYPES.indexOf(label);
      const h = new Date(String(startCol[i] ?? '')).getUTCHours();
      const tArr = totals[typeIdx];
      if (tArr) tArr[h] = (tArr[h] ?? 0) + 1;
      if (String(visCol[i] ?? '') === 'before') {
        const sArr = seen[typeIdx];
        if (sArr) sArr[h] = (sArr[h] ?? 0) + 1;
      }
    }

    const cells: [number, number, number][] = [];
    for (let ti = 0; ti < 5; ti++) {
      for (let h = 0; h < 24; h++) {
        const tot = totals[ti]?.[h] ?? 0;
        const s = seen[ti]?.[h] ?? 0;
        cells.push([h, ti, tot === 0 ? 0 : s / tot]);
      }
    }

    return { cells };
  },

  option(data) {
    return {
      tooltip: {
        position: 'top',
        formatter: (p: unknown) => {
          const params = p as { data: [number, number, number] };
          const [h, ti, v] = params.data;
          return `${TX_TYPES[ti] ?? ''} @ ${h}:00 — ${(v * 100).toFixed(1)}%`;
        },
      },
      xAxis: {
        type: 'category',
        data: Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00'),
        name: 'hour (UTC)',
      },
      yAxis: {
        type: 'category',
        data: TX_TYPES.slice(),
        name: 'tx type',
      },
      visualMap: {
        min: 0,
        max: 1,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        text: ['100%', '0%'],
      },
      series: [
        {
          type: 'heatmap' as const,
          data: data.cells,
          emphasis: { itemStyle: { borderColor: '#333', borderWidth: 1 } },
        },
      ],
    };
  },
});
