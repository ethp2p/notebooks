import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/workspace/state/store';
import { useChartModule } from '@/workspace/hooks/useChartModule';
import { DatePicker } from './DatePicker';
import { PaneDropdown } from './PaneDropdown';
import { RelatedMenu } from './RelatedMenu';

interface Props {
  paneId: string;
  chartId: string;
  date: string;
  focused: boolean;
}

export function PaneHeader({ paneId, chartId, date, focused }: Props) {
  const chart = useChartModule(chartId);
  const focus = useWorkspace((s) => s.focus);
  const closeFocused = useWorkspace((s) => s.closeFocused);

  return (
    <div
      className={`flex h-8 items-center gap-2 border-b border-border px-2 font-mono text-sm${focused ? ' ring-1 ring-fg' : ''}`}
    >
      <span className="truncate flex-shrink text-fg">
        {chart?.title ?? chartId}
      </span>
      <span className="flex-1" />
      <DatePicker date={date} paneId={paneId} />
      <PaneDropdown paneId={paneId} />
      <RelatedMenu paneId={paneId} chartId={chartId} />
      <Button
        variant="ghost"
        size="icon"
        aria-label="Close pane"
        onClick={() => {
          focus(paneId);
          closeFocused();
        }}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
