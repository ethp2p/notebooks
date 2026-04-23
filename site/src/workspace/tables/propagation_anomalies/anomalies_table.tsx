import type { ColumnDef } from '@tanstack/react-table';
import type { Table } from 'apache-arrow';
import { defineTable } from '../define';

type Row = {
  slot: number;
  latency: number;
  expected: number;
  relay: string;
  builder: string;
  blobCount: number;
};

const columns: ColumnDef<Row, unknown>[] = [
  {
    accessorKey: 'slot',
    header: 'Slot',
    cell: (ctx) => {
      const slot = ctx.getValue() as number;
      return (
        <a
          href={`https://lab.ethpandaops.io/ethereum/slots/${slot}`}
          target="_blank"
          rel="noreferrer"
          className="text-accent-teal underline"
        >
          {slot}
        </a>
      );
    },
  },
  {
    accessorKey: 'latency',
    header: 'Latency (ms)',
    cell: (ctx) => Math.round(ctx.getValue() as number),
  },
  {
    accessorKey: 'expected',
    header: 'Expected (ms)',
    cell: (ctx) => Math.round(ctx.getValue() as number),
  },
  {
    accessorKey: 'relay',
    header: 'Relay',
  },
  {
    accessorKey: 'builder',
    header: 'Builder',
  },
  {
    accessorKey: 'blobCount',
    header: 'Blobs',
  },
];

const MAX_BLOBS = 9;

function computeP95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = 0.95 * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return (sorted[lo] ?? 0) * (hi - idx) + (sorted[hi] ?? 0) * (idx - lo);
}

export default defineTable<Row>({
  id: 'propagation-anomalies-table',
  topic: 'propagation-anomalies',
  title: 'Top 100 propagation anomalies',
  description:
    'The 100 blocks with the highest arrival latency relative to the P95 for their blob-count bucket. Each row is an anomaly: its latency_ms exceeded the per-bucket P95 computed across all block_arrival events for the selected date.',
  queries: ['block_events'] as const,
  related: ['anomaly-regression-scatter', 'anomalies-by-relay-bar'],
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 6,
  columns,

  rows(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return [];

    const typeCol = t.getChild('event_type');
    const slotCol = t.getChild('slot');
    const latCol = t.getChild('latency_ms');
    const blobsCol = t.getChild('blob_count');
    const relayCol = t.getChild('relay');
    const builderCol = t.getChild('builder_pubkey');

    if (!typeCol || !slotCol || !latCol) return [];

    type Entry = {
      slot: number;
      latency: number;
      blobCount: number;
      relay: string;
      builder: string;
    };

    const entries: Entry[] = [];

    for (let i = 0; i < t.numRows; i++) {
      const evType = String(typeCol.get(i) ?? '');
      if (evType !== 'block_arrival') continue;

      const slot = Number(slotCol.get(i) ?? 0);
      const latency = Number(latCol.get(i) ?? 0);
      const blobCount = Math.min(Number(blobsCol?.get(i) ?? 0), MAX_BLOBS);
      const rawRelay = String(relayCol?.get(i) ?? 'unknown');
      const relay = rawRelay.length > 20 ? rawRelay.slice(0, 18) + '..' : rawRelay;
      const rawBuilder = String(builderCol?.get(i) ?? 'unknown');
      const builder = rawBuilder.length > 20 ? rawBuilder.slice(0, 18) + '..' : rawBuilder;

      entries.push({ slot, latency, blobCount, relay, builder });
    }

    // Compute P95 per blob-count bucket
    const byBlob = new Map<number, number[]>();
    for (let b = 0; b <= MAX_BLOBS; b++) byBlob.set(b, []);
    for (const e of entries) {
      byBlob.get(e.blobCount)?.push(e.latency);
    }
    const p95 = new Map<number, number>();
    for (let b = 0; b <= MAX_BLOBS; b++) {
      p95.set(b, computeP95(byBlob.get(b) ?? []));
    }

    return entries
      .filter((e) => e.latency > (p95.get(e.blobCount) ?? 0))
      .map((e): Row => ({
        slot: e.slot,
        latency: Math.round(e.latency),
        expected: Math.round(p95.get(e.blobCount) ?? 0),
        relay: e.relay,
        builder: e.builder,
        blobCount: e.blobCount,
      }))
      .sort((a, b) => b.latency - a.latency)
      .slice(0, 100);
  },
});
