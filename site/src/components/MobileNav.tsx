import React, { useState } from 'react';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { PanelLeft, List, X } from 'lucide-react';
import { SidebarList } from './ui/SidebarList';
import { cn } from '@/lib/utils';

interface Heading {
  slug: string;
  text: string;
  depth: number;
}

interface Notebook {
  id: string;
  title: string;
  description: string;
  icon?: string;
  order: number;
}

interface MobileNavProps {
  headings: Heading[];
  notebooks: Notebook[];
  latestDate: string;
  historicalDates: string[];
  currentPath: string;
  base: string;
}

export function MobileNav({ headings, notebooks, latestDate, historicalDates, currentPath, base }: MobileNavProps) {
  const [openMenu, setOpenMenu] = useState(false);
  const [openToc, setOpenToc] = useState(false);

  return (
    <>
      {/* Menu Button (Bottom Left) */}
      <div className="fixed bottom-6 left-4 z-[60] lg:hidden">
        <Sheet open={openMenu} onOpenChange={setOpenMenu}>
          <SheetTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="border-border/50 bg-background/80 hover:bg-background h-10 w-10 rounded-none shadow-sm backdrop-blur-sm hover:shadow-md"
              />
            }
          >
            <PanelLeft size={18} />
            <span className="sr-only">Open menu</span>
          </SheetTrigger>
          <SheetContent side="left" className="border-sidebar-border bg-sidebar w-72 max-w-[85vw] gap-0 border-r p-0">
            {/* Header */}
            <div className="border-sidebar-border flex items-center justify-between border-b p-4">
              <a href={base} className="flex items-center gap-2.5 no-underline">
                <span className="bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M12 1L3 12l9 5 9-5L12 1z" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    <path d="M12 17l-9-5 9 11 9-11-9 5z" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    <path d="M12 1v16" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
                  </svg>
                </span>
                <span className="flex flex-col leading-none">
                  <span className="text-foreground font-mono text-[0.75rem] font-bold tracking-wide">ETH P2P</span>
                  <span className="text-muted-foreground font-serif text-[0.75rem]">Notebooks</span>
                </span>
              </a>
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <SheetDescription className="sr-only">Main site navigation</SheetDescription>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <SidebarList notebooks={notebooks} latestDate={latestDate} historicalDates={historicalDates} currentPath={currentPath} base={base} />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* TOC Button (Bottom Right) */}
      {headings.length > 0 && (
        <div className="fixed right-4 bottom-6 z-[60] lg:top-6 lg:right-6 lg:bottom-auto xl:hidden">
          <Sheet open={openToc} onOpenChange={setOpenToc}>
            <SheetTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  className="border-border/50 bg-background/80 hover:bg-background h-10 w-10 rounded-none shadow-sm backdrop-blur-sm hover:shadow-md"
                />
              }
            >
              <List size={18} />
              <span className="sr-only">Table of contents</span>
            </SheetTrigger>
            {/* TOC Sheet - Using a custom approach to match the "floating bubble" look if possible, or just standard sheet */}
            <SheetContent side="right" className="shadow-2xl w-80 max-w-[calc(100vw-2rem)] border-none p-0 sm:max-w-xs">
              <div className="flex h-full flex-col">
                <div className="flex shrink-0 items-center justify-between p-3">
                  <div className="text-muted-foreground flex items-center gap-1.5">
                    <List size={12} />
                    <span className="text-[0.625rem] font-semibold tracking-wide uppercase">On this page</span>
                  </div>
                  <SheetTitle className="sr-only">Table of Contents</SheetTitle>
                  <SheetDescription className="sr-only">Page section navigation</SheetDescription>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  <ul className="m-0 flex list-none flex-col p-0">
                    {headings.map((heading) => (
                      <li key={heading.slug} className={cn('m-0', heading.depth === 3 ? 'pl-3' : '')}>
                        <a
                          href={`#${heading.slug}`}
                          onClick={() => setOpenToc(false)}
                          className="toc-link text-muted-foreground hover:text-foreground hover:bg-muted block px-2 py-1.5 text-[0.8125rem] leading-snug no-underline transition-all duration-200"
                        >
                          {heading.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      )}
    </>
  );
}
