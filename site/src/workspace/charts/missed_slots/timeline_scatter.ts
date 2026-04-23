import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const DataSchema = z.object({
  // Each entry is [slot_start_ms, 0] — one-dimensional strip plot.
  points: z.array(z.tuple([z.number(), z.number()])),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'missed-slots-timeline-scatter',
  topic: 'missed-slots',
  title: 'Missed slots timeline',
  description:
    'Strip plot of missed slots along the time axis. Each cross marks a slot where a bid was observed but no block arrival occurred. Clusters indicate periods of elevated miss activity.',
  queries: ['block_events'] as const,
  related: ['missed-slots-hourly-bar', 'missed-slots-by-entity-bar'],
  context: () =>
    import(
      '../context/missed_slots/timeline_scatter.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 4,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return { points: [] };

    const slotCol = t.getChild('slot');
    const typeCol = t.getChild('event_type');
    const slotStartCol = t.getChild('slot_start');

    // First pass: collect all observed slots and identify bid slots with times.
    const allSlots = new Set<number>();
    const bidSlotTimes = new Map<number, number>(); // slot -> slot_start_ms
    const arrivalSlots = new Set<number>();

    for (let i = 0; i < t.numRows; i++) {
      const slot = Number(slotCol?.get(i) ?? 0);
      const evType = String(typeCol?.get(i) ?? '');

      allSlots.add(slot);

      if (evType === 'bid_received' || evType === 'bid_winning') {
        if (!bidSlotTimes.has(slot)) {
          const slotStartRaw = slotStartCol?.get(i);
          const slotStartMs =
            slotStartRaw instanceof Date
              ? slotStartRaw.getTime()
              : typeof slotStartRaw === 'number'
                ? slotStartRaw
                : 0;
          bidSlotTimes.set(slot, slotStartMs);
        }
      } else if (evType === 'block_arrival') {
        arrivalSlots.add(slot);
      }
    }

    // Enumerate all integer slots from min to max observed in any event.
    // A slot is missed if it is in the bid set but not in the arrival set.
    const points: [number, number][] = [];
    for (const [slot, startMs] of bidSlotTimes) {
      if (!arrivalSlots.has(slot)) {
        points.push([startMs, 0]);
      }
    }

    points.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));

    return { points } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as { value: [number, number] };
          const d = new Date(p.value[0]);
          const pad = (n: number) => String(n).padStart(2, '0');
          const ts = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
          return ts;
        },
      },
      grid: { top: 24, right: 32, bottom: 48, left: 16, containLabel: true },
      xAxis: {
        type: 'time',
        name: 'Time (UTC)',
        axisLabel: { fontSize: 9 },
      },
      yAxis: {
        type: 'value',
        show: false,
        min: -0.5,
        max: 0.5,
      },
      series: [
        {
          type: 'scatter',
          data: data.points,
          symbol: 'cross',
          symbolSize: 10,
          itemStyle: { color: t.accent.amber },
        },
      ],
    };
  },
});
