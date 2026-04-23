import { z } from 'zod';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const DataSchema = z.object({
  relays: z.array(z.string()),
  winning: z.array(z.number()),
  nonWinning: z.array(z.number()),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'bid-trace-coverage-stacked',
  topic: 'mev-pipeline',
  title: 'Bid trace coverage by relay',
  description: 'Horizontal stacked bar showing winning vs non-winning bid counts per relay.',
  queries: ['block_events'] as const,
  related: ['bid-vs-block-scatter'],
  context: () =>
    import(
      '../context/mev_pipeline/bid_trace_coverage_stacked.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 1,

  dataSchema: DataSchema,

  transform(raw) {
    const table = raw['block_events'];
    if (!table) return { relays: [], winning: [], nonWinning: [] };

    const typeCol = table.getChild('event_type');
    const relayCol = table.getChild('relay');

    // Count winning and non-winning bids per relay
    const winningCount = new Map<string, number>();
    const nonWinningCount = new Map<string, number>();

    for (let i = 0; i < table.numRows; i++) {
      const evType = String(typeCol?.get(i) ?? '');
      const relay = String(relayCol?.get(i) ?? 'unknown');

      if (evType === 'bid_winning') {
        winningCount.set(relay, (winningCount.get(relay) ?? 0) + 1);
      } else if (evType === 'bid_received') {
        nonWinningCount.set(relay, (nonWinningCount.get(relay) ?? 0) + 1);
      }
    }

    // Collect all relays seen in either map, sort by total descending
    const allRelays = new Set([...winningCount.keys(), ...nonWinningCount.keys()]);
    const sorted = [...allRelays].sort((a, b) => {
      const totalA = (winningCount.get(a) ?? 0) + (nonWinningCount.get(a) ?? 0);
      const totalB = (winningCount.get(b) ?? 0) + (nonWinningCount.get(b) ?? 0);
      return totalA - totalB; // ascending so largest is at top in horizontal bar
    });

    return {
      relays: sorted,
      winning: sorted.map((r) => winningCount.get(r) ?? 0),
      nonWinning: sorted.map((r) => nonWinningCount.get(r) ?? 0),
    } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: ['Winning', 'Non-winning'] },
      grid: { top: 32, right: 16, bottom: 32, left: 16, containLabel: true },
      xAxis: { type: 'value', name: 'bid count' },
      yAxis: { type: 'category', data: data.relays },
      series: [
        {
          name: 'Winning',
          type: 'bar',
          stack: 'total',
          data: data.winning,
          itemStyle: { color: t.accent.teal },
        },
        {
          name: 'Non-winning',
          type: 'bar',
          stack: 'total',
          data: data.nonWinning,
          itemStyle: { color: t.accent.amber },
        },
      ],
    };
  },
});
