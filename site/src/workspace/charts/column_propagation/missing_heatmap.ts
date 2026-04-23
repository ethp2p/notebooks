import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';

// Cell value: 0 = present, 1 = has missing observations.
const Cell = z.tuple([z.number().int(), z.number().int(), z.number().int()]);

const DataSchema = z.object({
  cols: z.array(z.string()),
  buckets: z.array(z.string()),
  cells: z.array(Cell),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'column-missing-heatmap',
  topic: 'column-propagation',
  title: 'Column missing-observation heatmap',
  description: 'Boolean flag per (column, bucket): 1 means at least one slot in that bucket had no observation for that column.',
  queries: ['col_first_seen_binned'] as const,
  related: ['column-first-seen-heatmap', 'column-delta-heatmap', 'column-normalized-heatmap'],
  context: () =>
    import(
      '../context/column_propagation/missing_heatmap.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 4,

  dataSchema: DataSchema,

  transform(raw) {
    const table = raw['col_first_seen_binned'] as Table | undefined;
    if (!table) return { cols: Array.from({ length: 128 }, (_, i) => String(i)), buckets: Array.from({ length: 480 }, (_, i) => String(i)), cells: [] };

    const colIdxArr = table.getChild('column_index')?.toArray() ?? [];
    const bktArr = table.getChild('time_bucket')?.toArray() ?? [];
    const missingArr = table.getChild('missing_count')?.toArray() ?? [];

    const cells: Array<[number, number, number]> = [];
    for (let i = 0; i < table.numRows; i++) {
      const c = Number(colIdxArr[i]);
      const b = Number(bktArr[i]);
      const m = missingArr[i];
      cells.push([c, b, m != null && Number(m) > 0 ? 1 : 0]);
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
        type: 'piecewise',
        pieces: [
          { value: 0, label: 'present', color: '#050510' },
          { value: 1, label: 'missing', color: '#e05c2a' },
        ],
        orient: 'horizontal',
        left: 'center',
        bottom: 12,
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
