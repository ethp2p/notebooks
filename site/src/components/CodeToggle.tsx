import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';

const STORAGE_KEY = 'notebook-show-all-code';

export function CodeToggle() {
  const [checked, setChecked] = useState(false);

  // Effect: Sync State -> DOM
  // This makes the "DOM changes" a side effect of the state changing, which is the React way.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, checked.toString());

    const blocks = document.querySelectorAll('.notebook-content details.code-fold');
    blocks.forEach((block) => {
      if (checked) {
        block.setAttribute('open', '');
      } else {
        block.removeAttribute('open');
      }
    });
  }, [checked]);

  // Effect: Sync DOM (Initial + Manual Toggles) -> State
  useEffect(() => {
    // Initial state from storage
    const savedState = localStorage.getItem(STORAGE_KEY) === 'true';
    if (savedState) setChecked(true);

    // Listen for manual toggles on individual details elements
    // (Use 'capture' because toggle events don't bubble)
    const handleManualToggle = (e: Event) => {
      if ((e.target as HTMLElement)?.closest('.code-fold')) {
        const blocks = document.querySelectorAll('.notebook-content details.code-fold');
        if (blocks.length === 0) return;

        // If every block is open, switch to ON. Otherwise OFF.
        const allOpen = Array.from(blocks).every((block) => block.hasAttribute('open'));
        setChecked(allOpen);
      }
    };

    document.addEventListener('toggle', handleManualToggle, true);
    return () => document.removeEventListener('toggle', handleManualToggle, true);
  }, []);

  return (
    <div className="flex items-center gap-2">
      <Switch id="show-all-code" checked={checked} onCheckedChange={setChecked} className="data-[state=checked]:bg-primary h-4 w-7" size="sm" />
      <label
        htmlFor="show-all-code"
        className="text-muted-foreground hover:text-foreground cursor-pointer font-mono text-[0.6875rem] opacity-60 transition-all duration-150 select-none hover:opacity-100"
      >
        Show all code
      </label>
    </div>
  );
}
