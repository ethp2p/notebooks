import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const FACETS = 4;
// 225 epochs/day; split into 4 windows of ~56 each (last window may be slightly smaller)
const EPOCHS_PER_DAY = 225;
const WINDOW_SIZE = Math.ceil(EPOCHS_PER_DAY / FACETS); // 57

const DataSchema = z.object({
  // One entry per facet: sorted epoch array and cell data
  facets: z.array(
    z.object({
      epochs: z.array(z.number()),
      // [epoch_index_within_facet, slot_in_epoch, blob_count]
      cells: z.array(z.tuple([z.number(), z.number(), z.number()])),
    }),
  ),
  maxBlobCount: z.number(),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'blob-slot-heatmap-facet',
  topic: 'blob-inclusion',
  title: 'Blob count by slot-in-epoch (faceted)',
  description:
    'Four-panel heatmap splitting the day into contiguous epoch windows for detail.',
  queries: ['blob_events'] as const,
  related: ['blob-slot-heatmap-vertical'],
  context: () =>
    import(
      '../context/blob_inclusion/slot_heatmap_facet.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 5,

  dataSchema: DataSchema,

  transform(raw) {
    const table = raw['blob_events'] as Table | undefined;
    if (!table) {
      return {
        facets: Array.from({ length: FACETS }, () => ({ epochs: [], cells: [] })),
        maxBlobCount: 0,
      };
    }

    const epochCol = table.getChild('epoch');
    const slotCol = table.getChild('slot');
    const blobCountCol = table.getChild('blob_count');

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

    const allEpochs = Array.from(epochSet).sort((a, b) => a - b);
    let maxBlobCount = 0;

    // Assign each epoch to a facet based on its ordinal position (not epoch value)
    const facetEpochs: number[][] = Array.from({ length: FACETS }, () => []);
    for (let i = 0; i < allEpochs.length; i++) {
      const facetIdx = Math.min(Math.floor(i / WINDOW_SIZE), FACETS - 1);
      (facetEpochs[facetIdx] as number[]).push(allEpochs[i] as number);
    }

    const facets = facetEpochs.map((epochs) => {
      const epochIndex = new Map(epochs.map((e, i) => [e, i]));
      const cells: [number, number, number][] = [];

      for (const epoch of epochs) {
        for (let s = 0; s < 32; s++) {
          const blobCount = cellMap.get(`${epoch}:${s}`) ?? 0;
          const ei = epochIndex.get(epoch) ?? 0;
          cells.push([ei, s, blobCount]);
          if (blobCount > maxBlobCount) maxBlobCount = blobCount;
        }
      }

      return { epochs, cells };
    });

    return { facets, maxBlobCount } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    const slotLabels = Array.from({ length: 32 }, (_, i) => String(i));

    // Each facet occupies 25% width with a small gap.
    const facetWidth = 22; // percent
    const gap = (100 - FACETS * facetWidth) / (FACETS + 1); // left margin + spacing

    const grids = Array.from({ length: FACETS }, (_, fi) => ({
      top: 60,
      bottom: 80,
      left: `${gap + fi * (facetWidth + gap)}%`,
      width: `${facetWidth}%`,
    }));

    const xAxes = data.facets.map((facet, fi) => ({
      type: 'category' as const,
      gridIndex: fi,
      data: facet.epochs.map(String),
      name: fi === 1 ? 'Epoch' : '',
      axisLabel: {
        rotate: 45,
        fontSize: 9,
        interval: Math.max(0, Math.floor(facet.epochs.length / 6) - 1),
      },
    }));

    const yAxes = Array.from({ length: FACETS }, (_, fi) => ({
      type: 'category' as const,
      gridIndex: fi,
      data: slotLabels,
      name: fi === 0 ? 'Slot in epoch' : '',
      show: fi === 0,
      inverse: true,
      axisLabel: { fontSize: 9 },
    }));

    const series = data.facets.map((facet, fi) => ({
      type: 'heatmap' as const,
      data: facet.cells,
      xAxisIndex: fi,
      yAxisIndex: fi,
      gridIndex: fi,
      emphasis: { itemStyle: { borderColor: t.fg, borderWidth: 1 } },
    }));

    return {
      tooltip: {
        formatter: (params: unknown) => {
          const p = params as { seriesIndex: number; value: [number, number, number] };
          const facet = data.facets[p.seriesIndex];
          const epoch = facet?.epochs[p.value[0]] ?? p.value[0];
          return `Epoch ${epoch} · slot ${p.value[1]} · ${p.value[2]} blobs`;
        },
      },
      grid: grids,
      xAxis: xAxes,
      yAxis: yAxes,
      visualMap: {
        show: true,
        type: 'continuous',
        min: 0,
        max: data.maxBlobCount,
        inRange: {
          color: [t.bg1, t.accent.amber],
        },
        orient: 'horizontal',
        bottom: 10,
        left: 'center',
      },
      series,
    };
  },
});
