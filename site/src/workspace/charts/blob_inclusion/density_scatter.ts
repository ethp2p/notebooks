import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const DataSchema = z.object({
  // Each point: [slot_start_ms, blob_count]
  points: z.array(z.tuple([z.number(), z.number()])),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'blob-density-scatter',
  topic: 'blob-inclusion',
  title: 'Blobs per slot',
  description:
    'Scatter plot of blob count per slot over the day, colored by blob count.',
  queries: ['blob_events'] as const,
  related: ['blob-count-stacked-epoch', 'blob-popularity-heatmap'],
  context: () =>
    import(
      '../context/blob_inclusion/density_scatter.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 1,

  dataSchema: DataSchema,

  transform(raw) {
    const table = raw['blob_events'] as Table | undefined;
    if (!table) return { points: [] };

    const slotStartCol = table.getChild('slot_start');
    const blobCountCol = table.getChild('blob_count');

    const points: [number, number][] = [];
    for (let i = 0; i < table.numRows; i++) {
      const slotStartRaw = slotStartCol?.get(i);
      const blobCount = blobCountCol?.get(i) ?? 0;

      // slot_start may arrive as a Date object or as a ms-timestamp number
      const slotStartMs =
        slotStartRaw instanceof Date
          ? slotStartRaw.getTime()
          : typeof slotStartRaw === 'number'
            ? slotStartRaw
            : 0;

      points.push([slotStartMs, Number(blobCount)]);
    }

    return { points } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as { value: [number, number] };
          const d = new Date(p.value[0]);
          return `${d.toISOString().slice(11, 19)} UTC — ${p.value[1]} blobs`;
        },
      },
      xAxis: {
        type: 'time',
        name: 'Time (UTC)',
      },
      yAxis: {
        type: 'value',
        name: 'Blob count',
        minInterval: 1,
      },
      visualMap: {
        show: true,
        type: 'continuous',
        dimension: 1,
        min: 0,
        max: 9,
        inRange: {
          color: [t.accent.teal, t.accent.amber],
        },
        text: ['9', '0'],
        orient: 'vertical',
        right: 0,
        top: 'center',
      },
      series: [
        {
          type: 'scatter',
          data: data.points,
          symbolSize: 4,
          large: true,
          largeThreshold: 2000,
        },
      ],
    };
  },
});
