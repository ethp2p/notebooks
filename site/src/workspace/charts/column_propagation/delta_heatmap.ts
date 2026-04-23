import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';

const Cell = z.tuple([z.number().int(), z.number().int(), z.number().nullable()]);

const DataSchema = z.object({
  cols: z.array(z.string()),
  buckets: z.array(z.string()),
  cells: z.array(Cell),
  maxDelta: z.number(),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'column-delta-heatmap',
  topic: 'column-propagation',
  title: 'Column delta heatmap',
  description: 'Per-bucket delta from each column\'s minimum median_ms across all buckets.',
  queries: ['col_first_seen_binned'] as const,
  related: ['column-first-seen-heatmap', 'column-normalized-heatmap', 'column-missing-heatmap'],
  context: () =>
    import(
      '../context/column_propagation/delta_heatmap.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 2,

  dataSchema: DataSchema,

  transform(raw) {
    const table = raw['col_first_seen_binned'] as Table | undefined;
    if (!table) return { cols: Array.from({ length: 128 }, (_, i) => String(i)), buckets: Array.from({ length: 480 }, (_, i) => String(i)), cells: [], maxDelta: 0 };

    const colIdxArr = table.getChild('column_index')?.toArray() ?? [];
    const bktArr = table.getChild('time_bucket')?.toArray() ?? [];
    const medArr = table.getChild('median_ms')?.toArray() ?? [];

    // Compute per-column minimum of median_ms.
    const colMin = new Map<number, number>();
    for (let i = 0; i < table.numRows; i++) {
      const v = medArr[i];
      if (v == null) continue;
      const c = Number(colIdxArr[i]);
      const cur = colMin.get(c);
      if (cur === undefined || Number(v) < cur) {
        colMin.set(c, Number(v));
      }
    }

    const cells: Array<[number, number, number | null]> = [];
    let maxDelta = 0;
    for (let i = 0; i < table.numRows; i++) {
      const v = medArr[i];
      const c = Number(colIdxArr[i]);
      const b = Number(bktArr[i]);
      if (v == null) {
        cells.push([c, b, null]);
      } else {
        const min = colMin.get(c) ?? 0;
        const delta = Number(v) - min;
        if (delta > maxDelta) maxDelta = delta;
        cells.push([c, b, delta]);
      }
    }

    return {
      cols: Array.from({ length: 128 }, (_, i) => String(i)),
      buckets: Array.from({ length: 480 }, (_, i) => String(i)),
      cells,
      maxDelta,
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
        max: Math.max(data.maxDelta, 1),
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
