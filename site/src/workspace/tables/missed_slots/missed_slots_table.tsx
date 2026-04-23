import type { ColumnDef } from '@tanstack/react-table';
import type { Table } from 'apache-arrow';
import { defineTable } from '../define';

type Row = {
  slot: number;
  slot_start: Date;
  entity: string;
  relay: string;
  blob_count: number;
  link: string;
};

function formatUtc(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

const columns: ColumnDef<Row, unknown>[] = [
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
    accessorKey: 'slot_start',
    header: 'Slot start (UTC)',
    cell: (ctx) => formatUtc(ctx.getValue() as Date),
  },
  {
    accessorKey: 'entity',
    header: 'Entity',
  },
  {
    accessorKey: 'relay',
    header: 'Relay',
  },
  {
    accessorKey: 'blob_count',
    header: 'Blobs',
  },
  {
    id: 'lab_link',
    header: 'Lab',
    cell: (ctx) => {
      const link = ctx.row.original.link;
      return (
        <a href={link} target="_blank" rel="noopener noreferrer" className="text-accent-teal underline">
          View
        </a>
      );
    },
  },
];

export default defineTable<Row>({
  id: 'missed-slots-table',
  topic: 'missed-slots',
  title: 'Top 100 missed slots',
  description:
    'The 100 most recent missed slots sorted by slot descending. A slot is missed when a bid event was observed but no block arrival event exists. Entity and relay fields are populated from the first bid_received or bid_winning event for that slot.',
  queries: ['block_events'] as const,
  related: ['missed-slots-by-entity-bar', 'entity-miss-rate-bar'],
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 5,
  columns,

  rows(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return [];

    const slotCol = t.getChild('slot');
    const typeCol = t.getChild('event_type');
    const slotStartCol = t.getChild('slot_start');
    const entityCol = t.getChild('entity');
    const relayCol = t.getChild('relay');
    const blobCol = t.getChild('blob_count');

    if (!slotCol || !typeCol) return [];

    // Collect bid metadata and arrival set in a single pass.
    type BidMeta = {
      slot_start: Date;
      entity: string;
      relay: string;
      blob_count: number;
    };

    const bidMeta = new Map<number, BidMeta>();
    const arrivalSlots = new Set<number>();

    for (let i = 0; i < t.numRows; i++) {
      const slot = Number(slotCol.get(i) ?? 0);
      const evType = String(typeCol.get(i) ?? '');

      if (evType === 'bid_received' || evType === 'bid_winning') {
        if (!bidMeta.has(slot)) {
          const slotStartRaw = slotStartCol?.get(i);
          const slotStartMs =
            slotStartRaw instanceof Date
              ? slotStartRaw.getTime()
              : typeof slotStartRaw === 'number'
                ? slotStartRaw
                : 0;
          bidMeta.set(slot, {
            slot_start: new Date(slotStartMs),
            entity: String(entityCol?.get(i) ?? '-'),
            relay: String(relayCol?.get(i) ?? '-'),
            blob_count: blobCol ? Number(blobCol.get(i) ?? 0) : 0,
          });
        }
      } else if (evType === 'block_arrival') {
        arrivalSlots.add(slot);
      }
    }

    const rows: Row[] = [];
    for (const [slot, meta] of bidMeta) {
      if (!arrivalSlots.has(slot)) {
        rows.push({
          slot,
          slot_start: meta.slot_start,
          entity: meta.entity,
          relay: meta.relay,
          blob_count: meta.blob_count,
          link: `https://lab.ethpandaops.io/ethereum/slots/${slot}`,
        });
      }
    }

    return rows.sort((a, b) => b.slot - a.slot).slice(0, 100);
  },
});
