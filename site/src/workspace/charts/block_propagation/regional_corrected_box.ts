import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const REGIONS = ['EU', 'NA', 'AS', 'OC'] as const;
type Region = (typeof REGIONS)[number];

type BoxData = [number, number, number, number, number];

function computeBox(values: number[]): BoxData | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const quantile = (p: number): number => {
    const pos = p * (n - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return (sorted[lo] ?? 0) + ((sorted[hi] ?? 0) - (sorted[lo] ?? 0)) * (pos - lo);
  };
  return [sorted[0] ?? 0, quantile(0.25), quantile(0.5), quantile(0.75), sorted[n - 1] ?? 0];
}

// ECharts boxplot expects numeric tuples. Skip null (no-data) entries by using
// a zero-filled array; the category label still shows, values appear as zero.
function toEChartsBox(box: BoxData | null): number[] {
  if (box === null) return [0, 0, 0, 0, 0];
  return [...box];
}

const DataSchema = z.object({
  regions: z.array(z.string()),
  // One box per region
  boxes: z.array(
    z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]).nullable(),
  ),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'regional-corrected-box',
  topic: 'block-propagation',
  title: 'Size-corrected latency by region',
  description:
    'Boxplot of size-corrected propagation latency grouped by region, surfacing geographic routing asymmetries.',
  queries: ['block_events'] as const,
  related: ['regional-cdf-subplots', 'region-size-heatmap-subplots'],
  context: () =>
    import(
      '../context/block_propagation/regional_corrected_box.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 9,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    const empty = { regions: [...REGIONS], boxes: REGIONS.map(() => null) };
    if (!t) return empty;

    const typeCol = t.getChild('event_type');
    const regionCol = t.getChild('region');
    const correctedCol = t.getChild('corrected_latency_ms');

    if (!typeCol || !regionCol || !correctedCol) return empty;

    const regionValues = new Map<Region, number[]>(REGIONS.map((r) => [r, []]));

    for (let i = 0; i < t.numRows; i++) {
      const evType = String(typeCol.get(i) ?? '');
      if (evType !== 'block_arrival') continue;

      const region = String(regionCol.get(i) ?? '') as Region;
      const corrected = Number(correctedCol.get(i) ?? 0);
      regionValues.get(region)?.push(corrected);
    }

    return {
      regions: [...REGIONS],
      boxes: REGIONS.map((r) => computeBox(regionValues.get(r) ?? [])),
    } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: data.regions, name: 'Region' },
      yAxis: { type: 'value', name: 'Corrected latency (ms)' },
      series: [
        {
          type: 'boxplot',
          data: data.boxes.map(toEChartsBox),
          itemStyle: { color: t.accent.purple, borderColor: t.accent.purple },
        },
      ],
    };
  },
});
