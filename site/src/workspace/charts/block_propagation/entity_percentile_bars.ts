import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const MAX_ENTITIES = 15;

const DataSchema = z.object({
  entities: z.array(z.string()),
  p50: z.array(z.number()),
  p95: z.array(z.number()),
  p99: z.array(z.number()),
  // Scatter points [entity_idx, latency_ms]
  scatter: z.array(z.tuple([z.number(), z.number()])),
});

type Data = z.infer<typeof DataSchema>;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const pos = p * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return (sorted[lo] ?? 0) + ((sorted[hi] ?? 0) - (sorted[lo] ?? 0)) * (pos - lo);
}

export default defineChart({
  id: 'entity-percentile-bars',
  topic: 'block-propagation',
  title: 'Propagation latency percentiles by entity',
  description:
    'Bar chart of p50/p95/p99 propagation latency per entity, with individual slot observations as scatter overlay.',
  queries: ['block_events'] as const,
  related: ['entity-anomaly-rate-bar', 'top-entity-density-facets'],
  context: () =>
    import(
      '../context/block_propagation/entity_percentile_bars.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 14,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    const empty = { entities: [], p50: [], p95: [], p99: [], scatter: [] };
    if (!t) return empty;

    const typeCol = t.getChild('event_type');
    const latCol = t.getChild('latency_ms');
    const entityCol = t.getChild('entity') ?? t.getChild('builder_pubkey');

    if (!typeCol || !latCol || !entityCol) return empty;

    const entityValues = new Map<string, number[]>();

    for (let i = 0; i < t.numRows; i++) {
      const evType = String(typeCol.get(i) ?? '');
      if (evType !== 'block_arrival') continue;

      const lat = Number(latCol.get(i) ?? 0);
      const entity = String(entityCol.get(i) ?? 'unknown');
      const key = entity.length > 12 ? entity.slice(0, 10) + '..' : entity;
      const arr = entityValues.get(key) ?? [];
      arr.push(lat);
      entityValues.set(key, arr);
    }

    // Sort entities by count descending, take top MAX_ENTITIES
    const topEntities = [...entityValues.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, MAX_ENTITIES)
      .map(([e]) => e);

    if (topEntities.length === 0) return empty;

    const p50: number[] = [];
    const p95: number[] = [];
    const p99: number[] = [];
    const scatter: Array<[number, number]> = [];

    for (const [idx, entity] of topEntities.entries()) {
      const values = [...(entityValues.get(entity) ?? [])].sort((a, b) => a - b);
      p50.push(Math.round(percentile(values, 0.5)));
      p95.push(Math.round(percentile(values, 0.95)));
      p99.push(Math.round(percentile(values, 0.99)));

      // Sample up to 50 scatter points per entity
      const step = Math.max(1, Math.floor(values.length / 50));
      for (let vi = 0; vi < values.length; vi += step) {
        scatter.push([idx, values[vi] ?? 0]);
      }
    }

    return { entities: topEntities, p50, p95, p99, scatter } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: ['p50', 'p95', 'p99', 'Observations'] },
      xAxis: { type: 'category', data: data.entities, name: 'Entity', axisLabel: { rotate: 45, fontSize: 9 } },
      yAxis: { type: 'value', name: 'Latency (ms)' },
      series: [
        {
          name: 'p50',
          type: 'bar',
          data: data.p50,
          itemStyle: { color: t.accent.teal },
          barMaxWidth: 16,
        },
        {
          name: 'p95',
          type: 'bar',
          data: data.p95,
          itemStyle: { color: t.accent.amber },
          barMaxWidth: 16,
        },
        {
          name: 'p99',
          type: 'bar',
          data: data.p99,
          itemStyle: { color: t.accent.purple },
          barMaxWidth: 16,
        },
        {
          name: 'Observations',
          type: 'scatter',
          data: data.scatter.map(([xi, y]) => {
            // Offset x by category index
            return [data.entities[xi] ?? xi, y];
          }),
          symbolSize: 2,
          itemStyle: { color: t.fg, opacity: 0.25 },
          silent: true,
        },
      ],
    };
  },
});
