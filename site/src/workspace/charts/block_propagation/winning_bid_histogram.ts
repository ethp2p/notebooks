import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const NUM_BINS = 40;

const DataSchema = z.object({
  // [label, count]
  bins: z.array(z.tuple([z.string(), z.number()])),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'winning-bid-histogram',
  topic: 'block-propagation',
  title: 'Winning bid value distribution',
  description:
    'Histogram of winning bid values (ETH) binned in equal-width intervals across the observed range.',
  queries: ['block_events'] as const,
  related: ['entity-percentile-bars', 'entity-anomaly-rate-bar'],
  context: () =>
    import(
      '../context/block_propagation/winning_bid_histogram.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 3,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return { bins: [] };

    const typeCol = t.getChild('event_type');
    const bidCol = t.getChild('winning_bid_eth');

    if (!typeCol) return { bins: [] };

    const values: number[] = [];

    for (let i = 0; i < t.numRows; i++) {
      const evType = String(typeCol.get(i) ?? '');
      if (evType !== 'bid_winning') continue;
      const bid = bidCol ? Number(bidCol.get(i) ?? 0) : 0;
      if (bid > 0) values.push(bid);
    }

    if (values.length === 0) return { bins: [] };

    const min = Math.min(...values);
    const max = Math.max(...values);
    const step = (max - min) / NUM_BINS;

    const counts = new Array<number>(NUM_BINS).fill(0);
    for (const v of values) {
      const idx = Math.min(Math.floor((v - min) / step), NUM_BINS - 1);
      counts[idx] = (counts[idx] ?? 0) + 1;
    }

    const bins: Array<[string, number]> = counts.map((c, i) => {
      const lo = (min + i * step).toFixed(4);
      const hi = (min + (i + 1) * step).toFixed(4);
      return [`${lo}-${hi}`, c];
    });

    return { bins } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'category',
        data: data.bins.map((b) => b[0]),
        name: 'Winning bid (ETH)',
        axisLabel: { rotate: 45, fontSize: 9 },
      },
      yAxis: { type: 'value', name: 'Slot count' },
      series: [
        {
          type: 'bar',
          data: data.bins.map((b) => b[1]),
          itemStyle: { color: t.accent.amber },
          barCategoryGap: '2%',
        },
      ],
    };
  },
});
