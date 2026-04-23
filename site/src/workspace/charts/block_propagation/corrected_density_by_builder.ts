import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const X_BINS = 20; // wire size axis
const Y_BINS = 20; // corrected latency axis

function bin(value: number, min: number, max: number, bins: number): number {
  if (max <= min) return 0;
  return Math.min(Math.floor(((value - min) / (max - min)) * bins), bins - 1);
}

const CellSchema = z.tuple([z.number(), z.number(), z.number()]); // [x_bin, y_bin, count]

const DataSchema = z.object({
  // Two grids: MEV and local
  mevCells: z.array(CellSchema),
  localCells: z.array(CellSchema),
  maxCount: z.number(),
  xLabels: z.array(z.string()),
  yLabels: z.array(z.string()),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'corrected-density-by-builder',
  topic: 'block-propagation',
  title: 'Size-corrected latency density (MEV vs local)',
  description:
    'Two 2D density heatmaps (MEV and local) showing the joint distribution of wire size and size-corrected latency.',
  queries: ['block_events'] as const,
  related: ['top-entity-density-facets', 'corrected-by-sizebucket-box'],
  context: () =>
    import(
      '../context/block_propagation/corrected_density_by_builder.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 8,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    const empty = { mevCells: [], localCells: [], maxCount: 0, xLabels: [], yLabels: [] };
    if (!t) return empty;

    const typeCol = t.getChild('event_type');
    const sizeCol = t.getChild('wire_size_bytes');
    const correctedCol = t.getChild('corrected_latency_ms');
    const isMevCol = t.getChild('is_mev');

    if (!typeCol || !sizeCol || !correctedCol) return empty;

    type Point = { x: number; y: number; isMev: boolean };
    const points: Point[] = [];

    for (let i = 0; i < t.numRows; i++) {
      const evType = String(typeCol.get(i) ?? '');
      if (evType !== 'block_arrival') continue;

      const x = Number(sizeCol.get(i) ?? 0);
      const y = Number(correctedCol.get(i) ?? 0);
      const isMev = Boolean(isMevCol?.get(i));
      points.push({ x, y, isMev });
    }

    if (points.length === 0) return empty;

    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);

    const xStep = (xMax - xMin) / X_BINS;
    const yStep = (yMax - yMin) / Y_BINS;
    const xLabels = Array.from({ length: X_BINS }, (_, i) =>
      `${Math.round((xMin + i * xStep) / 1000)}K`,
    );
    const yLabels = Array.from({ length: Y_BINS }, (_, i) =>
      String(Math.round(yMin + i * yStep)),
    );

    const mevGrid = new Map<number, number>();
    const localGrid = new Map<number, number>();

    for (const p of points) {
      const xi = bin(p.x, xMin, xMax, X_BINS);
      const yi = bin(p.y, yMin, yMax, Y_BINS);
      const key = yi * X_BINS + xi;
      if (p.isMev) {
        mevGrid.set(key, (mevGrid.get(key) ?? 0) + 1);
      } else {
        localGrid.set(key, (localGrid.get(key) ?? 0) + 1);
      }
    }

    const toCell = (grid: Map<number, number>): Array<[number, number, number]> =>
      [...grid.entries()].map(([key, count]) => [key % X_BINS, Math.floor(key / X_BINS), count]);

    const allCounts = [...mevGrid.values(), ...localGrid.values()];
    const maxCount = allCounts.length > 0 ? Math.max(...allCounts) : 1;

    return {
      mevCells: toCell(mevGrid),
      localCells: toCell(localGrid),
      maxCount,
      xLabels,
      yLabels,
    } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    const pad = 4;
    const grids = [
      { left: `${pad}%`, top: '10%', width: `${50 - pad * 2}%`, height: '78%', containLabel: false },
      { left: '52%', top: '10%', width: `${50 - pad * 2}%`, height: '78%', containLabel: false },
    ];

    const axisOpts = (idx: number) => ({
      gridIndex: idx,
      type: 'category' as const,
      axisLabel: { fontSize: 8 },
      axisTick: { show: false },
      splitLine: { show: false },
    });

    return {
      title: [
        { text: 'MEV', left: '25%', top: '2%', textAlign: 'center', textStyle: { fontSize: 11, color: t.fg, fontWeight: 'normal' as const } },
        { text: 'Local', left: '75%', top: '2%', textAlign: 'center', textStyle: { fontSize: 11, color: t.fg, fontWeight: 'normal' as const } },
      ],
      grid: grids,
      xAxis: [
        { ...axisOpts(0), data: data.xLabels, name: 'Size' },
        { ...axisOpts(1), data: data.xLabels, name: 'Size' },
      ],
      yAxis: [
        { ...axisOpts(0), data: data.yLabels, name: 'Corrected ms' },
        { ...axisOpts(1), data: data.yLabels, axisLabel: { show: false, fontSize: 8 } },
      ],
      visualMap: {
        type: 'continuous',
        min: 0,
        max: data.maxCount,
        inRange: { color: [t.bg1, t.accent.teal] },
        show: false,
      },
      series: [
        {
          name: 'MEV',
          type: 'heatmap' as const,
          data: data.mevCells,
          xAxisIndex: 0,
          yAxisIndex: 0,
        },
        {
          name: 'Local',
          type: 'heatmap' as const,
          data: data.localCells,
          xAxisIndex: 1,
          yAxisIndex: 1,
        },
      ],
      tooltip: { trigger: 'item' },
    };
  },
});
