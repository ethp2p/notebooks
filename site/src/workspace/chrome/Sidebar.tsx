import { useMemo, useState, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ALL_CHARTS } from '@/workspace/charts/index';
import { sortedTopics } from '@/workspace/charts/topics';
import type { ChartDef } from '@/workspace/charts/types';
import { useWorkspace, findPane } from '@/workspace/state/store';
import { cn } from '@/lib/cn';

type Row =
  | { kind: 'header'; topic: string; title: string }
  | { kind: 'chart'; chart: ChartDef; inRange: boolean };

export function Sidebar() {
  const [query, setQuery] = useState('');
  const [activeTopics, setActiveTopics] = useState<Set<string>>(new Set());
  const ws = useWorkspace((s) => s.ws);
  const focused = ws.focusedPaneId ? findPane(ws.root, ws.focusedPaneId) : null;
  const focusDate = focused?.date ?? ws.defaultDate;

  const replaceChart = useWorkspace((s) => s.replaceChartInFocused);
  const splitFocused = useWorkspace((s) => s.splitFocused);

  const topics = sortedTopics();

  const rows: Row[] = useMemo(() => {
    const q = query.toLowerCase().trim();
    const out: Row[] = [];
    const allCharts = Object.values(ALL_CHARTS) as ChartDef[];
    for (const topic of topics) {
      if (activeTopics.size > 0 && !activeTopics.has(topic.id)) continue;
      const topicCharts = allCharts.filter((c) => c.topic === topic.id);
      const filtered = q
        ? topicCharts.filter(
            (c) =>
              c.title.toLowerCase().includes(q) ||
              c.description.toLowerCase().includes(q),
          )
        : topicCharts;
      if (filtered.length === 0) continue;
      out.push({ kind: 'header', topic: topic.id, title: topic.title });
      for (const c of filtered) {
        const inRange =
          focusDate >= c.activeFrom && (c.activeTo === null || focusDate <= c.activeTo);
        out.push({ kind: 'chart', chart: c, inRange });
      }
    }
    return out;
  }, [query, activeTopics, topics, focusDate]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 20,
  });

  function onChartClick(e: React.MouseEvent, id: string) {
    if (!ws.focusedPaneId) return;
    if (e.shiftKey) splitFocused('v', 'after', id);
    else if (e.altKey) splitFocused('h', 'after', id);
    else replaceChart(id);
  }

  function toggleTopic(id: string) {
    setActiveTopics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <TooltipProvider>
      <aside className="flex w-72 flex-col border-r border-border bg-bg">
        <div className="border-b border-border p-2">
          <Input
            placeholder="search charts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 font-mono text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-1 border-b border-border p-2">
          {topics.map((t) => {
            const active = activeTopics.has(t.id);
            return (
              <Badge
                key={t.id}
                variant="outline"
                className={cn(
                  'cursor-pointer font-mono text-xs uppercase tracking-caps',
                  active && 'border-sel-border bg-sel-bg',
                )}
                onClick={() => toggleTopic(t.id)}
              >
                {t.title}
              </Badge>
            );
          })}
        </div>
        <div ref={parentRef} className="flex-1 overflow-auto">
          <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
            {virt.getVirtualItems().map((vi) => {
              const r = rows[vi.index];
              if (!r) return null;
              if (r.kind === 'header') {
                return (
                  <div
                    key={vi.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      transform: `translateY(${vi.start}px)`,
                      height: vi.size,
                    }}
                    className="px-3 py-1 text-xs uppercase tracking-caps text-muted"
                  >
                    {r.title}
                  </div>
                );
              }
              const c = r.chart;
              const button = (
                <button
                  onClick={(e) => onChartClick(e, c.id)}
                  className={cn(
                    'block w-full truncate px-3 py-1 text-left text-sm font-mono hover:bg-hover',
                    !r.inRange && 'opacity-60',
                  )}
                >
                  {c.title}
                </button>
              );
              return (
                <div
                  key={vi.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${vi.start}px)`,
                    height: vi.size,
                  }}
                >
                  {r.inRange ? (
                    button
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>{button}</TooltipTrigger>
                      <TooltipContent>not available for {focusDate}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
