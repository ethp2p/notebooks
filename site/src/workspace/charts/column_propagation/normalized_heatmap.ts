import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';

const Cell = z.tuple([z.number().int(), z.number().int(), z.number().nullable()]);

const DataSchema = z.object({
  cols: z.array(z.string()),
  buckets: z.array(z.string()),
  cells: z.array(Cell),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'column-normalized-heatmap',
  topic: 'column-propagation',
  title: 'Column normalized heatmap',
  description: 'Per-column min-max normalization of median_ms; 0 is the column\'s fastest bucket, 1 the slowest.',
  queries: ['col_first_seen_binned'] as const,
  related: ['column-first-seen-heatmap', 'column-delta-heatmap', 'column-missing-heatmap'],
  context: () =>
    import(
      '../context/column_propagation/normalized_heatmap.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 3,

  dataSchema: DataSchema,

  transform(raw) {
    const table = raw['col_first_seen_binned'] as Table | undefined;
    if (!table) return { cols: Array.from({ length: 128 }, (_, i) => String(i)), buckets: Array.from({ length: 480 }, (_, i) => String(i)), cells: [] };

    const colIdxArr = table.getChild('column_index')?.toArray() ?? [];
    const bktArr = table.getChild('time_bucket')?.toArray() ?? [];
    const medArr = table.getChild('median_ms')?.toArray() ?? [];

    // Compute per-column min and max of median_ms.
    const colMin = new Map<number, number>();
    const colMax = new Map<number, number>();
    for (let i = 0; i < table.numRows; i++) {
      const v = medArr[i];
      if (v == null) continue;
      const c = Number(colIdxArr[i]);
      const n = Number(v);
      const curMin = colMin.get(c);
      if (curMin === undefined || n < curMin) colMin.set(c, n);
      const curMax = colMax.get(c);
      if (curMax === undefined || n > curMax) colMax.set(c, n);
    }

    const cells: Array<[number, number, number | null]> = [];
    for (let i = 0; i < table.numRows; i++) {
      const v = medArr[i];
      const c = Number(colIdxArr[i]);
      const b = Number(bktArr[i]);
      if (v == null) {
        cells.push([c, b, null]);
      } else {
        const min = colMin.get(c) ?? 0;
        const max = colMax.get(c) ?? 0;
        const range = max - min;
        // Zero-range columns map to 0 to avoid divide-by-zero.
        const norm = range === 0 ? 0 : (Number(v) - min) / range;
        cells.push([c, b, norm]);
      }
    }

    return {
      cols: Array.from({ length: 128 }, (_, i) => String(i)),
      buckets: Array.from({ length: 480 }, (_, i) => String(i)),
      cells,
    } satisfies Data;
  },

  option(data) {
    return {
      tooltip: { position: 'top' },
      grid: { left: 48, right: 16, top: 24, bottom: 64 },
      xAxis: {
        type: 'category',
        data: data.buckets,
        splitArea: { show: false },
        name: '5-min bucket',
      },
      yAxis: {
        type: 'category',
        data: data.cols,
        splitArea: { show: false },
        name: 'column index',
      },
      visualMap: {
        min: 0,
        max: 1,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 12,
        inRange: { color: ['#050510', '#f5efa8'] },
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0 },
        { type: 'slider', xAxisIndex: 0, height: 12 },
      ],
      series: [
        {
          type: 'heatmap',
          data: data.cells,
          progressive: 5000,
          progressiveThreshold: 10000,
          emphasis: { itemStyle: { borderColor: '#2c2822', borderWidth: 1 } },
        },
      ],
    };
  },
});
