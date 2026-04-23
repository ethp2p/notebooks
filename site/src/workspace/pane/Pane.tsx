import { Suspense } from 'react';
import { useWorkspace, findPane } from '@/workspace/state/store';
import { PaneHeader } from './PaneHeader';
import { ChartBody } from './ChartBody';
import { ContextCard } from './ContextCard';
import { PaneTransition } from '@/workspace/motion/PaneTransition';

export function Pane({ paneId }: { paneId: string }) {
  const ws = useWorkspace((s) => s.ws);
  const focus = useWorkspace((s) => s.focus);
  const pane = findPane(ws.root, paneId);
  if (!pane) return null;
  const focused = ws.focusedPaneId === paneId;
  return (
    <PaneTransition focused={focused}>
      <div
        className="flex h-full flex-col bg-bg"
        onMouseDown={() => focus(paneId)}
        role="region"
        aria-label={`pane ${paneId}`}
      >
        <PaneHeader paneId={paneId} chartId={pane.chartId} date={pane.date} focused={focused} />
        <div className="min-h-0 flex-1">
          <Suspense fallback={<div className="p-4 text-xs text-muted">loading chart...</div>}>
            <ChartBody paneId={paneId} chartId={pane.chartId} date={pane.date} />
          </Suspense>
        </div>
        <ContextCard chartId={pane.chartId} />
      </div>
    </PaneTransition>
  );
}
