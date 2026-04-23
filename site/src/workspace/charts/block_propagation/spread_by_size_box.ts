import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const SIZE_BUCKETS = ['tiny', 'small', 'medium', 'large'] as const;
type SizeBucket = (typeof SIZE_BUCKETS)[number];

function sizeBucket(bytes: number): SizeBucket {
  if (bytes < 50_000) return 'tiny';
  if (bytes < 200_000) return 'small';
  if (bytes < 500_000) return 'medium';
  return 'large';
}

type BoxData = [number, number, number, number, number];

function computeBox(values: number[]): BoxData | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const quantile = (p: number): number => {
    const pos = p * (n - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return (sorted[lo] ?? 0) + ((sorted[hi] ?? 0) - (sorted[lo] ?? 0)) * (pos - lo);
  };
  return [sorted[0] ?? 0, quantile(0.25), quantile(0.5), quantile(0.75), sorted[n - 1] ?? 0];
}

// ECharts boxplot expects numeric tuples. Skip null (no-data) entries by using
// a zero-filled array; the category label still shows, values appear as zero.
function toEChartsBox(box: BoxData | null): number[] {
  if (box === null) return [0, 0, 0, 0, 0];
  return [...box];
}

const DataSchema = z.object({
  categories: z.array(z.string()),
  boxes: z.array(
    z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]).nullable(),
  ),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'spread-by-size-box',
  topic: 'block-propagation',
  title: 'Propagation spread by wire-size bucket',
  description:
    'Horizontal boxplots of per-slot propagation spread (max observer minus min observer latency), grouped by wire-size bucket.',
  queries: ['block_events'] as const,
  related: ['spread-vs-size-scatter', 'corrected-by-sizebucket-box'],
  context: () =>
    import(
      '../context/block_propagation/spread_by_size_box.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 12,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    const empty = { categories: [...SIZE_BUCKETS], boxes: SIZE_BUCKETS.map(() => null) };
    if (!t) return empty;

    const typeCol = t.getChild('event_type');
    const sizeCol = t.getChild('wire_size_bytes');
    const spreadCol = t.getChild('propagation_spread_ms');

    if (!typeCol || !sizeCol || !spreadCol) return empty;

    const bucketValues = new Map<SizeBucket, number[]>(SIZE_BUCKETS.map((b) => [b, []]));

    for (let i = 0; i < t.numRows; i++) {
      const evType = String(typeCol.get(i) ?? '');
      if (evType !== 'block_arrival') continue;

      const bytes = Number(sizeCol.get(i) ?? 0);
      const spread = Number(spreadCol.get(i) ?? 0);
      bucketValues.get(sizeBucket(bytes))?.push(spread);
    }

    return {
      categories: [...SIZE_BUCKETS],
      boxes: SIZE_BUCKETS.map((b) => computeBox(bucketValues.get(b) ?? [])),
    } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'value', name: 'Spread (ms)' },
      yAxis: { type: 'category', data: data.categories, name: 'Size bucket' },
      series: [
        {
          type: 'boxplot',
          data: data.boxes.map(toEChartsBox),
          itemStyle: { color: t.accent.amber, borderColor: t.accent.amber },
        },
      ],
    };
  },
});
