import { useWorkspace, findPane } from '@/workspace/state/store';
import { ALL_CHARTS } from '@/workspace/charts/index';
import type { Node } from '@/workspace/state/types';
import { isPane } from '@/workspace/state/types';
import { cn } from '@/lib/cn';

function collectLeafIds(n: Node | null): string[] {
  if (!n) return [];
  if (isPane(n)) return [n.id];
  return [...collectLeafIds(n.a), ...collectLeafIds(n.b)];
}

export function MobileNav() {
  const ws     = useWorkspace((s) => s.ws);
  const focus  = useWorkspace((s) => s.focus);
  const leafIds = collectLeafIds(ws.root);

  if (leafIds.length === 0) return null;

  return (
    <div className="flex h-9 shrink-0 overflow-x-auto border-b border-border bg-bg">
      {leafIds.map((id) => {
        const pane = findPane(ws.root, id);
        const chartTitle = pane ? (ALL_CHARTS[pane.chartId]?.title ?? pane.chartId) : id;
        const active = ws.focusedPaneId === id;
        return (
          <button
            key={id}
            onClick={() => focus(id)}
            className={cn(
              'shrink-0 whitespace-nowrap px-3 font-mono text-xs border-b-2',
              active
                ? 'border-sel-border text-hi'
                : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {chartTitle}
          </button>
        );
      })}
    </div>
  );
}
