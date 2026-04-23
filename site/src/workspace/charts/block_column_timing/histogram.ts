import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const NUM_BINS = 60;
const RANGE_MIN = 0;
const RANGE_MAX = 2000;

const DataSchema = z.object({
  // Each bin: [bin_start_ms, count]
  mevBins: z.array(z.tuple([z.number(), z.number().int()])),
  localBins: z.array(z.tuple([z.number(), z.number().int()])),
  binWidth: z.number(),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'block-to-column-histogram',
  topic: 'block-column-timing',
  title: 'Block-to-last-column spread histogram (MEV vs local)',
  description:
    'Distribution of per-slot spread between block arrival and last column seen, split by MEV vs local block. 60 bins over 0-2000 ms.',
  queries: ['block_events'] as const,
  related: ['block-to-column-boxplot', 'block-to-column-timeseries'],
  context: () =>
    import(
      '../context/block_column_timing/histogram.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 1,

  dataSchema: DataSchema,

  transform(raw) {
    const table = raw['block_events'] as Table | undefined;
    if (!table) return { mevBins: [], localBins: [], binWidth: 0 };

    const slot = table.getChild('slot');
    const type = table.getChild('event_type');
    const lat = table.getChild('latency_ms');
    const isMevCol = table.getChild('is_mev');

    if (!slot || !type || !lat) return { mevBins: [], localBins: [], binWidth: 0 };

    const blockArrivalMs = new Map<number, { ms: number; isMev: boolean; blobCount: number }>();
    const lastColMs = new Map<number, number>();

    for (let i = 0; i < (table as Table).numRows; i++) {
      const s = Number(slot.get(i));
      const et = String(type.get(i));
      if (et === 'block_arrival') {
        blockArrivalMs.set(s, {
          ms: Number(lat.get(i)),
          isMev: Boolean(isMevCol?.get(i)),
          blobCount: 0,
        });
      } else if (et === 'last_column_seen') {
        lastColMs.set(s, Number(lat.get(i)));
      }
    }

    const binWidth = (RANGE_MAX - RANGE_MIN) / NUM_BINS;
    const mevCounts = new Array<number>(NUM_BINS).fill(0);
    const localCounts = new Array<number>(NUM_BINS).fill(0);

    for (const [s, block] of blockArrivalMs) {
      const colMs = lastColMs.get(s);
      if (colMs === undefined) continue;
      const spread = colMs - block.ms;
      if (spread < RANGE_MIN || spread >= RANGE_MAX) continue;
      const idx = Math.min(Math.floor((spread - RANGE_MIN) / binWidth), NUM_BINS - 1);
      if (block.isMev) {
        mevCounts[idx] = (mevCounts[idx] ?? 0) + 1;
      } else {
        localCounts[idx] = (localCounts[idx] ?? 0) + 1;
      }
    }

    const mevBins: Array<[number, number]> = mevCounts.map((count, i) => [
      RANGE_MIN + i * binWidth,
      count,
    ]);
    const localBins: Array<[number, number]> = localCounts.map((count, i) => [
      RANGE_MIN + i * binWidth,
      count,
    ]);

    return { mevBins, localBins, binWidth } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const p = params as Array<{ seriesName: string; value: [number, number] }>;
          if (!p[0]) return '';
          const start = p[0].value[0];
          const end = start + data.binWidth;
          const lines = p
            .map((s) => `${s.seriesName}: ${s.value[1]}`)
            .join('<br/>');
          return `${Math.round(start)}-${Math.round(end)} ms<br/>${lines}`;
        },
      },
      legend: { data: ['MEV', 'Local'] },
      grid: { left: 56, right: 16, top: 40, bottom: 48 },
      xAxis: {
        type: 'value',
        name: 'spread (ms)',
        nameLocation: 'middle',
        nameGap: 32,
        min: RANGE_MIN,
        max: RANGE_MAX,
      },
      yAxis: {
        type: 'value',
        name: 'slots',
      },
      series: [
        {
          name: 'MEV',
          type: 'bar',
          data: data.mevBins,
          barWidth: '98%',
          itemStyle: { color: t.accent.purple, opacity: 0.8 },
          stack: undefined,
        },
        {
          name: 'Local',
          type: 'bar',
          data: data.localBins,
          barWidth: '98%',
          itemStyle: { color: t.accent.teal, opacity: 0.8 },
          stack: undefined,
        },
      ],
    };
  },
});
