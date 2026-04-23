import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const DataSchema = z.object({
  // Sorted ascending so largest bar appears at top in horizontal layout.
  entities: z.array(z.string()),
  rates: z.array(z.number()),   // percentage 0-100
  maxRate: z.number(),
});

type Data = z.infer<typeof DataSchema>;

const MIN_BIDS = 5; // Filter entities with fewer bids to reduce noise.
const TOP_N = 20;

export default defineChart({
  id: 'entity-miss-rate-bar',
  topic: 'missed-slots',
  title: 'Entity miss rate',
  description:
    'Percentage of bid slots that had no corresponding block arrival, per entity. Entities with fewer than 5 bids are excluded. Color encodes miss rate severity.',
  queries: ['block_events'] as const,
  related: ['missed-slots-by-entity-bar', 'missed-slots-table'],
  context: () =>
    import(
      '../context/missed_slots/miss_rate_bar.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 2,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return { entities: [], rates: [], maxRate: 0 };

    const slotCol = t.getChild('slot');
    const typeCol = t.getChild('event_type');
    const entityCol = t.getChild('entity');

    const bidsByEntity = new Map<string, Set<number>>();
    const arrivalSlots = new Set<number>();

    for (let i = 0; i < t.numRows; i++) {
      const slot = Number(slotCol?.get(i) ?? 0);
      const evType = String(typeCol?.get(i) ?? '');

      if (evType === 'bid_received' || evType === 'bid_winning') {
        const entity = String(entityCol?.get(i) ?? 'unknown');
        let slots = bidsByEntity.get(entity);
        if (!slots) { slots = new Set(); bidsByEntity.set(entity, slots); }
        slots.add(slot);
      } else if (evType === 'block_arrival') {
        arrivalSlots.add(slot);
      }
    }

    const rates: Array<[string, number]> = [];
    for (const [entity, slots] of bidsByEntity) {
      if (slots.size < MIN_BIDS) continue;
      let missed = 0;
      for (const slot of slots) {
        if (!arrivalSlots.has(slot)) missed++;
      }
      rates.push([entity, (missed / slots.size) * 100]);
    }

    const sorted = rates.sort((a, b) => a[1] - b[1]).slice(-TOP_N);
    const maxRate = sorted.length > 0 ? (sorted[sorted.length - 1]?.[1] ?? 0) : 0;

    return {
      entities: sorted.map(([e]) => e),
      rates: sorted.map(([, r]) => Math.round(r * 10) / 10),
      maxRate: Math.ceil(maxRate),
    } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const arr = params as Array<{ name: string; value: number }>;
          const p = arr[0];
          if (!p) return '';
          return `${p.name}: ${p.value.toFixed(1)}%`;
        },
      },
      grid: { top: 16, right: 48, bottom: 16, left: 16, containLabel: true },
      xAxis: {
        type: 'value',
        name: 'Miss rate (%)',
        max: Math.max(data.maxRate, 10),
      },
      yAxis: {
        type: 'category',
        data: data.entities,
        axisLabel: { fontSize: 10 },
      },
      visualMap: {
        show: false,
        type: 'continuous',
        dimension: 0,
        seriesIndex: 0,
        min: 0,
        max: Math.max(data.maxRate, 10),
        inRange: { color: [t.accent.teal, t.accent.amber] },
      },
      series: [
        {
          type: 'bar',
          data: data.rates,
          label: {
            show: true,
            position: 'right' as const,
            fontSize: 10,
            formatter: (params: unknown) => {
              const p = params as { value: number };
              return `${p.value.toFixed(1)}%`;
            },
          },
        },
      ],
    };
  },
});
