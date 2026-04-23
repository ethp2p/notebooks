import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const DataSchema = z.object({
  // scatter: [winning_bid_ms, block_arrival_ms, blob_count]
  points: z.array(z.tuple([z.number(), z.number(), z.number()])),
  // medians: one entry per blob count bucket [blob_count, median_winning_ms, median_arrival_ms]
  medians: z.array(z.tuple([z.number(), z.number(), z.number()])),
});

type Data = z.infer<typeof DataSchema>;

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

export default defineChart({
  id: 'bid-to-block-scatter-median',
  topic: 'mev-pipeline',
  title: 'Bid-to-block scatter with medians',
  description: 'Scatter of winning bid vs block arrival latency with median lines per blob count.',
  queries: ['block_events'] as const,
  related: ['bid-vs-block-scatter'],
  context: () =>
    import(
      '../context/mev_pipeline/bid_to_block_scatter_median.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 3,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return { points: [], medians: [] };

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
    const byBlob = new Map<number, { winning: number[]; arrival: number[] }>();

    for (const [s, w] of winningMs) {
      const a = arrivalMs.get(s);
      if (a == null) continue;
      const blobs = blobBySlot.get(s) ?? 0;
      points.push([w, a, blobs]);

      const bucket = byBlob.get(blobs) ?? { winning: [], arrival: [] };
      bucket.winning.push(w);
      bucket.arrival.push(a);
      byBlob.set(blobs, bucket);
    }

    const medians: Array<[number, number, number]> = [];
    for (const [blobs, { winning, arrival }] of byBlob) {
      medians.push([blobs, median(winning), median(arrival)]);
    }
    medians.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));

    return { points, medians } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      xAxis: { type: 'value', name: 'winning bid (ms)' },
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
        seriesIndex: 0,
      },
      legend: { data: ['Slots', 'Median per blob count'], top: 8 },
      series: [
        {
          name: 'Slots',
          type: 'scatter',
          data: data.points,
          symbolSize: 4,
          large: true,
          largeThreshold: 2000,
        },
        {
          name: 'Median per blob count',
          type: 'line',
          data: data.medians.map(([, w, a]) => [w, a]),
          lineStyle: { color: t.accent.purple, width: 2 },
          itemStyle: { color: t.accent.purple },
          symbol: 'circle',
          symbolSize: 8,
          smooth: false,
          connectNulls: false,
        },
      ],
      tooltip: { trigger: 'item' },
    };
  },
});
