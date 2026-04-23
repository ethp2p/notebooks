import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { HUE_CYCLE, LIGHT_TOKENS } from '../theme';

// boxplot item: [min, q1, median, q3, max]
const BoxSchema = z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]);

const DataSchema = z.object({
  relays: z.array(z.string()),
  blobBins: z.array(z.string()),
  // series per relay: array of BoxSchema (one per blob bin)
  series: z.array(z.object({
    relay: z.string(),
    boxes: z.array(BoxSchema),
  })),
});

type Data = z.infer<typeof DataSchema>;

function computeBox(values: number[]): [number, number, number, number, number] {
  if (values.length === 0) return [0, 0, 0, 0, 0];
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const q = (p: number) => {
    const idx = p * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return ((sorted[lo] ?? 0) * (hi - idx) + (sorted[hi] ?? 0) * (idx - lo));
  };
  return [sorted[0] ?? 0, q(0.25), q(0.5), q(0.75), sorted[n - 1] ?? 0];
}

const BLOB_BIN_EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

function blobBin(count: number): number {
  return Math.min(count, BLOB_BIN_EDGES[BLOB_BIN_EDGES.length - 1] ?? 8);
}

export default defineChart({
  id: 'relay-box-by-blobbin',
  topic: 'mev-pipeline',
  title: 'Block arrival latency by relay and blob count',
  description: 'Grouped boxplots of block first-seen latency per relay, broken out by blob count bucket.',
  queries: ['block_events'] as const,
  related: ['blocks-by-blobcount-mev-local'],
  context: () =>
    import(
      '../context/mev_pipeline/relay_box_by_blobbin.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 6,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return { relays: [], blobBins: [], series: [] };

    const slotCol = t.getChild('slot');
    const typeCol = t.getChild('event_type');
    const latCol = t.getChild('latency_ms');
    const relayCol = t.getChild('relay');
    const blobsCol = t.getChild('blob_count');

    // For block_arrival events: collect (relay, blob_bin, latency_ms)
    // relay comes from bid_winning event for the same slot
    const slotRelay = new Map<number, string>();
    const slotBlobs = new Map<number, number>();
    const slotArrival = new Map<number, number>();

    for (let i = 0; i < t.numRows; i++) {
      const s = Number(slotCol?.get(i) ?? 0);
      const evType = String(typeCol?.get(i) ?? '');
      const lat = Number(latCol?.get(i) ?? 0);

      if (evType === 'bid_winning') {
        const relay = String(relayCol?.get(i) ?? 'unknown');
        slotRelay.set(s, relay);
      } else if (evType === 'block_arrival') {
        slotArrival.set(s, lat);
        slotBlobs.set(s, Number(blobsCol?.get(i) ?? 0));
      }
    }

    // Group latencies by (relay, blob_bin)
    const data = new Map<string, Map<number, number[]>>();

    for (const [s, lat] of slotArrival) {
      const relay = slotRelay.get(s) ?? 'unknown';
      const bin = blobBin(slotBlobs.get(s) ?? 0);
      let byBin = data.get(relay);
      if (!byBin) { byBin = new Map(); data.set(relay, byBin); }
      const arr = byBin.get(bin) ?? [];
      arr.push(lat);
      byBin.set(bin, arr);
    }

    const relays = [...data.keys()].sort();
    const blobBins = BLOB_BIN_EDGES.map((b) => `${b} blobs`);

    const series = relays.map((relay) => {
      const byBin = data.get(relay) ?? new Map();
      const boxes = BLOB_BIN_EDGES.map((bin) => computeBox(byBin.get(bin) ?? []));
      return { relay, boxes };
    });

    return { relays, blobBins, series } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: { trigger: 'item' },
      legend: { data: data.relays, bottom: 0 },
      grid: { top: 40, right: 16, bottom: 80, left: 16, containLabel: true },
      xAxis: { type: 'category', data: data.blobBins, name: 'blob count' },
      yAxis: { type: 'value', name: 'block first-seen (ms)' },
      series: data.series.map(({ relay, boxes }, idx) => ({
        name: relay,
        type: 'boxplot' as const,
        data: boxes,
        itemStyle: { color: t.palette(HUE_CYCLE[idx % HUE_CYCLE.length] ?? 30) },
      })),
    };
  },
});
