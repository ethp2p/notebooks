import React from 'react';
import { cn } from '@/lib/utils';
import { FileText, Calendar } from 'lucide-react';

// Helper to convert YYYY-MM-DD to YYYYMMDD
const toCompactDate = (iso: string) => iso.replace(/-/g, '');

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
};

interface Notebook {
  id: string;
  title: string;
  description: string;
  icon?: string;
  order: number;
}

interface SidebarListProps {
  notebooks: Notebook[];
  latestDate: string;
  historicalDates: string[];
  currentPath: string;
  base: string;
}

export function SidebarList({ notebooks, latestDate, historicalDates, currentPath, base }: SidebarListProps) {
  return (
    <nav className="flex flex-col gap-5">
      {/* Latest Section */}
      <div className="flex flex-col gap-1">
        <div className="mb-0.5 flex items-center justify-between px-2">
          <span className="text-muted-foreground text-[0.625rem] font-semibold tracking-wide uppercase">Latest</span>
          <span className="bg-muted text-muted-foreground flex items-center gap-1 px-1.5 py-0.5 text-[0.5625rem] font-medium">
            <span className="bg-accent h-1 w-1 animate-pulse"></span>
            {formatDate(latestDate)}
          </span>
        </div>
        <ul className="m-0 flex list-none flex-col p-0">
          {notebooks.map((nb) => {
            const href = `${base}notebooks/${nb.id}`;
            const isActive = currentPath.includes(`/notebooks/${nb.id}`);
            return (
              <li key={nb.id}>
                <a
                  href={href}
                  className={cn(
                    'group text-muted-foreground relative flex items-center gap-2 px-2 py-1.5 text-[0.8125rem] no-underline transition-all duration-200',
                    "before:bg-primary before:absolute before:top-1/2 before:left-0 before:h-0 before:w-[2px] before:-translate-y-1/2 before:transition-all before:duration-200 before:content-['']",
                    'hover:text-foreground hover:bg-muted hover:before:h-1/2',
                    isActive ? 'text-foreground bg-[var(--mauve-4)] font-medium before:!h-[60%]' : '',
                  )}
                  title={nb.description}
                >
                  <span className="group-hover:text-primary group-[.active]:text-primary flex shrink-0 items-center justify-center opacity-50 transition-all duration-200 group-hover:opacity-100 group-[.active]:opacity-100">
                    <FileText size={12} />
                  </span>
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{nb.title}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Previous Snapshots Section */}
      {historicalDates.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="mb-0.5 flex items-center justify-between px-2">
            <span className="text-muted-foreground text-[0.625rem] font-semibold tracking-wide uppercase">Previous</span>
            <span className="text-muted-foreground text-[0.5625rem] font-normal opacity-70">{historicalDates.length} dates</span>
          </div>
          <ul className="m-0 flex list-none flex-col p-0">
            {historicalDates.slice(0, 7).map((date) => {
              const compactDate = toCompactDate(date);
              const href = `${base}${compactDate}`;
              const isActive = currentPath.startsWith(`/${compactDate}`);
              return (
                <li key={date}>
                  <a
                    href={href}
                    className={cn(
                      'group text-muted-foreground relative flex items-center gap-2 px-2 py-1.5 text-[0.8125rem] no-underline transition-all duration-200',
                      "before:bg-primary before:absolute before:top-1/2 before:left-0 before:h-0 before:w-[2px] before:-translate-y-1/2 before:transition-all before:duration-200 before:content-['']",
                      'hover:text-foreground hover:bg-muted hover:before:h-1/2',
                      isActive ? 'text-foreground bg-[var(--mauve-4)] font-medium before:!h-[60%]' : '',
                    )}
                  >
                    <span className="group-hover:text-primary flex shrink-0 items-center justify-center opacity-50 transition-all duration-200 group-hover:opacity-100">
                      <Calendar size={12} />
                    </span>
                    <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{formatDate(date)}</span>
                    <span className="text-muted-foreground bg-muted px-1 py-0.5 text-[0.5625rem] font-normal opacity-60">{date.slice(0, 4)}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </nav>
  );
}
