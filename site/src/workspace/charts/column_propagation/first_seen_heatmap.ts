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
  id: 'column-first-seen-heatmap',
  topic: 'column-propagation',
  title: 'Column first-seen heatmap',
  description: 'Median first-seen ms per column per 5-minute bucket.',
  queries: ['col_first_seen_binned'] as const,
  related: ['column-delta-heatmap', 'column-normalized-heatmap', 'column-missing-heatmap'],
  context: () =>
    import(
      '../context/column_propagation/first_seen_heatmap.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 1,

  dataSchema: DataSchema,

  transform(raw) {
    const table = raw['col_first_seen_binned'] as Table | undefined;
    if (!table) return { cols: Array.from({ length: 128 }, (_, i) => String(i)), buckets: Array.from({ length: 480 }, (_, i) => String(i)), cells: [] };

    const colIdx = table.getChild('column_index')?.toArray() ?? [];
    const bkt = table.getChild('time_bucket')?.toArray() ?? [];
    const med = table.getChild('median_ms')?.toArray() ?? [];

    const cells: Array<[number, number, number | null]> = [];
    for (let i = 0; i < table.numRows; i++) {
      const v = med[i];
      cells.push([Number(colIdx[i]), Number(bkt[i]), v == null ? null : Number(v)]);
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
        max: 12000,
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
