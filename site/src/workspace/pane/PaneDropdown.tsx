import { List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ALL_CHARTS } from '@/workspace/charts/index';
import type { ChartDef } from '@/workspace/charts/types';
import { sortedTopics } from '@/workspace/charts/topics';
import { useWorkspace } from '@/workspace/state/store';

interface Props {
  paneId: string;
}

const allChartList = Object.values(ALL_CHARTS as Record<string, ChartDef>);

function chartsByTopic(topicId: string): ChartDef[] {
  return allChartList
    .filter((c) => c.topic === topicId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function PaneDropdown({ paneId }: Props) {
  const focus = useWorkspace((s) => s.focus);
  const replaceChartInFocused = useWorkspace((s) => s.replaceChartInFocused);
  const topics = sortedTopics();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Switch chart">
          <List className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-96 overflow-auto">
        {topics.map((topic) => {
          const charts = chartsByTopic(topic.id);
          if (charts.length === 0) return null;
          return (
            <DropdownMenuGroup key={topic.id}>
              <DropdownMenuLabel>{topic.title}</DropdownMenuLabel>
              {charts.map((chart) => (
                <DropdownMenuItem
                  key={chart.id}
                  onSelect={() => {
                    focus(paneId);
                    replaceChartInFocused(chart.id);
                  }}
                >
                  {chart.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
