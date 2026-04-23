import { Link } from 'react-router';
import { Menu, Moon, Sun, Share2, Save, Command } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/workspace/state/store';
import { saveAs } from '@/workspace/state/saves';
import type { Theme } from '@/workspace/state/store';

export function Header() {
  const toggleSidebar = useWorkspace((s) => s.toggleSidebar);
  const openCmdk      = useWorkspace((s) => s.openCmdk);
  const theme         = useWorkspace((s) => s.theme);
  const setTheme      = useWorkspace((s) => s.setTheme);
  const toUrl         = useWorkspace((s) => s.toUrl);
  const ws            = useWorkspace((s) => s.ws);

  function handleShare() {
    const url = `${window.location.origin}/w/${toUrl()}`;
    void navigator.clipboard.writeText(url).catch(() => undefined);
  }

  function handleSave() {
    const name = window.prompt('Save workspace as:');
    if (name && name.trim()) {
      saveAs(name.trim(), ws);
    }
  }

  function handleThemeToggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  }

  return (
    <header className="flex h-10 shrink-0 items-center border-b border-border bg-bg px-3 gap-2">
      <Link
        to="/"
        className="font-mono text-sm font-bold tracking-caps text-hi hover:text-fg mr-auto"
      >
        observatory
      </Link>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={handleSave}
        title="save workspace (Cmd+Shift+S)"
      >
        <Save size={14} />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={handleShare}
        title="copy shareable URL"
      >
        <Share2 size={14} />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={handleThemeToggle}
        title="toggle theme"
      >
        {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={toggleSidebar}
        title="toggle sidebar (Cmd+B)"
      >
        <Menu size={14} />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={openCmdk}
        title="command palette (Cmd+K)"
      >
        <Command size={14} />
      </Button>
    </header>
  );
}
