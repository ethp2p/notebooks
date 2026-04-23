import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const DataSchema = z.object({
  // [epoch_index, slot_in_epoch, blob_count]
  cells: z.array(z.tuple([z.number(), z.number(), z.number()])),
  epochs: z.array(z.number()),
  maxBlobCount: z.number(),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'blob-slot-heatmap-vertical',
  topic: 'blob-inclusion',
  title: 'Blob count by slot-in-epoch',
  description:
    'Heatmap of blob count per slot, with slot position within epoch on the y-axis.',
  queries: ['blob_events'] as const,
  related: ['blob-slot-heatmap-facet', 'blob-popularity-heatmap'],
  context: () =>
    import(
      '../context/blob_inclusion/slot_heatmap_vertical.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 4,

  dataSchema: DataSchema,

  transform(raw) {
    const table = raw['blob_events'] as Table | undefined;
    if (!table) return { cells: [], epochs: [], maxBlobCount: 0 };

    const epochCol = table.getChild('epoch');
    const slotCol = table.getChild('slot');
    const blobCountCol = table.getChild('blob_count');

    // epoch -> slot_in_epoch -> blob_count (last write wins; one row per slot)
    const epochSet = new Set<number>();
    const cellMap = new Map<string, number>();

    for (let i = 0; i < table.numRows; i++) {
      const epoch = Number(epochCol?.get(i) ?? 0);
      const slot = Number(slotCol?.get(i) ?? 0);
      const blobCount = Number(blobCountCol?.get(i) ?? 0);
      const slotInEpoch = slot - epoch * 32;

      epochSet.add(epoch);
      cellMap.set(`${epoch}:${slotInEpoch}`, blobCount);
    }

    const epochs = Array.from(epochSet).sort((a, b) => a - b);
    const epochIndex = new Map(epochs.map((e, i) => [e, i]));

    let maxBlobCount = 0;
    const cells: [number, number, number][] = [];

    for (const [key, blobCount] of cellMap) {
      const colonIdx = key.indexOf(':');
      const epoch = Number(key.slice(0, colonIdx));
      const slotInEpoch = Number(key.slice(colonIdx + 1));
      const ei = epochIndex.get(epoch) ?? 0;
      cells.push([ei, slotInEpoch, blobCount]);
      if (blobCount > maxBlobCount) maxBlobCount = blobCount;
    }

    return { cells, epochs, maxBlobCount } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    const slotLabels = Array.from({ length: 32 }, (_, i) => String(i));
    return {
      tooltip: {
        formatter: (params: unknown) => {
          const p = params as { value: [number, number, number] };
          const epoch = data.epochs[p.value[0]] ?? p.value[0];
          return `Epoch ${epoch} · slot ${p.value[1]} · ${p.value[2]} blobs`;
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
        data: slotLabels,
        name: 'Slot in epoch',
        inverse: true,
      },
      visualMap: {
        show: true,
        type: 'continuous',
        min: 0,
        max: data.maxBlobCount,
        inRange: {
          color: [t.bg1, t.accent.teal],
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
