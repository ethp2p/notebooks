import { z } from 'zod';
import { defineChart } from '../define';
import { LIGHT_TOKENS } from '../theme';

const REGIONS = ['EU', 'NA', 'AS', 'OC'] as const;
type Region = (typeof REGIONS)[number];

const RowSchema = z.object({
  region: z.string(),
  source: z.enum(['sentry', 'contributoor']),
  median_ms: z.number(),
  count: z.number().int().nonnegative(),
});

const DataSchema = z.object({
  regions: z.array(z.string()),
  sentry: z.array(z.number()),
  contributoor: z.array(z.number()),
});

type Data = z.infer<typeof DataSchema>;

export default defineChart({
  id: 'region-winner-grouped-bar',
  topic: 'block-propagation',
  title: 'Median block propagation latency by region',
  description:
    'Median block propagation latency per region, split by observation source (sentry vs contributoor).',
  queries: ['region_size_matrix'] as const,
  related: [],
  context: () =>
    import(
      '../context/block_propagation/region_winner.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 11,

  dataSchema: DataSchema,

  transform(raw) {
    // Aggregate across all size buckets: weighted median approximated as the
    // mean of per-row medians weighted by count.
    const byRegion = new Map<Region, { sentry: number; contributoor: number }>();

    for (const region of REGIONS) {
      byRegion.set(region, { sentry: 0, contributoor: 0 });
    }

    // Group rows by (region, source) and compute count-weighted average of median_ms.
    type Acc = { weightedSum: number; totalCount: number };
    const acc = new Map<string, Acc>();

    const table = raw['region_size_matrix'];
    if (!table) {
      return { regions: [...REGIONS], sentry: REGIONS.map(() => 0), contributoor: REGIONS.map(() => 0) };
    }

    for (let i = 0; i < table.numRows; i++) {
      const rowRaw = table.get(i);
      if (!rowRaw) continue;

      const parsed = RowSchema.safeParse(rowRaw.toJSON?.() ?? rowRaw);
      if (!parsed.success) continue;
      const row = parsed.data;

      const key = `${row.region}:${row.source}`;
      const existing = acc.get(key) ?? { weightedSum: 0, totalCount: 0 };
      existing.weightedSum += row.median_ms * row.count;
      existing.totalCount += row.count;
      acc.set(key, existing);
    }

    for (const region of REGIONS) {
      const entry = byRegion.get(region) ?? { sentry: 0, contributoor: 0 };

      const sentryAcc = acc.get(`${region}:sentry`);
      if (sentryAcc && sentryAcc.totalCount > 0) {
        entry.sentry = sentryAcc.weightedSum / sentryAcc.totalCount;
      }

      const contributoorAcc = acc.get(`${region}:contributoor`);
      if (contributoorAcc && contributoorAcc.totalCount > 0) {
        entry.contributoor = contributoorAcc.weightedSum / contributoorAcc.totalCount;
      }

      byRegion.set(region, entry);
    }

    return {
      regions: [...REGIONS],
      sentry: REGIONS.map((r) => byRegion.get(r)?.sentry ?? 0),
      contributoor: REGIONS.map((r) => byRegion.get(r)?.contributoor ?? 0),
    } satisfies Data;
  },

  option(data, _ctx) {
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: ['Sentry', 'Contributoor'] },
      xAxis: { type: 'category', data: data.regions },
      yAxis: {
        type: 'value',
        name: 'Median latency (ms)',
      },
      series: [
        {
          name: 'Sentry',
          type: 'bar',
          data: data.sentry,
          itemStyle: { color: LIGHT_TOKENS.accent.teal },
        },
        {
          name: 'Contributoor',
          type: 'bar',
          data: data.contributoor,
          itemStyle: { color: LIGHT_TOKENS.accent.purple },
        },
      ],
    };
  },
});
