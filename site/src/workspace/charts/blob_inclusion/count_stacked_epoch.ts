import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';

// Bucket labels and the slot range each covers.
const BUCKETS = ['0', '1-2', '3-4', '5-6', '7-9'] as const;
type Bucket = (typeof BUCKETS)[number];

function slotsToBucket(blobCount: number): Bucket {
  if (blobCount === 0) return '0';
  if (blobCount <= 2) return '1-2';
  if (blobCount <= 4) return '3-4';
  if (blobCount <= 6) return '5-6';
  return '7-9';
}

const DataSchema = z.object({
  epochs: z.array(z.number()),
  // Parallel arrays — one entry per epoch per bucket
  series: z.record(z.string(), z.array(z.number())),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'blob-count-stacked-epoch',
  topic: 'blob-inclusion',
  title: 'Blobs per slot by epoch',
  description:
    'Stacked bar chart of slot counts per epoch, broken down by blob-count bucket.',
  queries: ['blob_events'] as const,
  related: ['blob-density-scatter', 'blob-popularity-heatmap'],
  context: () =>
    import(
      '../context/blob_inclusion/count_stacked_epoch.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 2,

  dataSchema: DataSchema,

  transform(raw) {
    const table = raw['blob_events'] as Table | undefined;
    if (!table) return { epochs: [], series: {} };

    const epochCol = table.getChild('epoch');
    const blobCountCol = table.getChild('blob_count');

    // epoch -> bucket -> slot count
    const epochMap = new Map<number, Map<Bucket, number>>();

    for (let i = 0; i < table.numRows; i++) {
      const epoch = Number(epochCol?.get(i) ?? 0);
      const blobCount = Number(blobCountCol?.get(i) ?? 0);
      const bucket = slotsToBucket(blobCount);

      if (!epochMap.has(epoch)) {
        epochMap.set(epoch, new Map<Bucket, number>());
      }
      const bucketMap = epochMap.get(epoch) ?? new Map<Bucket, number>();
      bucketMap.set(bucket, (bucketMap.get(bucket) ?? 0) + 1);
      epochMap.set(epoch, bucketMap);
    }

    const epochs = Array.from(epochMap.keys()).sort((a, b) => a - b);

    const series: Record<string, number[]> = {};
    for (const b of BUCKETS) {
      series[b] = epochs.map((e) => epochMap.get(e)?.get(b) ?? 0);
    }

    return { epochs, series } satisfies Data;
  },

  option(data) {
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: [...BUCKETS] },
      xAxis: {
        type: 'category',
        data: data.epochs.map(String),
        name: 'Epoch',
        axisLabel: { rotate: 45 },
      },
      yAxis: {
        type: 'value',
        name: 'Slot count',
        minInterval: 1,
      },
      series: BUCKETS.map((b) => ({
        name: b,
        type: 'bar' as const,
        stack: 'total',
        data: data.series[b] ?? [],
      })),
    };
  },
});
