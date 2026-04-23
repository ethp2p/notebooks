import { useEffect } from 'react';
import { useWorkspace } from '@/workspace/state/store';
import { saveAs } from '@/workspace/state/saves';

export function useKeyboardShortcuts(): void {
  const openCmdk      = useWorkspace((s) => s.openCmdk);
  const toggleSidebar = useWorkspace((s) => s.toggleSidebar);
  const splitFocused  = useWorkspace((s) => s.splitFocused);
  const closeFocused  = useWorkspace((s) => s.closeFocused);
  const focusDirection = useWorkspace((s) => s.focusDirection);
  const ws            = useWorkspace((s) => s.ws);
  const setDateInFocused = useWorkspace((s) => s.setDateInFocused);

  useEffect(() => {
    function handler(e: KeyboardEvent): void {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Cmd+K: open command palette
      if (e.key === 'k' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        openCmdk();
        return;
      }

      // Cmd+B: toggle sidebar
      if (e.key === 'b' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Cmd+\: split horizontal (side by side)
      if (e.key === '\\' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        splitFocused('h', 'after');
        return;
      }

      // Cmd+Shift+\: split vertical (top/bottom)
      if (e.key === '\\' && e.shiftKey && !e.altKey) {
        e.preventDefault();
        splitFocused('v', 'after');
        return;
      }

      // Cmd+W: close focused pane (prevent browser close)
      if (e.key === 'w' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        closeFocused();
        return;
      }

      // Cmd+Shift+S: save workspace
      if (e.key === 'S' && e.shiftKey && !e.altKey) {
        e.preventDefault();
        const name = window.prompt('Save workspace as:');
        if (name && name.trim()) {
          saveAs(name.trim(), ws);
        }
        return;
      }

      // Cmd+[: previous date
      if (e.key === '[' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        navigateDate('prev');
        return;
      }

      // Cmd+]: next date
      if (e.key === ']' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        navigateDate('next');
        return;
      }

      // Cmd+Alt+Arrow: focus direction
      if (e.altKey && !e.shiftKey) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          focusDirection('prev');
          return;
        }
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          focusDirection('next');
          return;
        }
      }
    }

    function navigateDate(dir: 'prev' | 'next'): void {
      const current = ws.defaultDate;
      if (!current) return;
      // Load dates asynchronously to find prev/next.
      import('@/workspace/data/dates')
        .then(({ loadDates }) => loadDates())
        .then(({ dates }) => {
          const idx = dates.indexOf(current);
          if (idx < 0) return;
          const next = dir === 'prev' ? dates[idx - 1] : dates[idx + 1];
          if (next) setDateInFocused(next);
        })
        .catch(() => undefined);
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openCmdk, toggleSidebar, splitFocused, closeFocused, focusDirection, ws, setDateInFocused]);
}
