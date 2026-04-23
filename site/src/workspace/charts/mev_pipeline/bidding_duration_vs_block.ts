import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const DataSchema = z.object({
  // [bidding_duration_ms, block_arrival_ms, blob_count]
  points: z.array(z.tuple([z.number(), z.number(), z.number()])),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'bidding-duration-vs-block',
  topic: 'mev-pipeline',
  title: 'Bidding duration vs block arrival',
  description: 'Scatter of bidding window duration (winning bid ms minus earliest bid received ms) vs block first-seen latency.',
  queries: ['block_events'] as const,
  related: ['bid-vs-block-scatter', 'bid-timing-density-outliers'],
  context: () =>
    import(
      '../context/mev_pipeline/bidding_duration_vs_block.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 5,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return { points: [] };

    const slotCol = t.getChild('slot');
    const typeCol = t.getChild('event_type');
    const latCol = t.getChild('latency_ms');
    const blobsCol = t.getChild('blob_count');

    const firstBidMs = new Map<number, number>();
    const winningMs = new Map<number, number>();
    const arrivalMs = new Map<number, number>();
    const blobBySlot = new Map<number, number>();

    for (let i = 0; i < t.numRows; i++) {
      const s = Number(slotCol?.get(i) ?? 0);
      const evType = String(typeCol?.get(i) ?? '');
      const lat = Number(latCol?.get(i) ?? 0);

      if (evType === 'bid_received') {
        const prev = firstBidMs.get(s);
        if (prev == null || lat < prev) firstBidMs.set(s, lat);
      } else if (evType === 'bid_winning') {
        winningMs.set(s, lat);
      } else if (evType === 'block_arrival') {
        arrivalMs.set(s, lat);
        blobBySlot.set(s, Number(blobsCol?.get(i) ?? 0));
      }
    }

    const points: Array<[number, number, number]> = [];
    for (const [s, winMs] of winningMs) {
      const firstMs = firstBidMs.get(s);
      const arrival = arrivalMs.get(s);
      if (firstMs == null || arrival == null) continue;
      const duration = winMs - firstMs;
      if (duration < 0) continue;
      points.push([duration, arrival, blobBySlot.get(s) ?? 0]);
    }

    return { points } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      xAxis: { type: 'value', name: 'bidding duration (ms)' },
      yAxis: { type: 'value', name: 'block first-seen (ms)' },
      visualMap: {
        type: 'continuous',
        dimension: 2,
        min: 0,
        max: 9,
        inRange: { color: [t.accent.teal, t.accent.amber] },
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
