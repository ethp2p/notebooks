import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const DataSchema = z.object({
  // Each bin: [bin_start_ms, count]
  bins: z.array(z.tuple([z.number(), z.number().int()])),
  binWidth: z.number(),
});

type Data = z.infer<typeof DataSchema>;

const NUM_BINS = 60;

export default defineChart({
  id: 'column-spread-histogram',
  topic: 'column-propagation',
  title: 'Column spread histogram',
  description: 'Distribution of per-slot column spread (max minus min first-seen ms across 128 columns), binned into 60 buckets.',
  queries: ['col_first_seen'] as const,
  related: ['column-spread-timeseries'],
  context: () =>
    import(
      '../context/column_propagation/spread_histogram.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 5,

  dataSchema: DataSchema,

  transform(raw) {
    const table = raw['col_first_seen'] as Table | undefined;
    if (!table) return { bins: [], binWidth: 0 };

    // Collect per-slot spread values.
    const spreads: number[] = [];

    for (let row = 0; row < table.numRows; row++) {
      let minVal: number | null = null;
      let maxVal: number | null = null;

      for (let c = 0; c < 128; c++) {
        const col = table.getChild(`c${c}`);
        if (!col) continue;
        const v = col.get(row);
        if (v == null) continue;
        const n = Number(v);
        if (minVal === null || n < minVal) minVal = n;
        if (maxVal === null || n > maxVal) maxVal = n;
      }

      if (minVal !== null && maxVal !== null) {
        spreads.push(maxVal - minVal);
      }
    }

    if (spreads.length === 0) return { bins: [], binWidth: 0 };

    let globalMin = spreads[0] ?? 0;
    let globalMax = spreads[0] ?? 0;
    for (const s of spreads) {
      if (s < globalMin) globalMin = s;
      if (s > globalMax) globalMax = s;
    }

    const range = globalMax - globalMin;
    const binWidth = range === 0 ? 1 : range / NUM_BINS;
    const counts = new Array<number>(NUM_BINS).fill(0);

    for (const s of spreads) {
      const idx = range === 0 ? 0 : Math.min(Math.floor((s - globalMin) / binWidth), NUM_BINS - 1);
      if (idx >= 0 && idx < NUM_BINS) {
        counts[idx] = (counts[idx] ?? 0) + 1;
      }
    }

    const bins: Array<[number, number]> = counts.map((count, i) => [
      globalMin + i * binWidth,
      count,
    ]);

    return { bins, binWidth } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const p = params as Array<{ value: [number, number] }>;
          const first = p[0];
          if (!first) return '';
          const [start, count] = first.value;
          return `${Math.round(start)} ms: ${count} slots`;
        },
      },
      grid: { left: 56, right: 16, top: 24, bottom: 48 },
      xAxis: {
        type: 'value',
        name: 'spread (ms)',
        nameLocation: 'middle',
        nameGap: 32,
      },
      yAxis: {
        type: 'value',
        name: 'slots',
      },
      series: [
        {
          type: 'bar',
          data: data.bins,
          barWidth: '98%',
          itemStyle: { color: t.accent.teal },
        },
      ],
    };
  },
});
