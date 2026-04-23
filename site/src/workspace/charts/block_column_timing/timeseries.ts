import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const DataSchema = z.object({
  // Each point: [slot_start_ms, spread_ms, blob_count]
  points: z.array(z.tuple([z.number(), z.number(), z.number()])),
  maxBlobCount: z.number(),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'block-to-column-timeseries',
  topic: 'block-column-timing',
  title: 'Block-to-last-column spread over time',
  description:
    'Per-slot spread between block arrival and last column seen, plotted over the day. Points are colored by blob count.',
  queries: ['block_events'] as const,
  related: ['block-to-column-histogram', 'block-to-column-boxplot'],
  context: () =>
    import(
      '../context/block_column_timing/timeseries.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 3,

  dataSchema: DataSchema,

  transform(raw) {
    const table = raw['block_events'] as Table | undefined;
    if (!table) return { points: [], maxBlobCount: 6 };

    const slot = table.getChild('slot');
    const type = table.getChild('event_type');
    const lat = table.getChild('latency_ms');
    const slotStartCol = table.getChild('slot_start_date_time');
    const blobsCol = table.getChild('blob_count');

    if (!slot || !type || !lat) return { points: [], maxBlobCount: 6 };

    const blockArrivalMs = new Map<number, { ms: number; blobCount: number; slotStartMs: number }>();
    const lastColMs = new Map<number, number>();

    for (let i = 0; i < (table as Table).numRows; i++) {
      const s = Number(slot.get(i));
      const et = String(type.get(i));
      if (et === 'block_arrival') {
        const slotStartRaw = slotStartCol?.get(i);
        const slotStartMs =
          slotStartRaw instanceof Date
            ? slotStartRaw.getTime()
            : typeof slotStartRaw === 'number'
              ? slotStartRaw
              : 0;
        blockArrivalMs.set(s, {
          ms: Number(lat.get(i)),
          blobCount: Number(blobsCol?.get(i) ?? 0),
          slotStartMs,
        });
      } else if (et === 'last_column_seen') {
        lastColMs.set(s, Number(lat.get(i)));
      }
    }

    const points: Array<[number, number, number]> = [];
    let maxBlobCount = 0;

    for (const [s, block] of blockArrivalMs) {
      const colMs = lastColMs.get(s);
      if (colMs === undefined) continue;
      const spread = colMs - block.ms;
      if (block.blobCount > maxBlobCount) maxBlobCount = block.blobCount;
      points.push([block.slotStartMs, spread, block.blobCount]);
    }

    return { points, maxBlobCount: Math.max(maxBlobCount, 1) } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as { value: [number, number, number] };
          const d = new Date(p.value[0]);
          return `${d.toISOString().slice(11, 19)} UTC<br/>spread: ${Math.round(p.value[1])} ms<br/>blobs: ${p.value[2]}`;
        },
      },
      visualMap: {
        show: true,
        min: 0,
        max: data.maxBlobCount,
        dimension: 2,
        orient: 'horizontal',
        left: 'center',
        bottom: 8,
        text: [`${data.maxBlobCount} blobs`, '0 blobs'],
        calculable: true,
        inRange: {
          color: [t.accent.teal, t.accent.amber, t.accent.purple],
        },
      },
      grid: { left: 56, right: 16, top: 24, bottom: 64 },
      xAxis: {
        type: 'time',
        name: 'time (UTC)',
      },
      yAxis: {
        type: 'value',
        name: 'spread (ms)',
      },
      series: [
        {
          type: 'scatter',
          data: data.points,
          symbolSize: 4,
          large: true,
          largeThreshold: 2000,
          itemStyle: { opacity: 0.7 },
        },
      ],
    };
  },
});
