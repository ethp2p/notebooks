import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const DataSchema = z.object({
  // Index 0 = 00:xx UTC, index 23 = 23:xx UTC.
  hours: z.array(z.string()),
  counts: z.array(z.number()),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'missed-slots-hourly-bar',
  topic: 'missed-slots',
  title: 'Missed slots per hour',
  description:
    'Count of missed slots grouped by UTC hour. A slot is missed when it appears in bid events but has no block arrival event.',
  queries: ['block_events'] as const,
  related: ['missed-slots-timeline-scatter', 'missed-slots-by-entity-bar'],
  context: () =>
    import(
      '../context/missed_slots/hourly_bar.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 3,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) {
      const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00');
      return { hours, counts: Array(24).fill(0) as number[] };
    }

    const slotCol = t.getChild('slot');
    const typeCol = t.getChild('event_type');
    const slotStartCol = t.getChild('slot_start');

    const bidSlots = new Map<number, number>(); // slot -> hour
    const arrivalSlots = new Set<number>();

    for (let i = 0; i < t.numRows; i++) {
      const slot = Number(slotCol?.get(i) ?? 0);
      const evType = String(typeCol?.get(i) ?? '');

      if (evType === 'bid_received' || evType === 'bid_winning') {
        if (!bidSlots.has(slot)) {
          const slotStartRaw = slotStartCol?.get(i);
          const slotStartMs =
            slotStartRaw instanceof Date
              ? slotStartRaw.getTime()
              : typeof slotStartRaw === 'number'
                ? slotStartRaw
                : 0;
          const hour = new Date(slotStartMs).getUTCHours();
          bidSlots.set(slot, hour);
        }
      } else if (evType === 'block_arrival') {
        arrivalSlots.add(slot);
      }
    }

    const counts = Array(24).fill(0) as number[];
    for (const [slot, hour] of bidSlots) {
      if (!arrivalSlots.has(slot)) {
        counts[hour] = (counts[hour] ?? 0) + 1;
      }
    }

    const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00');
    return { hours, counts } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { top: 24, right: 16, bottom: 40, left: 16, containLabel: true },
      xAxis: {
        type: 'category',
        data: data.hours,
        name: 'UTC hour',
        axisLabel: { rotate: 45, fontSize: 9 },
      },
      yAxis: { type: 'value', name: 'Missed slots', minInterval: 1 },
      series: [
        {
          type: 'bar',
          data: data.counts,
          itemStyle: { color: t.accent.amber },
        },
      ],
    };
  },
});
