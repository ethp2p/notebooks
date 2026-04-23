import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

// Blob count buckets: 0, 1, 2, 3, 4, 5, 6+
const BLOB_BUCKETS = ['0', '1', '2', '3', '4', '5', '6+'] as const;
type BlobBucket = (typeof BLOB_BUCKETS)[number];

function blobBucket(count: number): BlobBucket {
  if (count >= 6) return '6+';
  return String(count) as BlobBucket;
}

// [min, q1, median, q3, max] — present only when the bucket has data.
type BoxData = [number, number, number, number, number];

function computeBox(values: number[]): BoxData | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const quantile = (p: number): number => {
    const pos = p * (n - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    const loVal = sorted[lo] ?? 0;
    const hiVal = sorted[hi] ?? 0;
    return loVal + (hiVal - loVal) * (pos - lo);
  };
  return [sorted[0] ?? 0, quantile(0.25), quantile(0.5), quantile(0.75), sorted[n - 1] ?? 0];
}

const DataSchema = z.object({
  categories: z.array(z.string()),
  // Parallel arrays indexed by BLOB_BUCKETS; null means no data for that bucket.
  mevBoxes: z.array(
    z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]).nullable(),
  ),
  localBoxes: z.array(
    z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]).nullable(),
  ),
});

type Data = z.infer<typeof DataSchema>;

// Convert a BoxData (or null) into the ECharts boxplot data-item format.
// Null buckets use the '-' sentinel so ECharts renders a gap instead of zero.
function toEChartsBox(
  box: BoxData | null,
): { value: (number | '-')[]; itemStyle?: object } {
  if (box === null) {
    return { value: ['-', '-', '-', '-', '-'] };
  }
  return { value: box };
}

export default defineChart({
  id: 'block-to-column-boxplot',
  topic: 'block-column-timing',
  title: 'Block-to-last-column spread by blob count (MEV vs local)',
  description:
    'Boxplot of per-slot spread between block arrival and last column seen, grouped by blob count bucket and MEV vs local.',
  queries: ['block_events'] as const,
  related: ['block-to-column-histogram', 'column-spread-boxplot-blob'],
  context: () =>
    import(
      '../context/block_column_timing/boxplot.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 2,

  dataSchema: DataSchema,

  transform(raw) {
    const table = raw['block_events'] as Table | undefined;
    if (!table) {
      return {
        categories: [...BLOB_BUCKETS],
        mevBoxes: BLOB_BUCKETS.map(() => null),
        localBoxes: BLOB_BUCKETS.map(() => null),
      };
    }

    const slot = table.getChild('slot');
    const type = table.getChild('event_type');
    const lat = table.getChild('latency_ms');
    const isMevCol = table.getChild('is_mev');
    const blobsCol = table.getChild('blob_count');

    if (!slot || !type || !lat) {
      return {
        categories: [...BLOB_BUCKETS],
        mevBoxes: BLOB_BUCKETS.map(() => null),
        localBoxes: BLOB_BUCKETS.map(() => null),
      };
    }

    const blockArrivalMs = new Map<number, { ms: number; isMev: boolean; blobCount: number }>();
    const lastColMs = new Map<number, number>();

    for (let i = 0; i < (table as Table).numRows; i++) {
      const s = Number(slot.get(i));
      const et = String(type.get(i));
      if (et === 'block_arrival') {
        blockArrivalMs.set(s, {
          ms: Number(lat.get(i)),
          isMev: Boolean(isMevCol?.get(i)),
          blobCount: Number(blobsCol?.get(i) ?? 0),
        });
      } else if (et === 'last_column_seen') {
        lastColMs.set(s, Number(lat.get(i)));
      }
    }

    const mevValues = new Map<BlobBucket, number[]>(BLOB_BUCKETS.map((b) => [b, []]));
    const localValues = new Map<BlobBucket, number[]>(BLOB_BUCKETS.map((b) => [b, []]));

    for (const [s, block] of blockArrivalMs) {
      const colMs = lastColMs.get(s);
      if (colMs === undefined) continue;
      const spread = colMs - block.ms;
      const bucket = blobBucket(block.blobCount);
      if (block.isMev) {
        mevValues.get(bucket)?.push(spread);
      } else {
        localValues.get(bucket)?.push(spread);
      }
    }

    return {
      categories: [...BLOB_BUCKETS],
      mevBoxes: BLOB_BUCKETS.map((b) => computeBox(mevValues.get(b) ?? [])),
      localBoxes: BLOB_BUCKETS.map((b) => computeBox(localValues.get(b) ?? [])),
    } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const items = params as Array<{
            seriesName: string;
            value: (number | '-')[];
          }>;
          if (!items.length) return '';
          const lines = items
            .filter((it) => it.value[0] !== '-')
            .map((it) => {
              const v = it.value as number[];
              return `${it.seriesName}: min=${Math.round(v[0] ?? 0)} Q1=${Math.round(v[1] ?? 0)} med=${Math.round(v[2] ?? 0)} Q3=${Math.round(v[3] ?? 0)} max=${Math.round(v[4] ?? 0)}`;
            })
            .join('<br/>');
          return lines;
        },
      },
      legend: { data: ['MEV', 'Local'] },
      grid: { left: 56, right: 16, top: 40, bottom: 48 },
      xAxis: {
        type: 'category',
        data: data.categories,
        name: 'blob count',
        nameLocation: 'middle',
        nameGap: 32,
      },
      yAxis: {
        type: 'value',
        name: 'spread (ms)',
      },
      series: [
        {
          name: 'MEV',
          type: 'boxplot',
          data: data.mevBoxes.map(toEChartsBox),
          itemStyle: { color: t.accent.purple, borderColor: t.accent.purple },
        },
        {
          name: 'Local',
          type: 'boxplot',
          data: data.localBoxes.map(toEChartsBox),
          itemStyle: { color: t.accent.teal, borderColor: t.accent.teal },
        },
      ],
    };
  },
});
