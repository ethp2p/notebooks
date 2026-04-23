import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const DataSchema = z.object({
  // [epoch_index, blob_count, count_of_slots]
  cells: z.array(z.tuple([z.number(), z.number(), z.number()])),
  epochs: z.array(z.number()),
  maxCount: z.number(),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'blob-popularity-heatmap',
  topic: 'blob-inclusion',
  title: 'Blob count popularity heatmap',
  description:
    'Heatmap of how often each blob-count value (0-9) appears, bucketed by epoch.',
  queries: ['blob_events'] as const,
  related: ['blob-density-scatter', 'blob-count-stacked-epoch'],
  context: () =>
    import(
      '../context/blob_inclusion/popularity_heatmap.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 3,

  dataSchema: DataSchema,

  transform(raw) {
    const table = raw['blob_events'] as Table | undefined;
    if (!table) return { cells: [], epochs: [], maxCount: 0 };

    const epochCol = table.getChild('epoch');
    const blobCountCol = table.getChild('blob_count');

    // epoch -> blob_count -> slot count
    const map = new Map<number, Map<number, number>>();

    for (let i = 0; i < table.numRows; i++) {
      const epoch = Number(epochCol?.get(i) ?? 0);
      const blobCount = Math.min(Number(blobCountCol?.get(i) ?? 0), 9);

      if (!map.has(epoch)) map.set(epoch, new Map<number, number>());
      const inner = map.get(epoch) ?? new Map<number, number>();
      inner.set(blobCount, (inner.get(blobCount) ?? 0) + 1);
      map.set(epoch, inner);
    }

    const epochs = Array.from(map.keys()).sort((a, b) => a - b);
    const cells: [number, number, number][] = [];
    let maxCount = 0;

    for (let ei = 0; ei < epochs.length; ei++) {
      const epoch = epochs[ei] ?? 0;
      const inner = map.get(epoch) ?? new Map<number, number>();
      for (let bc = 0; bc <= 9; bc++) {
        const count = inner.get(bc) ?? 0;
        cells.push([ei, bc, count]);
        if (count > maxCount) maxCount = count;
      }
    }

    return { cells, epochs, maxCount } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: {
        formatter: (params: unknown) => {
          const p = params as { value: [number, number, number] };
          const epoch = data.epochs[p.value[0]] ?? p.value[0];
          return `Epoch ${epoch} · ${p.value[1]} blobs/slot · ${p.value[2]} slots`;
        },
      },
      xAxis: {
        type: 'category',
        data: data.epochs.map(String),
        name: 'Epoch',
        axisLabel: { rotate: 45, interval: Math.floor(data.epochs.length / 10) },
      },
      yAxis: {
        type: 'category',
        data: Array.from({ length: 10 }, (_, i) => String(i)),
        name: 'Blob count',
      },
      visualMap: {
        show: true,
        type: 'continuous',
        min: 0,
        max: data.maxCount,
        inRange: {
          color: [t.accent.amber, t.accent.purple],
        },
        orient: 'horizontal',
        bottom: 0,
        left: 'center',
      },
      series: [
        {
          type: 'heatmap',
          data: data.cells,
          emphasis: { itemStyle: { borderColor: t.fg, borderWidth: 1 } },
        },
      ],
    };
  },
});
