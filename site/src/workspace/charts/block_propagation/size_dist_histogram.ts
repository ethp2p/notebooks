import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const SIZE_BUCKET_BYTES = 100_000; // 100 KB per bin

const DataSchema = z.object({
  // Each bin: [label, mev_count, local_count]
  bins: z.array(z.tuple([z.string(), z.number(), z.number()])),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'size-dist-histogram',
  topic: 'block-propagation',
  title: 'Block wire-size distribution (MEV vs local)',
  description:
    'Overlaid histogram of block wire sizes in 100 KB bins, split by MEV and local builder types.',
  queries: ['block_events'] as const,
  related: ['corrected-by-sizebucket-box', 'spread-by-size-box'],
  context: () =>
    import(
      '../context/block_propagation/size_dist_histogram.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 1,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return { bins: [] };

    const sizeCol = t.getChild('wire_size_bytes');
    const isMevCol = t.getChild('is_mev');
    const typeCol = t.getChild('event_type');

    if (!sizeCol || !typeCol) return { bins: [] };

    const mevCounts = new Map<number, number>();
    const localCounts = new Map<number, number>();

    for (let i = 0; i < t.numRows; i++) {
      const evType = String(typeCol.get(i) ?? '');
      if (evType !== 'block_arrival') continue;

      const size = Number(sizeCol.get(i) ?? 0);
      const isMev = Boolean(isMevCol?.get(i));
      const bin = Math.floor(size / SIZE_BUCKET_BYTES);

      if (isMev) {
        mevCounts.set(bin, (mevCounts.get(bin) ?? 0) + 1);
      } else {
        localCounts.set(bin, (localCounts.get(bin) ?? 0) + 1);
      }
    }

    const allBins = new Set([...mevCounts.keys(), ...localCounts.keys()]);
    const sortedBins = [...allBins].sort((a, b) => a - b);

    const bins: Array<[string, number, number]> = sortedBins.map((b) => {
      const label = `${b * 100}-${(b + 1) * 100}KB`;
      return [label, mevCounts.get(b) ?? 0, localCounts.get(b) ?? 0];
    });

    return { bins } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: ['MEV', 'Local'] },
      xAxis: {
        type: 'category',
        data: data.bins.map((b) => b[0]),
        name: 'Wire size',
        axisLabel: { rotate: 45, fontSize: 9 },
      },
      yAxis: { type: 'value', name: 'Block count' },
      series: [
        {
          name: 'MEV',
          type: 'bar',
          data: data.bins.map((b) => b[1]),
          itemStyle: { color: t.accent.purple },
          barMaxWidth: 20,
        },
        {
          name: 'Local',
          type: 'bar',
          data: data.bins.map((b) => b[2]),
          itemStyle: { color: t.accent.teal },
          barMaxWidth: 20,
        },
      ],
    };
  },
});
