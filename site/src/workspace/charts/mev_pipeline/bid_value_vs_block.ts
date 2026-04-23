import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const DataSchema = z.object({
  // [bid_value_gwei, block_arrival_ms, blob_count]
  points: z.array(z.tuple([z.number(), z.number(), z.number()])),
});

type Data = z.infer<typeof DataSchema>;

const GWEI = 1_000_000_000n;

function weiStringToGwei(s: string | null | undefined): number | null {
  if (!s) return null;
  try {
    const big = BigInt(s);
    // Convert to gwei as a float for log-scale display
    return Number(big / GWEI) + Number(big % GWEI) / 1e9;
  } catch {
    return null;
  }
}

export default defineChart({
  id: 'bid-value-vs-block',
  topic: 'mev-pipeline',
  title: 'Bid value vs block arrival',
  description: 'Winning bid value (ETH, log scale) vs block first-seen latency (ms), colored by blob count.',
  queries: ['block_events'] as const,
  related: ['bid-vs-block-scatter'],
  context: () =>
    import(
      '../context/mev_pipeline/bid_value_vs_block.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 4,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return { points: [] };

    const slotCol = t.getChild('slot');
    const typeCol = t.getChild('event_type');
    const latCol = t.getChild('latency_ms');
    const blobsCol = t.getChild('blob_count');
    const bidValCol = t.getChild('winning_bid_wei');

    // Build per-slot winning bid value and arrival ms
    const winBidGwei = new Map<number, number>();
    const arrivalMs = new Map<number, number>();
    const blobBySlot = new Map<number, number>();

    for (let i = 0; i < t.numRows; i++) {
      const s = Number(slotCol?.get(i) ?? 0);
      const evType = String(typeCol?.get(i) ?? '');
      const lat = Number(latCol?.get(i) ?? 0);

      if (evType === 'bid_winning') {
        const gwei = weiStringToGwei(String(bidValCol?.get(i) ?? ''));
        if (gwei != null && gwei > 0) winBidGwei.set(s, gwei);
      } else if (evType === 'block_arrival') {
        arrivalMs.set(s, lat);
        blobBySlot.set(s, Number(blobsCol?.get(i) ?? 0));
      }
    }

    const points: Array<[number, number, number]> = [];
    for (const [s, gwei] of winBidGwei) {
      const a = arrivalMs.get(s);
      if (a == null) continue;
      points.push([gwei, a, blobBySlot.get(s) ?? 0]);
    }

    return { points } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      xAxis: {
        type: 'log',
        name: 'winning bid (Gwei, log)',
        nameTextStyle: { color: t.muted, fontSize: 10 },
      },
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
