import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { HUE_CYCLE, LIGHT_TOKENS } from '../theme';

const DataSchema = z.object({
  // Sorted ascending so the largest bar appears at top in a horizontal bar.
  entities: z.array(z.string()),
  counts: z.array(z.number()),
});

type Data = z.infer<typeof DataSchema>;

const TOP_N = 15;

export default defineChart({
  id: 'missed-slots-by-entity-bar',
  topic: 'missed-slots',
  title: 'Missed slots by entity',
  description:
    'Top 15 entities ranked by missed-slot count for the selected day. An entity misses a slot when it submitted a bid but no block arrival was observed.',
  queries: ['block_events'] as const,
  related: ['entity-miss-rate-bar', 'missed-slots-table'],
  context: () =>
    import(
      '../context/missed_slots/by_entity_bar.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 1,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return { entities: [], counts: [] };

    const slotCol = t.getChild('slot');
    const typeCol = t.getChild('event_type');
    const entityCol = t.getChild('entity');

    const bidSlots = new Set<number>();
    const arrivalSlots = new Set<number>();
    const bidEntities = new Map<number, string>();

    for (let i = 0; i < t.numRows; i++) {
      const slot = Number(slotCol?.get(i) ?? 0);
      const evType = String(typeCol?.get(i) ?? '');

      if (evType === 'bid_received' || evType === 'bid_winning') {
        bidSlots.add(slot);
        if (!bidEntities.has(slot)) {
          bidEntities.set(slot, String(entityCol?.get(i) ?? 'unknown'));
        }
      } else if (evType === 'block_arrival') {
        arrivalSlots.add(slot);
      }
    }

    const missedByEntity = new Map<string, number>();
    for (const slot of bidSlots) {
      if (!arrivalSlots.has(slot)) {
        const entity = bidEntities.get(slot) ?? 'unknown';
        missedByEntity.set(entity, (missedByEntity.get(entity) ?? 0) + 1);
      }
    }

    const sorted = [...missedByEntity.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(-TOP_N);

    return {
      entities: sorted.map(([e]) => e),
      counts: sorted.map(([, c]) => c),
    } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { top: 16, right: 32, bottom: 16, left: 16, containLabel: true },
      xAxis: { type: 'value', name: 'Missed slots' },
      yAxis: { type: 'category', data: data.entities, axisLabel: { fontSize: 10 } },
      series: [
        {
          type: 'bar',
          data: data.counts,
          itemStyle: {
            color: (params: unknown) => {
              const p = params as { dataIndex: number };
              return t.palette(HUE_CYCLE[p.dataIndex % HUE_CYCLE.length] ?? 30);
            },
          },
          label: { show: true, position: 'right' as const, fontSize: 10 },
        },
      ],
    };
  },
});
