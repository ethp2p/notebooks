import { useEffect, useState } from 'react';
import { fetchArrowBundle, FetchError } from '@/workspace/data/fetcher';
import { useWorkspace } from '@/workspace/state/store';
import { useChartModule } from '@/workspace/hooks/useChartModule';
import { PlotRenderer } from '@/workspace/charts/PlotRenderer';
import type { EChartsOption } from 'echarts';

type Status = 'loading' | 'ready' | 'missing' | 'error' | 'out-of-range' | 'unknown';

interface Props {
  paneId: string;
  chartId: string;
  date: string;
}

export function ChartBody({ paneId: _paneId, chartId, date }: Props) {
  const theme = useWorkspace((s) => s.theme);
  const chart = useChartModule(chartId);
  const [status, setStatus] = useState<Status>('loading');
  const [option, setOption] = useState<EChartsOption | null>(null);

  useEffect(() => {
    if (!chart) {
      setStatus('unknown');
      return;
    }

    if (date < chart.activeFrom || (chart.activeTo !== null && date > chart.activeTo)) {
      setStatus('out-of-range');
      return;
    }

    setStatus('loading');
    setOption(null);

    let cancelled = false;

    fetchArrowBundle(chart.queries, date)
      .then((bundle) => {
        if (cancelled) return;
        const data = chart.transform(bundle);
        const parsed = chart.dataSchema.parse(data);
        const opt = chart.option(parsed, { date, isDark: theme === 'dark' });
        setOption(opt);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof FetchError && err.status === 404) {
          setStatus('missing');
        } else {
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chart, chartId, date, theme]);

  if (status === 'unknown') {
    return (
      <div className="p-4 text-xs text-muted">unknown chart: {chartId}</div>
    );
  }

  if (status === 'out-of-range') {
    return (
      <div className="p-4 text-xs text-muted">chart not available for {date}</div>
    );
  }

  if (status === 'missing') {
    return (
      <div className="p-4 text-xs text-muted">no data for {date}</div>
    );
  }

  if (status === 'error') {
    return (
      <div className="p-4 text-xs text-destructive">failed to load</div>
    );
  }

  if (status === 'loading' || option === null) {
    return (
      <div className="p-4 text-xs text-muted">loading...</div>
    );
  }

  return <PlotRenderer option={option} />;
}
