import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';

const DataSchema = z.object({
  // [winning_bid_ms, block_arrival_ms, blob_count]
  points: z.array(z.tuple([z.number(), z.number(), z.number()])),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'bid-vs-block-scatter',
  topic: 'mev-pipeline',
  title: 'Winning bid vs first-seen',
  description: 'Per-slot comparison of winning bid latency (ms) to block arrival latency (ms), colored by blob count.',
  queries: ['block_events'] as const,
  related: ['bid-to-block-scatter-median'],
  context: () =>
    import(
      '../context/mev_pipeline/bid_vs_block_scatter.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 2,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return { points: [] };

    const slotCol = t.getChild('slot');
    const typeCol = t.getChild('event_type');
    const latCol = t.getChild('latency_ms');
    const blobsCol = t.getChild('blob_count');

    const winningMs = new Map<number, number>();
    const arrivalMs = new Map<number, number>();
    const blobBySlot = new Map<number, number>();

    for (let i = 0; i < t.numRows; i++) {
      const s = Number(slotCol?.get(i) ?? 0);
      const evType = String(typeCol?.get(i) ?? '');
      const lat = Number(latCol?.get(i) ?? 0);

      if (evType === 'bid_winning') {
        winningMs.set(s, lat);
      } else if (evType === 'block_arrival') {
        arrivalMs.set(s, lat);
        blobBySlot.set(s, Number(blobsCol?.get(i) ?? 0));
      }
    }

    const points: Array<[number, number, number]> = [];
    for (const [s, w] of winningMs) {
      const a = arrivalMs.get(s);
      if (a == null) continue;
      points.push([w, a, blobBySlot.get(s) ?? 0]);
    }

    return { points } satisfies Data;
  },

  option(data) {
    return {
      xAxis: { type: 'value', name: 'winning bid (ms)' },
      yAxis: { type: 'value', name: 'block first-seen (ms)' },
      visualMap: {
        type: 'continuous',
        dimension: 2,
        min: 0,
        max: 9,
        inRange: { color: ['#2e7f92', '#b8872e'] },
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        text: ['9 blobs', '0'],
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
      tooltip: { trigger: 'item' },
    };
  },
});
