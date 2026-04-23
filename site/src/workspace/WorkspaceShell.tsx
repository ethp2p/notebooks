import { Header } from './chrome/Header';
import { Sidebar } from './chrome/Sidebar';
import { CommandPalette } from './chrome/CommandPalette';
import { PaneTree } from './tree/PaneTree';
import { MobileNav } from './chrome/MobileNav';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useWorkspace } from './state/store';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

export function WorkspaceShell() {
  useKeyboardShortcuts();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const sidebarOpen = useWorkspace((s) => s.sidebarOpen);

  return (
    <div className="flex h-screen flex-col">
      <Header />
      <div className="flex flex-1 min-h-0">
        {isMobile ? null : (sidebarOpen ? <Sidebar /> : null)}
        <main className="flex flex-1 min-w-0 flex-col relative">
          {isMobile ? <MobileNav /> : null}
          <PaneTree />
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
