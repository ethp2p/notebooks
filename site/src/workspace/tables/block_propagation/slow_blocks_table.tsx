import type { ColumnDef } from '@tanstack/react-table';
import type { Table } from 'apache-arrow';
import { defineTable } from '../define';

type SlowBlockRow = {
  slot: number;
  latency_ms: number;
  expected_ms: number;
  size_bucket: string;
  wire_size_bytes: number;
  entity: string;
  builder: string;
  blob_count: number;
  link: string;
};

const columns: ColumnDef<SlowBlockRow, unknown>[] = [
  {
    accessorKey: 'slot',
    header: 'Slot',
    cell: (ctx) => {
      const slot = ctx.getValue() as number;
      const link = ctx.row.original.link;
      return (
        <a href={link} target="_blank" rel="noopener noreferrer" className="text-accent-teal underline">
          {slot}
        </a>
      );
    },
  },
  {
    accessorKey: 'latency_ms',
    header: 'Latency (ms)',
    cell: (ctx) => Math.round(ctx.getValue() as number),
  },
  {
    accessorKey: 'expected_ms',
    header: 'Expected (ms)',
    cell: (ctx) => Math.round(ctx.getValue() as number),
  },
  {
    accessorKey: 'size_bucket',
    header: 'Size bucket',
  },
  {
    accessorKey: 'wire_size_bytes',
    header: 'Wire size',
    cell: (ctx) => {
      const bytes = ctx.getValue() as number;
      return bytes > 1_000_000
        ? `${(bytes / 1_000_000).toFixed(2)} MB`
        : `${(bytes / 1_000).toFixed(1)} KB`;
    },
  },
  {
    accessorKey: 'entity',
    header: 'Entity',
  },
  {
    accessorKey: 'builder',
    header: 'Builder',
  },
  {
    accessorKey: 'blob_count',
    header: 'Blobs',
  },
];

function sizeBucketLabel(bytes: number): string {
  if (bytes < 50_000) return 'tiny';
  if (bytes < 200_000) return 'small';
  if (bytes < 500_000) return 'medium';
  return 'large';
}

// Compute bucket p95 latencies from the full dataset to determine expected_ms.
function computeBucketP95(entries: Array<{ size_bucket: string; lat: number }>): Map<string, number> {
  const bucketLats = new Map<string, number[]>();
  for (const { size_bucket, lat } of entries) {
    const arr = bucketLats.get(size_bucket) ?? [];
    arr.push(lat);
    bucketLats.set(size_bucket, arr);
  }

  const result = new Map<string, number>();
  for (const [bucket, lats] of bucketLats) {
    const sorted = [...lats].sort((a, b) => a - b);
    const pos = 0.95 * (sorted.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    const p95 = (sorted[lo] ?? 0) + ((sorted[hi] ?? 0) - (sorted[lo] ?? 0)) * (pos - lo);
    result.set(bucket, p95);
  }
  return result;
}

export default defineTable<SlowBlockRow>({
  id: 'slow-blocks-table',
  topic: 'block-propagation',
  title: 'Top 100 slowest blocks by size bucket',
  description:
    'The 100 blocks with the highest propagation latency relative to their wire-size bucket p95. Rows are sortable by any column.',
  queries: ['block_events'] as const,
  related: ['double-outlier-quadrant-scatter', 'entity-anomaly-rate-bar'],
  context: () =>
    import(
      '../../charts/context/block_propagation/slow_blocks_table.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 19,
  columns,

  rows(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return [];

    const typeCol = t.getChild('event_type');
    const slotCol = t.getChild('slot');
    const latCol = t.getChild('latency_ms');
    const sizeCol = t.getChild('wire_size_bytes');
    const entityCol = t.getChild('entity') ?? t.getChild('builder_pubkey');
    const builderCol = t.getChild('builder') ?? t.getChild('builder_pubkey');
    const blobCol = t.getChild('blob_count');

    if (!typeCol || !slotCol || !latCol) return [];

    type Entry = {
      slot: number;
      lat: number;
      size: number;
      size_bucket: string;
      entity: string;
      builder: string;
      blob_count: number;
    };

    const entries: Entry[] = [];

    for (let i = 0; i < t.numRows; i++) {
      const evType = String(typeCol.get(i) ?? '');
      if (evType !== 'block_arrival') continue;

      const slot = Number(slotCol.get(i) ?? 0);
      const lat = Number(latCol.get(i) ?? 0);
      const size = sizeCol ? Number(sizeCol.get(i) ?? 0) : 0;
      const raw_entity = String(entityCol?.get(i) ?? 'unknown');
      const entity = raw_entity.length > 20 ? raw_entity.slice(0, 18) + '..' : raw_entity;
      const raw_builder = String(builderCol?.get(i) ?? 'unknown');
      const builder = raw_builder.length > 20 ? raw_builder.slice(0, 18) + '..' : raw_builder;
      const blob_count = blobCol ? Number(blobCol.get(i) ?? 0) : 0;
      const size_bucket = sizeBucketLabel(size);

      entries.push({ slot, lat, size, size_bucket, entity, builder, blob_count });
    }

    const bucketP95 = computeBucketP95(entries.map((e) => ({ size_bucket: e.size_bucket, lat: e.lat })));

    // Sort by excess over bucket p95 (most anomalous first), take top 100
    return entries
      .map((e): SlowBlockRow => ({
        slot: e.slot,
        latency_ms: Math.round(e.lat),
        expected_ms: Math.round(bucketP95.get(e.size_bucket) ?? 0),
        size_bucket: e.size_bucket,
        wire_size_bytes: e.size,
        entity: e.entity,
        builder: e.builder,
        blob_count: e.blob_count,
        link: `https://lab.ethpandaops.io/ethereum/slots/${e.slot}`,
      }))
      .sort((a, b) => b.latency_ms - a.latency_ms)
      .slice(0, 100);
  },
});
