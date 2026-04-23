import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const MAX_ENTITIES = 20;

const DataSchema = z.object({
  entities: z.array(z.string()),
  rates: z.array(z.number()), // fraction [0, 1]
  globalRate: z.number(),
});

type Data = z.infer<typeof DataSchema>;

function p95(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const pos = 0.95 * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return (sorted[lo] ?? 0) + ((sorted[hi] ?? 0) - (sorted[lo] ?? 0)) * (pos - lo);
}

export default defineChart({
  id: 'entity-anomaly-rate-bar',
  topic: 'block-propagation',
  title: 'Anomaly rate by entity',
  description:
    'Horizontal bar chart ranking entities by the fraction of their slots in the double-outlier quadrant (large and slow). The mark line shows the population average anomaly rate.',
  queries: ['block_events'] as const,
  related: ['double-outlier-quadrant-scatter', 'entity-percentile-bars'],
  context: () =>
    import(
      '../context/block_propagation/entity_anomaly_rate_bar.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 18,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return { entities: [], rates: [], globalRate: 0 };

    const typeCol = t.getChild('event_type');
    const sizeCol = t.getChild('wire_size_bytes');
    const latCol = t.getChild('latency_ms');
    const entityCol = t.getChild('entity') ?? t.getChild('builder_pubkey');

    if (!typeCol || !sizeCol || !latCol) return { entities: [], rates: [], globalRate: 0 };

    type SlotEntry = { size: number; lat: number; entity: string };
    const slotEntries: SlotEntry[] = [];

    for (let i = 0; i < t.numRows; i++) {
      const evType = String(typeCol.get(i) ?? '');
      if (evType !== 'block_arrival') continue;

      const size = Number(sizeCol.get(i) ?? 0);
      const lat = Number(latCol.get(i) ?? 0);
      const raw_entity = String(entityCol?.get(i) ?? 'unknown');
      const entity = raw_entity.length > 12 ? raw_entity.slice(0, 10) + '..' : raw_entity;
      slotEntries.push({ size, lat, entity });
    }

    if (slotEntries.length === 0) return { entities: [], rates: [], globalRate: 0 };

    const sortedSizes = [...slotEntries.map((e) => e.size)].sort((a, b) => a - b);
    const sortedLats = [...slotEntries.map((e) => e.lat)].sort((a, b) => a - b);
    const sizeThreshold = p95(sortedSizes);
    const latThreshold = p95(sortedLats);

    const isAnomaly = (e: SlotEntry): boolean =>
      e.size > sizeThreshold && e.lat > latThreshold;

    type EntityStat = { total: number; anomalies: number };
    const stats = new Map<string, EntityStat>();

    for (const entry of slotEntries) {
      const stat = stats.get(entry.entity) ?? { total: 0, anomalies: 0 };
      stat.total += 1;
      if (isAnomaly(entry)) stat.anomalies += 1;
      stats.set(entry.entity, stat);
    }

    const totalAnomalies = slotEntries.filter(isAnomaly).length;
    const globalRate = slotEntries.length > 0 ? totalAnomalies / slotEntries.length : 0;

    // Sort by anomaly rate descending, take top MAX_ENTITIES
    const sorted = [...stats.entries()]
      .map(([entity, stat]) => ({ entity, rate: stat.total > 0 ? stat.anomalies / stat.total : 0 }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, MAX_ENTITIES);

    return {
      entities: sorted.map((s) => s.entity),
      rates: sorted.map((s) => parseFloat(s.rate.toFixed(4))),
      globalRate: parseFloat(globalRate.toFixed(4)),
    } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'value', name: 'Anomaly rate', max: 1, axisLabel: { formatter: (v: number) => `${(v * 100).toFixed(0)}%` } },
      yAxis: { type: 'category', data: data.entities, name: 'Entity', axisLabel: { fontSize: 9 } },
      series: [
        {
          type: 'bar',
          data: data.rates,
          itemStyle: { color: t.accent.purple },
          markLine: {
            data: [{ xAxis: data.globalRate }],
            label: { formatter: `avg ${(data.globalRate * 100).toFixed(1)}%`, position: 'end' },
            lineStyle: { color: t.accent.amber, type: 'dashed' },
          },
        },
      ],
    };
  },
});
