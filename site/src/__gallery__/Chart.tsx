import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { ALL_CHARTS } from '@/workspace/charts/index';
import { fetchArrowBundle } from '@/workspace/data/fetcher';
import { renderContext } from '@/workspace/charts/context';
import { PlotRenderer } from '@/workspace/charts/PlotRenderer';
import type { EChartsOption } from 'echarts';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; option: EChartsOption; contextHtml: string };

export default function ChartGallery() {
  const [params] = useSearchParams();
  const id = params.get('id') ?? '';
  const date = params.get('date') ?? '';

  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    setState({ status: 'loading' });

    if (!id) {
      setState({ status: 'error', message: 'Missing ?id= param' });
      return;
    }
    if (!date) {
      setState({ status: 'error', message: 'Missing ?date= param' });
      return;
    }

    const chart = ALL_CHARTS[id as keyof typeof ALL_CHARTS];
    if (!chart) {
      setState({ status: 'error', message: `Unknown chart id: "${id}"` });
      return;
    }

    let cancelled = false;

    (async () => {
      const bundle = await fetchArrowBundle(chart.queries, date);
      const data = chart.transform(bundle);
      const option = chart.option(data, { date, isDark: false });
      const contextHtml = await renderContext(chart.context);
      if (!cancelled) {
        setState({ status: 'ok', option, contextHtml });
      }
    })().catch((err: unknown) => {
      if (!cancelled) {
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [id, date]);

  return (
    <div className="flex h-screen flex-col bg-bg text-fg">
      <header className="border-b border-border px-4 py-2">
        <span className="font-mono text-xs text-muted">
          {id ? `${id} @ ${date}` : 'chart gallery'}
        </span>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        {state.status === 'loading' && (
          <div className="flex flex-1 items-center justify-center">
            <span className="font-mono text-sm text-muted">loading…</span>
          </div>
        )}

        {state.status === 'error' && (
          <div className="flex flex-1 items-center justify-center">
            <span className="font-mono text-sm text-destructive">
              error: {state.message}
            </span>
          </div>
        )}

        {state.status === 'ok' && (
          <>
            <div className="min-h-0 flex-1">
              <PlotRenderer option={state.option} className="h-full w-full" />
            </div>
            {state.contextHtml && (
              <div
                className="border-t border-border px-4 py-3 font-mono text-xs text-muted"
                dangerouslySetInnerHTML={{ __html: state.contextHtml }}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
