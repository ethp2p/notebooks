import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const X_BINS = 15; // wire size
const Y_BINS = 15; // latency
const MAX_FACETS = 10;

function bin(value: number, min: number, max: number, bins: number): number {
  if (max <= min) return 0;
  return Math.min(Math.floor(((value - min) / (max - min)) * bins), bins - 1);
}

const DataSchema = z.object({
  facets: z.array(
    z.object({
      label: z.string(),
      cells: z.array(z.tuple([z.number(), z.number(), z.number()])),
      maxCount: z.number(),
    }),
  ),
  xLabels: z.array(z.string()),
  yLabels: z.array(z.string()),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'top-entity-density-facets',
  topic: 'block-propagation',
  title: 'Block density facets by top entity',
  description:
    'Grid of 2D density heatmaps (up to 10), one per top entity by slot count, showing wire size vs propagation latency.',
  queries: ['block_events'] as const,
  related: ['entity-percentile-bars', 'corrected-density-by-builder'],
  context: () =>
    import(
      '../context/block_propagation/top_entity_density_facets.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 15,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['block_events'] as Table | undefined;
    if (!t) return { facets: [], xLabels: [], yLabels: [] };

    const typeCol = t.getChild('event_type');
    const sizeCol = t.getChild('wire_size_bytes');
    const latCol = t.getChild('latency_ms');
    const entityCol = t.getChild('entity') ?? t.getChild('builder_pubkey');

    if (!typeCol || !sizeCol || !latCol) return { facets: [], xLabels: [], yLabels: [] };

    type Point = { entity: string; x: number; y: number };
    const points: Point[] = [];
    const entityCounts = new Map<string, number>();

    for (let i = 0; i < t.numRows; i++) {
      const evType = String(typeCol.get(i) ?? '');
      if (evType !== 'block_arrival') continue;

      const x = Number(sizeCol.get(i) ?? 0);
      const y = Number(latCol.get(i) ?? 0);
      const raw_entity = String(entityCol?.get(i) ?? 'unknown');
      const entity = raw_entity.length > 12 ? raw_entity.slice(0, 10) + '..' : raw_entity;
      points.push({ entity, x, y });
      entityCounts.set(entity, (entityCounts.get(entity) ?? 0) + 1);
    }

    const topEntities = [...entityCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_FACETS)
      .map(([e]) => e);

    if (topEntities.length === 0) return { facets: [], xLabels: [], yLabels: [] };

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

    const topSet = new Set(topEntities);
    const facets = topEntities.map((entity) => {
      const grid = new Map<number, number>();
      for (const p of points) {
        if (p.entity !== entity || !topSet.has(p.entity)) continue;
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
      return { label: entity, cells, maxCount };
    });

    return { facets, xLabels, yLabels } satisfies Data;
  },

  option(data) {
    const t = LIGHT_TOKENS;
    const n = data.facets.length;
    if (n === 0) return {};

    // 5-column layout for up to 10 facets
    const COLS = 5;
    const rows = Math.ceil(n / COLS);
    const pctW = 100 / COLS;
    const pctH = 100 / rows;
    const pad = 2;

    const globalMax = Math.max(...data.facets.map((f) => f.maxCount), 1);

    const grids = data.facets.map((_, idx) => {
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
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
      axisLabel: { show: false, fontSize: 8 },
      axisTick: { show: false },
      splitLine: { show: false },
    }));

    const yAxes = data.facets.map((_, idx) => ({
      gridIndex: idx,
      type: 'category' as const,
      data: data.yLabels,
      axisLabel: { show: false, fontSize: 8 },
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
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      return {
        text: facet.label,
        left: `${col * pctW + pctW / 2}%`,
        top: `${row * pctH + pad}%`,
        textAlign: 'center' as const,
        textStyle: { fontSize: 9, color: t.fg, fontWeight: 'normal' as const },
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
        show: false,
      },
      series,
      tooltip: { trigger: 'item' },
    };
  },
});
