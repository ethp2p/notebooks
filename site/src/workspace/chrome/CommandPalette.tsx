import { useState, useMemo, useEffect } from 'react';
import uFuzzy from '@leeoniya/ufuzzy';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { ALL_CHARTS } from '@/workspace/charts/index';
import type { ChartDef } from '@/workspace/charts/types';
import { useWorkspace } from '@/workspace/state/store';
import { listSaves, loadSave } from '@/workspace/state/saves';

const fuzzy = new uFuzzy({});

export function CommandPalette() {
  const open = useWorkspace((s) => s.cmdkOpen);
  const close = useWorkspace((s) => s.closeCmdk);
  const replace = useWorkspace((s) => s.replaceChartInFocused);
  const split = useWorkspace((s) => s.splitFocused);
  const toggleSidebar = useWorkspace((s) => s.toggleSidebar);
  const setTheme = useWorkspace((s) => s.setTheme);
  const theme = useWorkspace((s) => s.theme);
  const setWorkspace = useWorkspace((s) => s.setWorkspace);

  const [query, setQuery] = useState('');

  const charts = useMemo(() => Object.values(ALL_CHARTS) as ChartDef[], []);

  const haystack = useMemo(
    () => charts.map((c) => `${c.title} ${c.description} ${c.topic}`.toLowerCase()),
    [charts],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return charts;
    const result = fuzzy.search(haystack, q);
    const idxs = result[0];
    if (!idxs) return charts;
    return idxs.map((i) => charts[i]).filter((c): c is ChartDef => c != null);
  }, [query, charts, haystack]);

  const [saves, setSaves] = useState(() => listSaves());

  useEffect(() => {
    if (open) setSaves(listSaves());
  }, [open]);

  function handleChart(id: string, modifier: 'default' | 'split-v' | 'split-h') {
    if (modifier === 'default') {
      replace(id);
    } else if (modifier === 'split-v') {
      split('v', 'after', id);
    } else {
      split('h', 'after', id);
    }
    close();
  }

  return (
    <CommandDialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <CommandInput
        placeholder="search charts, actions, saves..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>no results</CommandEmpty>
        <CommandGroup heading="charts">
          {filtered.slice(0, 50).map((c) => (
            <CommandItem
              key={c.id}
              value={c.id}
              onSelect={() => handleChart(c.id, 'default')}
            >
              {c.title}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="actions">
          <CommandItem onSelect={() => { toggleSidebar(); close(); }}>
            toggle sidebar
          </CommandItem>
          <CommandItem onSelect={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); close(); }}>
            toggle theme
          </CommandItem>
        </CommandGroup>
        {saves.length > 0 && (
          <CommandGroup heading="saved layouts">
            {saves.map((s) => (
              <CommandItem
                key={s.name}
                onSelect={() => {
                  const saved = loadSave(s.name);
                  if (saved) setWorkspace(saved.state);
                  close();
                }}
              >
                {s.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
