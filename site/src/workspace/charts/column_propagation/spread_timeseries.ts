import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const DataSchema = z.object({
  // Each point: [slot_start_ms, spread_ms]
  points: z.array(z.tuple([z.number(), z.number()])),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'column-spread-timeseries',
  topic: 'column-propagation',
  title: 'Column spread over time',
  description: 'Per-slot column spread (max minus min first-seen ms across 128 columns) plotted over the day.',
  queries: ['col_first_seen'] as const,
  related: ['column-spread-histogram'],
  context: () =>
    import(
      '../context/column_propagation/spread_timeseries.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 6,

  dataSchema: DataSchema,

  transform(raw) {
    const table = raw['col_first_seen'] as Table | undefined;
    if (!table) return { points: [] };

    const slotStartCol = table.getChild('slot_start_date_time');
    const points: Array<[number, number]> = [];

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

      if (minVal === null || maxVal === null) continue;

      const slotStartRaw = slotStartCol?.get(row);
      const slotStartMs =
        slotStartRaw instanceof Date
          ? slotStartRaw.getTime()
          : typeof slotStartRaw === 'number'
            ? slotStartRaw
            : null;

      if (slotStartMs === null) continue;
      points.push([slotStartMs, maxVal - minVal]);
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
          return `${d.toISOString().slice(11, 19)} UTC: ${Math.round(p.value[1])} ms spread`;
        },
      },
      grid: { left: 56, right: 16, top: 24, bottom: 48 },
      xAxis: {
        type: 'time',
        name: 'Time (UTC)',
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
          itemStyle: { color: t.accent.amber, opacity: 0.7 },
        },
      ],
    };
  },
});
