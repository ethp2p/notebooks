import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

type BoxData = [number, number, number, number, number]; // [min, q1, median, q3, max]

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

const DataSchema = z.object({
  rawBox: z
    .tuple([z.number(), z.number(), z.number(), z.number(), z.number()])
    .nullable(),
  correctedBox: z
    .tuple([z.number(), z.number(), z.number(), z.number(), z.number()])
    .nullable(),
});

type Data = z.infer<typeof DataSchema>;

// ECharts boxplot expects numeric tuples. Skip null (no-data) entries by using
// a zero-filled array; the category label still shows, values appear as zero.
function toEChartsBox(box: BoxData | null): number[] {
  if (box === null) return [0, 0, 0, 0, 0];
  return [...box];
}

export default defineChart({
  id: 'raw-vs-corrected-box',
  topic: 'block-propagation',
  title: 'Raw vs size-corrected propagation latency',
  description:
    'Side-by-side boxplot comparing raw block propagation latency to size-corrected latency across all slots.',
  queries: ['block_events'] as const,
  related: ['corrected-vs-size-scatter', 'corrected-by-sizebucket-box'],
  context: () =>
    import(
      '../context/block_propagation/raw_vs_corrected_box.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 5,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return { rawBox: null, correctedBox: null };

    const typeCol = t.getChild('event_type');
    const latCol = t.getChild('latency_ms');
    const correctedCol = t.getChild('corrected_latency_ms');

    if (!typeCol || !latCol) return { rawBox: null, correctedBox: null };

    const rawValues: number[] = [];
    const correctedValues: number[] = [];

    for (let i = 0; i < t.numRows; i++) {
      const evType = String(typeCol.get(i) ?? '');
      if (evType !== 'block_arrival') continue;

      rawValues.push(Number(latCol.get(i) ?? 0));
      if (correctedCol) correctedValues.push(Number(correctedCol.get(i) ?? 0));
    }

    return {
      rawBox: computeBox(rawValues),
      correctedBox: correctedValues.length > 0 ? computeBox(correctedValues) : null,
    } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: ['Raw', 'Size-corrected'] },
      xAxis: { type: 'category', data: ['Raw', 'Size-corrected'] },
      yAxis: { type: 'value', name: 'Latency (ms)' },
      series: [
        {
          name: 'Raw',
          type: 'boxplot',
          data: [toEChartsBox(data.rawBox)],
          itemStyle: { color: t.accent.purple, borderColor: t.accent.purple },
        },
        {
          name: 'Size-corrected',
          type: 'boxplot',
          data: [toEChartsBox(null), toEChartsBox(data.correctedBox)],
          itemStyle: { color: t.accent.teal, borderColor: t.accent.teal },
        },
      ],
    };
  },
});
