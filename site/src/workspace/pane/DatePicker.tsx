import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { loadDates } from '@/workspace/data/dates';
import { useWorkspace } from '@/workspace/state/store';

interface Props {
  date: string;
  paneId: string;
}

export function DatePicker({ date, paneId }: Props) {
  const [dates, setDates] = useState<string[]>([]);
  const focus = useWorkspace((s) => s.focus);
  const setDateInFocused = useWorkspace((s) => s.setDateInFocused);

  useEffect(() => {
    loadDates().then((d) => setDates(d.dates));
  }, []);

  const idx = dates.indexOf(date);
  const prev = idx > 0 ? dates[idx - 1] : null;
  const next = idx >= 0 && idx < dates.length - 1 ? dates[idx + 1] : null;

  function setDate(d: string) {
    focus(paneId);
    setDateInFocused(d);
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        disabled={!prev}
        onClick={() => prev && setDate(prev)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="h-8 px-2 font-mono text-sm">
            {date || '\u2014'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="max-h-64 overflow-auto p-0 font-mono text-sm">
          {dates.map((d) => (
            <button
              key={d}
              className="block w-full px-2 py-1 text-left hover:bg-hover"
              onClick={() => setDate(d)}
            >
              {d}
            </button>
          ))}
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="icon"
        disabled={!next}
        onClick={() => next && setDate(next)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
