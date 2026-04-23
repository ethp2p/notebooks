import { z } from 'zod';
import type { Table } from 'apache-arrow';
import { defineChart } from '../define';

// Uses the sentry_coverage query (not mempool_events) because coverage per
// sentry requires per-client aggregation that is not in the row-level events
// table. sentry_coverage is defined in observatory/src/queries/mempool_visibility.ts
// and has columns: sentry (string), txs_seen (int), coverage_pct (float).
const DataSchema = z.object({
  sentries: z.array(z.string()),
  coverage: z.array(z.number()),
});

export default defineChart({
  id: 'sentry-coverage-bar',
  topic: 'mempool-visibility',
  title: 'Mempool coverage per sentry (top 15)',
  description:
    'Horizontal bar chart showing the top 15 Xatu sentry nodes by mempool coverage percentage.',
  queries: ['sentry_coverage'] as const,
  related: ['coverage-stacked-bar'],
  context: () =>
    import(
      '../context/mempool_visibility/sentry_coverage_bar.md?raw'
    ) as unknown as Promise<{ default: string }>,
  activeFrom: '2025-12-03',
  activeTo: null,
  order: 9,

  dataSchema: DataSchema,

  transform(raw) {
    const t = raw['sentry_coverage'] as Table | undefined;
    if (!t) return { sentries: [], coverage: [] };

    const sentryCol = t.getChild('sentry')?.toArray() ?? [];
    const covCol = t.getChild('coverage_pct')?.toArray() ?? [];

    const rows: Array<{ sentry: string; coverage: number }> = [];
    for (let i = 0; i < t.numRows; i++) {
      rows.push({
        sentry: String(sentryCol[i] ?? ''),
        coverage: Number(covCol[i] ?? 0),
      });
    }

    // Sort descending, take top 15, then reverse for bottom-to-top horizontal bar
    const top = rows
      .sort((a, b) => b.coverage - a.coverage)
      .slice(0, 15)
      .reverse();

    return {
      sentries: top.map((r) => r.sentry),
      coverage: top.map((r) => r.coverage),
    };
  },

  option(data) {
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: (v: unknown) => `${Number(v).toFixed(2)}%`,
      },
      xAxis: {
        type: 'value',
        name: 'coverage (%)',
        min: 0,
        max: 100,
        axisLabel: { formatter: (v: number) => `${v}%` },
      },
      yAxis: {
        type: 'category',
        data: data.sentries,
        axisLabel: { fontSize: 11, fontFamily: 'Xray Mono, monospace' },
      },
      series: [
        {
          type: 'bar' as const,
          data: data.coverage,
          label: {
            show: true,
            position: 'right' as const,
            formatter: (p: { value: unknown }) => `${Number(p.value).toFixed(1)}%`,
            fontSize: 10,
          },
        },
      ],
    };
  },
});
