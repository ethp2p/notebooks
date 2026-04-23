import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const CellSchema = z.tuple([z.number(), z.number(), z.number()]); // [x_bin, y_bin, count]

const FacetSchema = z.object({
  label: z.string(),
  cells: z.array(CellSchema),
  maxCount: z.number(),
});

const DataSchema = z.object({
  facets: z.array(FacetSchema),
  xLabels: z.array(z.string()),
  yLabels: z.array(z.string()),
});

type Data = z.infer<typeof DataSchema>;

const X_BINS = 20;
const Y_BINS = 20;
const MAX_BLOBS = 9;

function bin(value: number, min: number, max: number, bins: number): number {
  if (max <= min) return 0;
  return Math.min(Math.floor(((value - min) / (max - min)) * bins), bins - 1);
}

export default defineChart({
  id: 'bid-timing-density-facets',
  topic: 'mev-pipeline',
  title: 'Bid timing density by blob count',
  description: '2D density heatmap of winning bid vs block arrival latency, one grid per blob count bucket.',
  queries: ['block_events'] as const,
  related: ['bid-timing-density-outliers', 'builder-density-facets'],
  context: () =>
    import(
      '../context/mev_pipeline/bid_timing_density_facets.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 13,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return { facets: [], xLabels: [], yLabels: [] };

    const slotCol = t.getChild('slot');
    const typeCol = t.getChild('event_type');
    const latCol = t.getChild('latency_ms');
    const blobsCol = t.getChild('blob_count');

    const winningMs = new Map<number, number>();
    const arrivalMs = new Map<number, number>();
    const blobBySlot = new Map<number, number>();

    for (let i = 0; i < t.numRows; i++) {
      const s = Number(slotCol?.get(i) ?? 0);
      const evType = String(typeCol?.get(i) ?? '');
      const lat = Number(latCol?.get(i) ?? 0);

      if (evType === 'bid_winning') {
        winningMs.set(s, lat);
      } else if (evType === 'block_arrival') {
        arrivalMs.set(s, lat);
        blobBySlot.set(s, Number(blobsCol?.get(i) ?? 0));
      }
    }

    type Point = { blobBin: number; x: number; y: number };
    const points: Point[] = [];

    for (const [s, w] of winningMs) {
      const a = arrivalMs.get(s);
      if (a == null) continue;
      const blobBin = Math.min(blobBySlot.get(s) ?? 0, MAX_BLOBS);
      points.push({ blobBin, x: w, y: a });
    }

    if (points.length === 0) return { facets: [], xLabels: [], yLabels: [] };

    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);

    const xStep = (xMax - xMin) / X_BINS;
    const yStep = (yMax - yMin) / Y_BINS;
    const xLabels = Array.from({ length: X_BINS }, (_, i) => String(Math.round(xMin + i * xStep)));
    const yLabels = Array.from({ length: Y_BINS }, (_, i) => String(Math.round(yMin + i * yStep)));

    // Find which blob bins have data
    const binsWithData = new Set(points.map((p) => p.blobBin));
    const activeBins = Array.from(binsWithData).sort((a, b) => a - b);

    const facets = activeBins.map((blobBin) => {
      const grid = new Map<number, number>();
      for (const p of points) {
        if (p.blobBin !== blobBin) continue;
        const xi = bin(p.x, xMin, xMax, X_BINS);
        const yi = bin(p.y, yMin, yMax, Y_BINS);
        const key = yi * X_BINS + xi;
        grid.set(key, (grid.get(key) ?? 0) + 1);
      }
      let maxCount = 0;
      const cells: Array<[number, number, number]> = [];
      for (const [key, count] of grid) {
        const xi = key % X_BINS;
        const yi = Math.floor(key / X_BINS);
        cells.push([xi, yi, count]);
        if (count > maxCount) maxCount = count;
      }
      return { label: `${blobBin} blobs`, cells, maxCount };
    });

    return { facets, xLabels, yLabels } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    const n = data.facets.length;
    if (n === 0) return {};

    const cols = 3;
    const rows = Math.ceil(n / cols);
    const pctW = 100 / cols;
    const pctH = 100 / rows;
    const pad = 2;

    const globalMax = Math.max(...data.facets.map((f) => f.maxCount), 1);

    const grids = data.facets.map((_, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      return {
        left: `${col * pctW + pad}%`,
        top: `${row * pctH + pad + 6}%`,
        width: `${pctW - pad * 2}%`,
        height: `${pctH - pad * 2 - 8}%`,
        containLabel: false,
      };
    });

    const xAxes = data.facets.map((_, idx) => ({
      gridIndex: idx,
      type: 'category' as const,
      data: data.xLabels,
      axisLabel: { show: idx >= (rows - 1) * cols, fontSize: 8 },
      axisTick: { show: false },
      splitLine: { show: false },
    }));

    const yAxes = data.facets.map((_, idx) => ({
      gridIndex: idx,
      type: 'category' as const,
      data: data.yLabels,
      axisLabel: { show: idx % cols === 0, fontSize: 8 },
      axisTick: { show: false },
      splitLine: { show: false },
    }));

    const series = data.facets.map((facet, idx) => ({
      type: 'heatmap' as const,
      name: facet.label,
      data: facet.cells,
      xAxisIndex: idx,
      yAxisIndex: idx,
      emphasis: { disabled: true },
    }));

    const titles = data.facets.map((facet, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      return {
        text: facet.label,
        left: `${col * pctW + pctW / 2}%`,
        top: `${row * pctH + pad}%`,
        textAlign: 'center' as const,
        textStyle: { fontSize: 10, color: t.fg, fontWeight: 'normal' as const },
      };
    });

    return {
      title: titles,
      grid: grids,
      xAxis: xAxes,
      yAxis: yAxes,
      visualMap: {
        type: 'continuous',
        min: 0,
        max: globalMax,
        inRange: { color: [t.bg1, t.accent.purple] },
        calculable: false,
        show: false,
      },
      series,
      tooltip: { trigger: 'item' },
    };
  },
});
