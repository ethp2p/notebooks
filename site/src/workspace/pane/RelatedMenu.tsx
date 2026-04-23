import { Link } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useChartModule } from '@/workspace/hooks/useChartModule';
import { useWorkspace } from '@/workspace/state/store';

interface Props {
  paneId: string;
  chartId: string;
}

interface RelatedItemProps {
  relatedId: string;
  onSelect: () => void;
}

function RelatedItem({ relatedId, onSelect }: RelatedItemProps) {
  const chart = useChartModule(relatedId);
  return (
    <button
      className="block w-full px-2 py-1 text-left hover:bg-hover"
      onClick={onSelect}
    >
      {chart?.title ?? relatedId}
    </button>
  );
}

export function RelatedMenu({ paneId, chartId }: Props) {
  const chart = useChartModule(chartId);
  const focus = useWorkspace((s) => s.focus);
  const splitFocused = useWorkspace((s) => s.splitFocused);

  const related = chart?.related ?? [];
  if (related.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Related charts">
          <Link className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 font-mono text-sm">
        {related.map((id) => (
          <RelatedItem
            key={id}
            relatedId={id}
            onSelect={() => {
              focus(paneId);
              splitFocused('h', 'after', id);
            }}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}
