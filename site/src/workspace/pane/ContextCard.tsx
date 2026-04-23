import { useEffect, useState } from 'react';
import { useChartModule } from '@/workspace/hooks/useChartModule';
import { renderContext } from '@/workspace/charts/context';

interface Props {
  chartId: string;
}

export function ContextCard({ chartId }: Props) {
  const chart = useChartModule(chartId);
  const [html, setHtml] = useState('');

  useEffect(() => {
    if (!chart?.context) {
      setHtml('');
      return;
    }
    renderContext(chart.context).then(setHtml).catch(() => setHtml(''));
  }, [chart]);

  if (!html) return null;

  return (
    <div
      className="border-t border-border p-3 font-sans text-sm text-fg prose"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
