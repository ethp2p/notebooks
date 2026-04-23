import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const cb = (e: MediaQueryListEvent) => setMatches(e.matches);
    m.addEventListener('change', cb);
    setMatches(m.matches);
    return () => m.removeEventListener('change', cb);
  }, [query]);
  return matches;
}
