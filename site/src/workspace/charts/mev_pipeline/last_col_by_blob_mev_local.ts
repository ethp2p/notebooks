import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

// boxplot item: [min, q1, median, q3, max]
const BoxSchema = z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]);

const DataSchema = z.object({
  blobBins: z.array(z.string()),
  mev: z.array(BoxSchema),
  local: z.array(BoxSchema),
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

const MAX_BLOBS = 9;

export default defineChart({
  id: 'last-col-by-blob-mev-local',
  topic: 'mev-pipeline',
  title: 'Last column seen: MEV vs local',
  description: 'Horizontal grouped boxplots of last column seen latency split by MEV vs local builder, per blob count.',
  queries: ['block_events'] as const,
  related: ['first-col-by-blob-mev-local', 'blocks-by-blobcount-mev-local'],
  context: () =>
    import(
      '../context/mev_pipeline/last_col_by_blob_mev_local.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 9,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return { blobBins: [], mev: [], local: [] };

    const slotCol = t.getChild('slot');
    const typeCol = t.getChild('event_type');
    const latCol = t.getChild('latency_ms');
    const isMevCol = t.getChild('is_mev');
    const blobsCol = t.getChild('blob_count');

    type Bucket = { mev: number[]; local: number[] };
    const byBlob = new Map<number, Bucket>();
    for (let b = 0; b <= MAX_BLOBS; b++) byBlob.set(b, { mev: [], local: [] });

    const slotIsMev = new Map<number, boolean>();
    const slotBlobs = new Map<number, number>();
    const slotLastCol = new Map<number, number>();

    for (let i = 0; i < t.numRows; i++) {
      const s = Number(slotCol?.get(i) ?? 0);
      const evType = String(typeCol?.get(i) ?? '');
      const lat = Number(latCol?.get(i) ?? 0);

      if (evType === 'last_column_seen') {
        slotLastCol.set(s, lat);
        slotBlobs.set(s, Number(blobsCol?.get(i) ?? 0));
        slotIsMev.set(s, Boolean(isMevCol?.get(i)));
      }
    }

    for (const [s, lat] of slotLastCol) {
      const bin = Math.min(slotBlobs.get(s) ?? 0, MAX_BLOBS);
      const isMev = slotIsMev.get(s) ?? false;
      const bucket = byBlob.get(bin) ?? { mev: [], local: [] };
      if (isMev) bucket.mev.push(lat);
      else bucket.local.push(lat);
    }

    const bins = Array.from({ length: MAX_BLOBS + 1 }, (_, b) => b);
    const blobBins = bins.map((b) => `${b} blobs`);
    const mev = bins.map((b) => computeBox(byBlob.get(b)?.mev ?? []));
    const local = bins.map((b) => computeBox(byBlob.get(b)?.local ?? []));

    return { blobBins, mev, local } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: { trigger: 'item' },
      legend: { data: ['MEV', 'Local'], top: 8 },
      grid: { top: 40, right: 16, bottom: 32, left: 16, containLabel: true },
      xAxis: { type: 'value', name: 'last column seen (ms)' },
      yAxis: { type: 'category', data: data.blobBins },
      series: [
        {
          name: 'MEV',
          type: 'boxplot' as const,
          data: data.mev,
          itemStyle: { color: t.accent.teal },
        },
        {
          name: 'Local',
          type: 'boxplot' as const,
          data: data.local,
          itemStyle: { color: t.accent.amber },
        },
      ],
    };
  },
});
