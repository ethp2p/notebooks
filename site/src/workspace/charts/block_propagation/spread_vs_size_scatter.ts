import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const DataSchema = z.object({
  // [wire_size_bytes, propagation_spread_ms]
  points: z.array(z.tuple([z.number(), z.number()])),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'spread-vs-size-scatter',
  topic: 'block-propagation',
  title: 'Propagation spread vs wire size',
  description:
    'Per-slot scatter of propagation spread (max minus min observer latency) versus wire size in bytes.',
  queries: ['block_events'] as const,
  related: ['spread-by-size-box', 'corrected-vs-size-scatter'],
  context: () =>
    import(
      '../context/block_propagation/spread_vs_size_scatter.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 13,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return { points: [] };

    const typeCol = t.getChild('event_type');
    const sizeCol = t.getChild('wire_size_bytes');
    const spreadCol = t.getChild('propagation_spread_ms');

    if (!typeCol || !sizeCol || !spreadCol) return { points: [] };

    const points: Array<[number, number]> = [];

    for (let i = 0; i < t.numRows; i++) {
      const evType = String(typeCol.get(i) ?? '');
      if (evType !== 'block_arrival') continue;

      const size = Number(sizeCol.get(i) ?? 0);
      const spread = Number(spreadCol.get(i) ?? 0);
      points.push([size, spread]);
    }

    return { points } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: { trigger: 'item' },
      xAxis: { type: 'value', name: 'Wire size (bytes)' },
      yAxis: { type: 'value', name: 'Spread (ms)' },
      series: [
        {
          type: 'scatter',
          data: data.points,
          symbolSize: 3,
          large: true,
          largeThreshold: 2000,
          itemStyle: { color: t.accent.amber, opacity: 0.5 },
        },
      ],
    };
  },
});
