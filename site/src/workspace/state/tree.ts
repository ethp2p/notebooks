import { isPane, isSplit, type Node, type Pane, type Split } from './types';

let idCounter = 0;
export function newId(prefix: 'p' | 's'): string {
  return `${prefix}${Date.now().toString(36)}${(idCounter++).toString(36)}`;
}

export function makePane(init: Partial<Pane> & { chartId: string; date: string }): Pane {
  return {
    kind: 'pane',
    id: init.id ?? newId('p'),
    chartId: init.chartId,
    date: init.date,
  };
}

export function makeSplit(init: Omit<Split, 'kind'>): Split {
  return { kind: 'split', ...init };
}

export function findPane(n: Node | null, id: string): Pane | null {
  if (!n) return null;
  if (isPane(n)) return n.id === id ? n : null;
  return findPane(n.a, id) ?? findPane(n.b, id);
}

function mapPanes(n: Node, f: (p: Pane) => Pane): Node {
  if (isPane(n)) return f(n);
  return { ...n, a: mapPanes(n.a, f), b: mapPanes(n.b, f) };
}

export function setPaneChart(n: Node, paneId: string, chartId: string): Node {
  return mapPanes(n, (p) => (p.id === paneId ? { ...p, chartId } : p));
}

export function setPaneDate(n: Node, paneId: string, date: string): Node {
  return mapPanes(n, (p) => (p.id === paneId ? { ...p, date } : p));
}

export function setRatio(n: Node, splitId: string, ratio: number): Node {
  if (isPane(n)) return n;
  const clamped = Math.max(0.1, Math.min(0.9, ratio));
  if (n.id === splitId) return { ...n, ratio: clamped };
  return { ...n, a: setRatio(n.a, splitId, ratio), b: setRatio(n.b, splitId, ratio) };
}

export type SplitOrientation = 'h' | 'v';
export type SplitPosition = 'before' | 'after';

export function splitPane(
  n: Node,
  paneId: string,
  orientation: SplitOrientation,
  position: SplitPosition,
  newPane?: Partial<Pane> & { chartId?: string },
): Node {
  if (isPane(n)) {
    if (n.id !== paneId) return n;
    const created = makePane({
      id: newPane?.id,
      chartId: newPane?.chartId ?? n.chartId,
      date: newPane?.date ?? n.date,
    });
    return makeSplit({
      id: newId('s'),
      orientation,
      ratio: 0.5,
      a: position === 'after' ? n : created,
      b: position === 'after' ? created : n,
    });
  }
  return {
    ...n,
    a: splitPane(n.a, paneId, orientation, position, newPane),
    b: splitPane(n.b, paneId, orientation, position, newPane),
  };
}

export function closePane(n: Node, paneId: string): Node | null {
  if (isPane(n)) return n.id === paneId ? null : n;
  if (isPane(n.a) && n.a.id === paneId) return n.b;
  if (isPane(n.b) && n.b.id === paneId) return n.a;
  const a = closePane(n.a, paneId);
  const b = closePane(n.b, paneId);
  if (a === null) return b;
  if (b === null) return a;
  return { ...n, a, b };
}

export function swapPanes(n: Node, idA: string, idB: string): Node {
  const paneA = findPane(n, idA);
  const paneB = findPane(n, idB);
  if (!paneA || !paneB) return n;
  // Swap chart assignments; pane ids stay in place.
  return mapPanes(n, (p) => {
    if (p.id === idA) return { ...p, chartId: paneB.chartId, date: paneB.date };
    if (p.id === idB) return { ...p, chartId: paneA.chartId, date: paneA.date };
    return p;
  });
}

function leafSequence(n: Node, out: string[] = []): string[] {
  if (isPane(n)) out.push(n.id);
  else { leafSequence(n.a, out); leafSequence(n.b, out); }
  return out;
}

export function focusNeighbor(n: Node, currentId: string, dir: 'next' | 'prev'): string | null {
  const leaves = leafSequence(n);
  const i = leaves.indexOf(currentId);
  if (i < 0) return null;
  const j = dir === 'next' ? i + 1 : i - 1;
  return leaves[j] ?? null;
}

// Structural equality: same tree shape, same chartIds and dates; ignores ids.
// Used by tests that need to compare round-tripped states where ids are regenerated.
export function structurallyEqual(a: Node | null, b: Node | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (isPane(a) && isPane(b)) return a.chartId === b.chartId && a.date === b.date;
  if (isSplit(a) && isSplit(b)) {
    return (
      a.orientation === b.orientation &&
      Math.abs(a.ratio - b.ratio) < 0.001 &&
      structurallyEqual(a.a, b.a) &&
      structurallyEqual(a.b, b.b)
    );
  }
  return false;
}
