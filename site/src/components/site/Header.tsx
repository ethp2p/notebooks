import { Link } from 'react-router';
import { cn } from '@/lib/cn';

export function Header({ className }: { className?: string }) {
  return (
    <header className={cn('flex h-10 items-center gap-6 border-b border-border px-4', className)}>
      <Link to="/" className="font-mono text-lg font-bold tracking-caps text-hi">
        observatory
      </Link>
      <nav className="flex gap-4 text-sm">
        <Link to="/archive" className="text-muted hover:text-fg">archive</Link>
        <Link to="/data"    className="text-muted hover:text-fg">data</Link>
        <Link to="/about"   className="text-muted hover:text-fg">about</Link>
      </nav>
    </header>
  );
}
