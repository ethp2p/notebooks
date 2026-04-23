import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

// Size buckets defined by wire_size_bytes ranges
const SIZE_BUCKETS = ['tiny', 'small', 'medium', 'large'] as const;
type SizeBucket = (typeof SIZE_BUCKETS)[number];

function sizeBucket(bytes: number): SizeBucket {
  if (bytes < 50_000) return 'tiny';
  if (bytes < 200_000) return 'small';
  if (bytes < 500_000) return 'medium';
  return 'large';
}

const DataSchema = z.object({
  categories: z.array(z.string()),
  buildingMs: z.array(z.number()),
  networkMs: z.array(z.number()),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'building-vs-network-stacked',
  topic: 'block-propagation',
  title: 'Building time vs network propagation by size bucket',
  description:
    'Horizontal stacked bar showing mean building phase vs mean network propagation latency, grouped by wire-size bucket.',
  queries: ['block_events'] as const,
  related: ['raw-vs-corrected-box', 'spread-by-size-box'],
  context: () =>
    import(
      '../context/block_propagation/building_vs_network_stacked.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 4,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) {
      return {
        categories: [...SIZE_BUCKETS],
        buildingMs: SIZE_BUCKETS.map(() => 0),
        networkMs: SIZE_BUCKETS.map(() => 0),
      };
    }

    const typeCol = t.getChild('event_type');
    const latCol = t.getChild('latency_ms');
    const sizeCol = t.getChild('wire_size_bytes');
    const buildingCol = t.getChild('building_ms');

    if (!typeCol || !latCol) {
      return {
        categories: [...SIZE_BUCKETS],
        buildingMs: SIZE_BUCKETS.map(() => 0),
        networkMs: SIZE_BUCKETS.map(() => 0),
      };
    }

    type Acc = { buildingSum: number; networkSum: number; count: number };
    const acc = new Map<SizeBucket, Acc>(
      SIZE_BUCKETS.map((b) => [b, { buildingSum: 0, networkSum: 0, count: 0 }]),
    );

    for (let i = 0; i < t.numRows; i++) {
      const evType = String(typeCol.get(i) ?? '');
      if (evType !== 'block_arrival') continue;

      const lat = Number(latCol.get(i) ?? 0);
      const bytes = sizeCol ? Number(sizeCol.get(i) ?? 0) : 0;
      const building = buildingCol ? Number(buildingCol.get(i) ?? 0) : 0;
      const bucket = sizeBucket(bytes);

      const entry = acc.get(bucket);
      if (!entry) continue;
      entry.buildingSum += building;
      entry.networkSum += Math.max(0, lat - building);
      entry.count += 1;
    }

    return {
      categories: [...SIZE_BUCKETS],
      buildingMs: SIZE_BUCKETS.map((b) => {
        const e = acc.get(b);
        return e && e.count > 0 ? e.buildingSum / e.count : 0;
      }),
      networkMs: SIZE_BUCKETS.map((b) => {
        const e = acc.get(b);
        return e && e.count > 0 ? e.networkSum / e.count : 0;
      }),
    } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: ['Building', 'Network'] },
      xAxis: { type: 'value', name: 'Latency (ms)' },
      yAxis: { type: 'category', data: data.categories, name: 'Size bucket' },
      series: [
        {
          name: 'Building',
          type: 'bar',
          stack: 'total',
          data: data.buildingMs.map((v) => Math.round(v)),
          itemStyle: { color: t.accent.amber },
        },
        {
          name: 'Network',
          type: 'bar',
          stack: 'total',
          data: data.networkMs.map((v) => Math.round(v)),
          itemStyle: { color: t.accent.teal },
        },
      ],
    };
  },
});
