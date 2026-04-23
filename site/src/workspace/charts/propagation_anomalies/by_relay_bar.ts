import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';
import { computeAnomalyCounts } from './_anomaly_counts';

const TOP_N = 15;

const DataSchema = z.object({
  relays: z.array(z.string()),
  counts: z.array(z.number()),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'anomalies-by-relay-bar',
  topic: 'propagation-anomalies',
  title: 'Anomalous blocks by relay',
  description:
    'Top 15 relays ranked by count of propagation anomalies (block arrival latency exceeding P95 for its blob-count bucket).',
  queries: ['block_events'] as const,
  related: ['anomaly-regression-scatter', 'anomalies-by-builder-bar'],
  context: () =>
    import(
      '../context/propagation_anomalies/by_relay_bar.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 2,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return { relays: [], counts: [] };

    const counts = computeAnomalyCounts(t, 'relay');
    const sorted = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N)
      .reverse();

    return {
      relays: sorted.map(([label]) => label),
      counts: sorted.map(([, n]) => n),
    } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { top: 16, right: 32, bottom: 16, left: 16, containLabel: true },
      xAxis: { type: 'value', name: 'anomaly count' },
      yAxis: { type: 'category', data: data.relays },
      series: [
        {
          name: 'Anomalies',
          type: 'bar' as const,
          data: data.counts,
          itemStyle: { color: t.accent.amber },
        },
      ],
    };
  },
});
