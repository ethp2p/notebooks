# Plan 06: workspace UI

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended).
>
> **BEFORE STARTING, READ `docs/superpowers/plans/ERRATA.md` IN FULL.** Entries override this plan.
>
> **IF YOU DEVIATE**, append to `ERRATA.md` BEFORE marking the step complete.

**Goal:** Ship the binary-tree workspace that lets users compose arbitrary layouts of charts across dates. Sidebar with topic pills + search, Cmd-K palette, per-pane date picker with cascading default, related-chart affordance, URL-encoded state, localStorage saves, mobile single-pane fallback, Framer Motion transitions, Service Worker cache.

**Architecture:** Zustand store owns the `WorkspaceState` tree. `react-mosaic-component` renders the tree visually. Each pane pulls chart metadata from `registry.json`, chart code via dynamic `import(/*@vite-ignore*/ ...)` against `ALL_CHARTS`, and data via the Plan 04 fetcher. URL encoder produces a compact base64url string used at `/w/:encoded`. localStorage stores named user saves. Mobile collapses the tree into a horizontal tab strip. Framer Motion wraps pane mount/unmount.

**Tech Stack:** react-mosaic-component, Zustand, Framer Motion, shadcn Command for Cmd-K, uFuzzy, @tanstack/react-virtual for the sidebar list, pako (gzip) for URL encoding, apache-arrow (already installed).

---

## Scope and non-scope

**In scope:**
- Workspace state types + Zustand store.
- Binary tree operations (pure).
- URL encoder/decoder with gzip + base64url.
- localStorage named saves.
- `PaneTree` wrapping react-mosaic.
- `Pane`, `PaneHeader`, `ContextCard`, `ChartBody`.
- `Sidebar`, `CommandPalette`, `Header`, `MobileNav`.
- `DatePicker` (prev/next + flat list; no calendar widget).
- Framer Motion transitions on pane mount/unmount.
- Service Worker for cache.
- Home route → curated flagship workspace.
- `/w` empty landing.
- `/w/:encoded` restore.
- Full keyboard shortcut coverage (Section 00 lists them).
- Full unit + E2E tests.

**Out of scope:**
- Legacy URL redirects (Plan 07).
- Observability / analytics (Plan 07, optional).

## File structure (workspace additions)

```
site/src/workspace/
├── state/
│   ├── types.ts                  # WorkspaceState, Node, Split, Pane
│   ├── tree.ts                   # pure tree ops: split, close, focus, swap, replaceChart, setDate
│   ├── url.ts                    # encode/decode base64url+gzip
│   ├── saves.ts                  # localStorage CRUD for named saves
│   └── store.ts                  # Zustand store wiring state + ops
├── tree/
│   └── PaneTree.tsx              # react-mosaic wrapper
├── pane/
│   ├── Pane.tsx
│   ├── PaneHeader.tsx
│   ├── PaneDropdown.tsx          # chart picker scoped to a pane
│   ├── RelatedMenu.tsx
│   ├── ChartBody.tsx
│   ├── DatePicker.tsx
│   └── ContextCard.tsx
├── chrome/
│   ├── Header.tsx
│   ├── Sidebar.tsx               # topic pills + search + virtualized list
│   ├── CommandPalette.tsx
│   └── MobileNav.tsx
├── motion/
│   └── PaneTransition.tsx        # Framer Motion wrapper
└── hooks/
    ├── useMediaQuery.ts
    ├── useChartModule.ts         # dynamic import by id
    └── useHoverIntent.ts
```

Routes:
- `site/src/routes/Home.tsx` replaces the Plan 01 placeholder with a single-pane flagship workspace.
- `site/src/routes/Workspace.tsx` serves `/w` and `/w/:encoded`.

Service Worker:
- `site/src/sw.ts`
- `site/vite.config.ts` updated with `vite-plugin-pwa` or hand-rolled registration.

---

## Section 00: keyboard shortcut matrix (implement in `useKeyboardShortcuts.ts`)

| Shortcut | Action |
|---|---|
| `Cmd+K` / `Ctrl+K` | Open Cmd-K palette |
| `Cmd+B` / `Ctrl+B` | Toggle sidebar |
| `Cmd+\` | Split focused pane right |
| `Cmd+Shift+\` | Split focused pane below |
| `Cmd+W` | Close focused pane |
| `Cmd+[` / `Cmd+]` | Prev / next date on focused pane |
| `Cmd+Shift+S` | Save workspace |
| `Cmd+Alt+Arrow` | Move focus to neighbour pane |

## Task 01: workspace state types

**Files:**
- Create: `site/src/workspace/state/types.ts`

- [ ] **Step 1: Write**

```ts
// site/src/workspace/state/types.ts
export type WorkspaceState = {
  root: Node | null;
  focusedPaneId: string | null;
  defaultDate: string;
};

export type Node = Split | Pane;

export type Split = {
  kind: 'split';
  id: string;
  orientation: 'h' | 'v';
  ratio: number;
  a: Node;
  b: Node;
};

export type Pane = {
  kind: 'pane';
  id: string;
  chartId: string;
  date: string;
};

export function isSplit(n: Node): n is Split { return n.kind === 'split'; }
export function isPane(n: Node): n is Pane   { return n.kind === 'pane'; }
```

- [ ] **Step 2: Commit**

```bash
git add site/src/workspace/state/types.ts
git commit -m "feat(workspace): state types"
```

## Task 02: pure tree operations

**Files:**
- Create: `site/src/workspace/state/tree.ts`
- Create: `site/tests/workspace/tree.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// site/tests/workspace/tree.test.ts
import { describe, it, expect } from 'vitest';
import {
  makePane, makeSplit, splitPane, closePane, setPaneChart, setPaneDate,
  setRatio, findPane, swapPanes, focusNeighbor,
} from '@/workspace/state/tree';

describe('tree ops', () => {
  const leaf = (id: string, chartId = 'c1', date = '2026-04-22') => makePane({ id, chartId, date });

  it('splits a pane', () => {
    const root = leaf('p1');
    const next = splitPane(root, 'p1', 'h', 'after');
    expect(next?.kind).toBe('split');
    if (next?.kind === 'split') {
      expect(next.a.id).toBe('p1');
      expect(next.b.kind).toBe('pane');
    }
  });

  it('closes a pane by promoting its sibling', () => {
    const a = leaf('a'); const b = leaf('b');
    const sp = makeSplit({ id: 's', orientation: 'h', ratio: 0.5, a, b });
    const next = closePane(sp, 'a');
    expect(next?.kind).toBe('pane');
    expect((next as any)?.id).toBe('b');
  });

  it('closePane on the only leaf returns null', () => {
    const root = leaf('solo');
    expect(closePane(root, 'solo')).toBeNull();
  });

  it('setPaneChart updates only the target pane', () => {
    const root = makeSplit({
      id: 's', orientation: 'h', ratio: 0.5,
      a: leaf('a', 'c1'), b: leaf('b', 'c2'),
    });
    const next = setPaneChart(root, 'b', 'c3');
    expect(findPane(next, 'a')?.chartId).toBe('c1');
    expect(findPane(next, 'b')?.chartId).toBe('c3');
  });

  it('setPaneDate updates only the target pane', () => {
    const root = leaf('p');
    const next = setPaneDate(root, 'p', '2026-01-01');
    expect(findPane(next, 'p')?.date).toBe('2026-01-01');
  });

  it('setRatio clamps to [0.1, 0.9]', () => {
    const sp = makeSplit({ id: 's', orientation: 'h', ratio: 0.5, a: leaf('a'), b: leaf('b') });
    expect(setRatio(sp, 's', 0.0001)?.kind === 'split' && (setRatio(sp, 's', 0.0001) as any).ratio).toBe(0.1);
    expect(setRatio(sp, 's', 0.9999)?.kind === 'split' && (setRatio(sp, 's', 0.9999) as any).ratio).toBe(0.9);
  });

  it('swapPanes exchanges two panes in place', () => {
    const a = leaf('a', 'c1'); const b = leaf('b', 'c2');
    const root = makeSplit({ id: 's', orientation: 'h', ratio: 0.5, a, b });
    const next = swapPanes(root, 'a', 'b');
    expect(findPane(next, 'a')?.chartId).toBe('c1');
    expect(findPane(next, 'b')?.chartId).toBe('c2');
    // ids preserved; positions swapped
    if (next.kind === 'split') {
      expect(next.a.id).toBe('b');
      expect(next.b.id).toBe('a');
    }
  });

  it('focusNeighbor walks leaves', () => {
    const root = makeSplit({
      id: 's', orientation: 'h', ratio: 0.5,
      a: leaf('a'), b: makeSplit({
        id: 's2', orientation: 'v', ratio: 0.5, a: leaf('b'), b: leaf('c'),
      }),
    });
    expect(focusNeighbor(root, 'a', 'next')).toBe('b');
    expect(focusNeighbor(root, 'b', 'next')).toBe('c');
    expect(focusNeighbor(root, 'c', 'prev')).toBe('b');
  });
});
```

- [ ] **Step 2: Implement `tree.ts`**

```ts
// site/src/workspace/state/tree.ts
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

function map(n: Node, f: (p: Pane) => Pane): Node {
  if (isPane(n)) return f(n);
  return { ...n, a: map(n.a, f), b: map(n.b, f) };
}

export function setPaneChart(n: Node, paneId: string, chartId: string): Node {
  return map(n, (p) => (p.id === paneId ? { ...p, chartId } : p));
}

export function setPaneDate(n: Node, paneId: string, date: string): Node {
  return map(n, (p) => (p.id === paneId ? { ...p, date } : p));
}

export function setRatio(n: Node, splitId: string, ratio: number): Node {
  if (isPane(n)) return n;
  const r = Math.max(0.1, Math.min(0.9, ratio));
  if (n.id === splitId) return { ...n, ratio: r };
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
  return { ...n, a: splitPane(n.a, paneId, orientation, position, newPane), b: splitPane(n.b, paneId, orientation, position, newPane) };
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
  // Collect positions, then swap chart ids in a single pass. Ids themselves do not move;
  // what "moves" visually is chart assignment within each pane.
  const paneA = findPane(n, idA);
  const paneB = findPane(n, idB);
  if (!paneA || !paneB) return n;
  return map(n, (p) => {
    if (p.id === idA) return { ...p, chartId: paneB.chartId, date: paneB.date };
    if (p.id === idB) return { ...p, chartId: paneA.chartId, date: paneA.date };
    return p;
  });
}

// Leaf traversal, in-order.
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
```

- [ ] **Step 3: Run tests**

```bash
cd site && bun run test tree
```

Expected: all passing.

- [ ] **Step 4: Commit**

```bash
git add site/src/workspace/state/tree.ts site/tests/workspace/tree.test.ts
git commit -m "feat(workspace): pure binary tree ops"
```

## Task 03: URL encoder + decoder

**Files:**
- Create: `site/src/workspace/state/url.ts`
- Create: `site/tests/workspace/url.test.ts`

- [ ] **Step 1: Install pako for gzip**

```bash
cd site && bun add pako
bun add -d @types/pako
```

- [ ] **Step 2: Write the failing tests**

```ts
// site/tests/workspace/url.test.ts
import { describe, it, expect } from 'vitest';
import { encodeState, decodeState } from '@/workspace/state/url';
import type { WorkspaceState } from '@/workspace/state/types';
import { makePane, makeSplit } from '@/workspace/state/tree';

describe('url encode/decode', () => {
  it('round-trips a single-pane state', () => {
    const s: WorkspaceState = {
      root: makePane({ id: 'p1', chartId: 'c-a', date: '2026-04-22' }),
      focusedPaneId: 'p1',
      defaultDate: '2026-04-22',
    };
    const enc = encodeState(s);
    const dec = decodeState(enc);
    expect(dec).toEqual(s);
  });

  it('round-trips a nested state', () => {
    const s: WorkspaceState = {
      root: makeSplit({
        id: 's1', orientation: 'h', ratio: 0.5,
        a: makeSplit({
          id: 's2', orientation: 'v', ratio: 0.6,
          a: makePane({ id: 'p1', chartId: 'c-a', date: '2026-04-22' }),
          b: makePane({ id: 'p2', chartId: 'c-b', date: '2026-04-22' }),
        }),
        b: makePane({ id: 'p3', chartId: 'c-a', date: '2026-04-15' }),
      }),
      focusedPaneId: 'p3',
      defaultDate: '2026-04-15',
    };
    expect(decodeState(encodeState(s))).toEqual(s);
  });

  it('returns null for malformed input', () => {
    expect(decodeState('!!! not valid !!!')).toBeNull();
  });
});
```

- [ ] **Step 3: Implement `url.ts`**

```ts
// site/src/workspace/state/url.ts
import pako from 'pako';
import { isPane, type Node, type WorkspaceState } from './types';
import { makePane, makeSplit } from './tree';

type EncodedPane = ['p', number, number];
type EncodedSplit = ['s' | 'S', number, EncodedTree, EncodedTree];
type EncodedTree = EncodedPane | EncodedSplit;
type EncodedState = [string[], string[], number, string | null, EncodedTree | null];

function encodeNode(n: Node, charts: Map<string, number>, dates: Map<string, number>): EncodedTree {
  if (isPane(n)) {
    const c = charts.get(n.chartId) ?? (charts.set(n.chartId, charts.size), charts.get(n.chartId))!;
    const d = dates.get(n.date)   ?? (dates.set(n.date, dates.size),     dates.get(n.date))!;
    return ['p', c, d];
  }
  return [
    n.orientation === 'h' ? 's' : 'S',
    Math.round(n.ratio * 100),
    encodeNode(n.a, charts, dates),
    encodeNode(n.b, charts, dates),
  ];
}

function decodeNode(t: EncodedTree, charts: readonly string[], dates: readonly string[]): Node {
  if (t[0] === 'p') {
    const [, ci, di] = t;
    return makePane({ chartId: charts[ci] ?? '', date: dates[di] ?? '' });
  }
  const [tag, r10, a, b] = t;
  return makeSplit({
    id: '',            // will be rewritten to a fresh id below
    orientation: tag === 's' ? 'h' : 'v',
    ratio: r10 / 100,
    a: decodeNode(a, charts, dates),
    b: decodeNode(b, charts, dates),
  });
}

// After decoding, IDs must be regenerated so two decode calls don't collide on reused ids.
function regenerateIds(n: Node): Node {
  if (isPane(n)) return makePane({ chartId: n.chartId, date: n.date });
  return makeSplit({ id: '', orientation: n.orientation, ratio: n.ratio, a: regenerateIds(n.a), b: regenerateIds(n.b) });
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeState(s: WorkspaceState): string {
  const charts = new Map<string, number>();
  const dates = new Map<string, number>();
  const tree = s.root ? encodeNode(s.root, charts, dates) : null;
  const chartArr = [...charts.keys()];
  const dateArr  = [...dates.keys()];
  const defIdx = dates.get(s.defaultDate);
  const ensuredDef = defIdx ?? (dates.set(s.defaultDate, dates.size), dates.get(s.defaultDate)!);
  const dateArr2 = [...dates.keys()];
  const payload: EncodedState = [chartArr, dateArr2, ensuredDef, s.focusedPaneId, tree];
  const bytes = pako.gzip(JSON.stringify(payload));
  return toBase64Url(bytes);
}

export function decodeState(enc: string): WorkspaceState | null {
  try {
    const bytes = fromBase64Url(enc);
    const json  = pako.ungzip(bytes, { to: 'string' });
    const [charts, dates, defIdx, focusedId, tree] = JSON.parse(json) as EncodedState;
    const root = tree ? regenerateIds(decodeNode(tree, charts, dates)) : null;
    return {
      root,
      focusedPaneId: focusedId,
      defaultDate: dates[defIdx] ?? (dates[dates.length - 1] ?? ''),
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd site && bun run test url
```

Expected: 3 passing.

Note: the tests above assume deterministic round-trip of `id` values, but `regenerateIds` intentionally replaces them. Adjust the test expectations to ignore `id` fields (compare structure + `chartId` + `date` only). If this is implemented via a `structurallyEqual` helper, add one to `tree.ts` and use it in the url tests. Update the tests accordingly and append to ERRATA noting the tweak.

- [ ] **Step 5: Commit**

```bash
git add site/src/workspace/state/url.ts site/tests/workspace/url.test.ts site/package.json site/bun.lock
git commit -m "feat(workspace): gzip+base64url workspace state encoder"
```

## Task 04: localStorage saves

**Files:**
- Create: `site/src/workspace/state/saves.ts`
- Create: `site/tests/workspace/saves.test.ts`

- [ ] **Step 1: Write test**

```ts
// site/tests/workspace/saves.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { listSaves, saveAs, deleteSave, loadSave } from '@/workspace/state/saves';
import { makePane } from '@/workspace/state/tree';

beforeEach(() => localStorage.clear());

describe('saves', () => {
  it('round-trips a named save', () => {
    const state = { root: makePane({ chartId: 'c', date: '2026-04-22' }), focusedPaneId: null, defaultDate: '2026-04-22' };
    saveAs('my layout', state);
    expect(listSaves().map((s) => s.name)).toEqual(['my layout']);
    expect(loadSave('my layout')?.state.defaultDate).toBe('2026-04-22');
  });
  it('deletes a save', () => {
    const state = { root: null, focusedPaneId: null, defaultDate: '2026-04-22' };
    saveAs('x', state);
    deleteSave('x');
    expect(listSaves()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// site/src/workspace/state/saves.ts
import type { WorkspaceState } from './types';

const KEY = 'observatory.workspaces';

export interface Save {
  name: string;
  createdAt: string;
  state: WorkspaceState;
}

interface Envelope {
  version: 1;
  saves: Save[];
}

function read(): Envelope {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { version: 1, saves: [] };
    const parsed = JSON.parse(raw) as Envelope;
    if (parsed.version === 1 && Array.isArray(parsed.saves)) return parsed;
  } catch {
    /* ignore */
  }
  return { version: 1, saves: [] };
}

function write(env: Envelope): void {
  localStorage.setItem(KEY, JSON.stringify(env));
}

export function listSaves(): readonly Save[] {
  return read().saves;
}

export function saveAs(name: string, state: WorkspaceState): void {
  const env = read();
  const existing = env.saves.findIndex((s) => s.name === name);
  const entry: Save = { name, createdAt: new Date().toISOString(), state };
  if (existing >= 0) env.saves[existing] = entry;
  else env.saves.push(entry);
  write(env);
}

export function loadSave(name: string): Save | null {
  return read().saves.find((s) => s.name === name) ?? null;
}

export function deleteSave(name: string): void {
  const env = read();
  env.saves = env.saves.filter((s) => s.name !== name);
  write(env);
}

export function renameSave(oldName: string, newName: string): boolean {
  const env = read();
  const e = env.saves.find((s) => s.name === oldName);
  if (!e) return false;
  e.name = newName;
  write(env);
  return true;
}
```

- [ ] **Step 3: Run test + commit**

```bash
cd site && bun run test saves
git add site/src/workspace/state/saves.ts site/tests/workspace/saves.test.ts
git commit -m "feat(workspace): localStorage named saves"
```

## Task 05: Zustand store

**Files:**
- Create: `site/src/workspace/state/store.ts`

- [ ] **Step 1: Install Zustand**

```bash
cd site && bun add zustand
```

- [ ] **Step 2: Write the store**

```ts
// site/src/workspace/state/store.ts
import { create } from 'zustand';
import type { WorkspaceState } from './types';
import {
  splitPane, closePane, setPaneChart, setPaneDate, setRatio, swapPanes,
  focusNeighbor, findPane, makePane,
} from './tree';
import { encodeState, decodeState } from './url';

type Theme = 'light' | 'dark';

interface Store {
  ws: WorkspaceState;
  sidebarOpen: boolean;
  cmdkOpen: boolean;
  theme: Theme;

  setWorkspace(ws: WorkspaceState): void;
  focus(paneId: string | null): void;
  toggleSidebar(): void;
  openCmdk(): void;
  closeCmdk(): void;
  setTheme(t: Theme): void;

  splitFocused(orientation: 'h' | 'v', position: 'after' | 'before', chartId?: string): void;
  closeFocused(): void;
  replaceChartInFocused(chartId: string): void;
  setDateInFocused(date: string): void;
  setRatioForSplit(splitId: string, ratio: number): void;
  swap(idA: string, idB: string): void;
  focusDirection(dir: 'next' | 'prev'): void;

  toUrl(): string;
  loadFromUrl(enc: string): boolean;
}

export const useWorkspace = create<Store>((set, get) => ({
  ws: {
    root: makePane({ chartId: 'block-propagation-by-size', date: '' }),
    focusedPaneId: null,
    defaultDate: '',
  },
  sidebarOpen: true,
  cmdkOpen: false,
  theme: 'light',

  setWorkspace(ws) { set({ ws }); },
  focus(id) {
    const { ws } = get();
    set({ ws: { ...ws, focusedPaneId: id } });
  },
  toggleSidebar() { set({ sidebarOpen: !get().sidebarOpen }); },
  openCmdk()      { set({ cmdkOpen: true }); },
  closeCmdk()     { set({ cmdkOpen: false }); },
  setTheme(t)     { set({ theme: t }); },

  splitFocused(orientation, position, chartId) {
    const { ws } = get();
    if (!ws.root || !ws.focusedPaneId) return;
    const root = splitPane(ws.root, ws.focusedPaneId, orientation, position, chartId ? { chartId } : undefined);
    set({ ws: { ...ws, root: root as any } });
  },

  closeFocused() {
    const { ws } = get();
    if (!ws.root || !ws.focusedPaneId) return;
    const root = closePane(ws.root, ws.focusedPaneId);
    set({ ws: { ...ws, root, focusedPaneId: null } });
  },

  replaceChartInFocused(chartId) {
    const { ws } = get();
    if (!ws.root || !ws.focusedPaneId) return;
    set({ ws: { ...ws, root: setPaneChart(ws.root, ws.focusedPaneId, chartId) } });
  },

  setDateInFocused(date) {
    const { ws } = get();
    if (!ws.root || !ws.focusedPaneId) return;
    set({
      ws: {
        ...ws,
        root: setPaneDate(ws.root, ws.focusedPaneId, date),
        defaultDate: date,    // cascading default for new panes
      },
    });
  },

  setRatioForSplit(splitId, ratio) {
    const { ws } = get();
    if (!ws.root) return;
    set({ ws: { ...ws, root: setRatio(ws.root, splitId, ratio) } });
  },

  swap(a, b) {
    const { ws } = get();
    if (!ws.root) return;
    set({ ws: { ...ws, root: swapPanes(ws.root, a, b) } });
  },

  focusDirection(dir) {
    const { ws } = get();
    if (!ws.root || !ws.focusedPaneId) return;
    const next = focusNeighbor(ws.root, ws.focusedPaneId, dir);
    if (next) set({ ws: { ...ws, focusedPaneId: next } });
  },

  toUrl() { return encodeState(get().ws); },
  loadFromUrl(enc) {
    const decoded = decodeState(enc);
    if (!decoded) return false;
    set({ ws: decoded });
    return true;
  },
}));

export { findPane };
```

- [ ] **Step 3: Commit**

```bash
git add site/src/workspace/state/store.ts site/package.json site/bun.lock
git commit -m "feat(workspace): zustand store"
```

## Task 06: PaneTree using react-mosaic-component

**Files:**
- Create: `site/src/workspace/tree/PaneTree.tsx`

- [ ] **Step 1: Install**

```bash
cd site && bun add react-mosaic-component
```

- [ ] **Step 2: Import react-mosaic styles + patch radii**

Add to `site/src/styles/globals.css` at the bottom:

```css
/* react-mosaic overrides: zero radius, our border tokens */
@import url('react-mosaic-component/react-mosaic-component.css');
.mosaic-tile,
.mosaic-window,
.mosaic-window-toolbar,
.mosaic-window-body,
.mosaic-drop-target,
.mosaic-preview {
  border-radius: 0 !important;
  box-shadow: none !important;
}
.mosaic-window-toolbar { display: none !important; }      /* we render our own header */
.mosaic-split { background: var(--2); }
.mosaic-root  { background: var(--0); }
```

- [ ] **Step 3: Write `PaneTree.tsx`**

```tsx
// site/src/workspace/tree/PaneTree.tsx
import { Mosaic, MosaicNode, MosaicPath } from 'react-mosaic-component';
import { useWorkspace } from '@/workspace/state/store';
import type { Node, Split, Pane as PaneType } from '@/workspace/state/types';
import { Pane } from '@/workspace/pane/Pane';

function toMosaic(n: Node | null): MosaicNode<string> | null {
  if (!n) return null;
  if (n.kind === 'pane') return n.id;
  const m: MosaicNode<string> = {
    direction: n.orientation === 'h' ? 'row' : 'column',
    splitPercentage: Math.round(n.ratio * 100),
    first: toMosaic(n.a)!,
    second: toMosaic(n.b)!,
  };
  return m;
}

function idsFromMosaic(m: MosaicNode<string> | null): string[] {
  if (!m) return [];
  if (typeof m === 'string') return [m];
  return [...idsFromMosaic(m.first), ...idsFromMosaic(m.second)];
}

export function PaneTree() {
  const ws = useWorkspace((s) => s.ws);
  const setWs = useWorkspace((s) => s.setWorkspace);
  const mosaic = toMosaic(ws.root);

  return (
    <Mosaic<string>
      renderTile={(id) => <Pane paneId={id} />}
      value={mosaic}
      onChange={(m) => {
        // Translate react-mosaic layout changes (resize/drag-swap) back into our tree.
        // We walk the mosaic and match ids against the current ws.root to preserve
        // chartId/date; structure and ratios come from the mosaic.
        const rebuilt = rebuildFromMosaic(m, ws.root);
        setWs({ ...ws, root: rebuilt });
      }}
    />
  );
}

// --- helpers ---------------------------------------------------------------

function findPaneById(n: Node | null, id: string): PaneType | null {
  if (!n) return null;
  if (n.kind === 'pane') return n.id === id ? n : null;
  return findPaneById(n.a, id) ?? findPaneById(n.b, id);
}

function rebuildFromMosaic(m: MosaicNode<string> | null, prev: Node | null): Node | null {
  if (!m || !prev) return null;
  if (typeof m === 'string') return findPaneById(prev, m) ?? null;
  const a = rebuildFromMosaic(m.first, prev);
  const b = rebuildFromMosaic(m.second, prev);
  if (!a || !b) return a ?? b;
  return {
    kind: 'split',
    id: cryptoRandom(),
    orientation: m.direction === 'row' ? 'h' : 'v',
    ratio: (m.splitPercentage ?? 50) / 100,
    a, b,
  } as Split;
}

function cryptoRandom(): string {
  return 's' + Math.random().toString(36).slice(2, 10);
}
```

- [ ] **Step 4: Commit**

```bash
git add site/src/workspace/tree site/src/styles/globals.css site/package.json site/bun.lock
git commit -m "feat(workspace): pane tree via react-mosaic"
```

## Task 07: Pane, PaneHeader, ChartBody, ContextCard

**Files:**
- Create: `site/src/workspace/pane/Pane.tsx`
- Create: `site/src/workspace/pane/PaneHeader.tsx`
- Create: `site/src/workspace/pane/ChartBody.tsx`
- Create: `site/src/workspace/pane/ContextCard.tsx`
- Create: `site/src/workspace/pane/DatePicker.tsx`
- Create: `site/src/workspace/pane/PaneDropdown.tsx`
- Create: `site/src/workspace/pane/RelatedMenu.tsx`
- Create: `site/src/workspace/hooks/useChartModule.ts`

- [ ] **Step 1: Implement each component.** Due to length, here is the essential shape; adapt to match the chrome patterns from `.impeccable.md`.

```tsx
// site/src/workspace/pane/Pane.tsx
import { useEffect, useState, Suspense } from 'react';
import { useWorkspace, findPane } from '@/workspace/state/store';
import { PaneHeader } from './PaneHeader';
import { ChartBody } from './ChartBody';
import { ContextCard } from './ContextCard';
import { PaneTransition } from '@/workspace/motion/PaneTransition';

export function Pane({ paneId }: { paneId: string }) {
  const ws = useWorkspace((s) => s.ws);
  const focus = useWorkspace((s) => s.focus);
  const pane = findPane(ws.root, paneId);
  if (!pane) return null;

  const focused = ws.focusedPaneId === paneId;

  return (
    <PaneTransition focused={focused}>
      <div
        className="flex h-full flex-col bg-bg"
        onMouseDown={() => focus(paneId)}
        role="region"
        aria-label={`pane ${paneId}`}
      >
        <PaneHeader paneId={paneId} chartId={pane.chartId} date={pane.date} focused={focused} />
        <div className="min-h-0 flex-1">
          <Suspense fallback={<div className="p-4 text-xs text-muted">loading chart...</div>}>
            <ChartBody paneId={paneId} chartId={pane.chartId} date={pane.date} />
          </Suspense>
        </div>
        <ContextCard chartId={pane.chartId} />
      </div>
    </PaneTransition>
  );
}
```

```ts
// site/src/workspace/hooks/useChartModule.ts
import { useEffect, useState } from 'react';
import { ALL_CHARTS } from '@/workspace/charts/index';
import type { ChartDef } from '@/workspace/charts/types';

export function useChartModule(id: string): ChartDef | null {
  const chart = (ALL_CHARTS as Record<string, ChartDef>)[id];
  return chart ?? null;
}
```

```tsx
// site/src/workspace/pane/ChartBody.tsx
import { useEffect, useMemo, useState } from 'react';
import type { Table } from 'apache-arrow';
import { useChartModule } from '@/workspace/hooks/useChartModule';
import { fetchArrowBundle, FetchError } from '@/workspace/data/fetcher';
import { PlotRenderer } from '@/workspace/charts/PlotRenderer';
import { useWorkspace } from '@/workspace/state/store';

export function ChartBody({ paneId, chartId, date }: { paneId: string; chartId: string; date: string }) {
  void paneId;
  const chart = useChartModule(chartId);
  const [bundle, setBundle] = useState<Record<string, Table> | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error' | 'out-of-range' | 'unknown'>('loading');
  const theme = useWorkspace((s) => s.theme);

  useEffect(() => {
    if (!chart) { setStatus('unknown'); return; }
    if (date < chart.activeFrom || (chart.activeTo && date > chart.activeTo)) {
      setStatus('out-of-range'); return;
    }
    setStatus('loading'); setBundle(null);
    fetchArrowBundle(chart.queries, date)
      .then((b) => { setBundle(b); setStatus('ready'); })
      .catch((err) => {
        if (err instanceof FetchError && err.status === 404) setStatus('missing');
        else setStatus('error');
      });
  }, [chart, date]);

  if (!chart || status === 'unknown') return <div className="p-4 text-xs text-muted">unknown chart: {chartId}</div>;
  if (status === 'out-of-range') return <div className="p-4 text-xs text-muted">chart not available for {date}</div>;
  if (status === 'missing')       return <div className="p-4 text-xs text-muted">no data for {date}</div>;
  if (status === 'error')         return <div className="p-4 text-xs text-destructive">failed to load</div>;
  if (!bundle)                     return <div className="p-4 text-xs text-muted">loading...</div>;

  const data = chart.transform(bundle);
  const parsed = chart.dataSchema.parse(data);
  const option = chart.option(parsed, { date, isDark: theme === 'dark' });
  return <PlotRenderer option={option} />;
}
```

Write `PaneHeader`, `ContextCard`, `DatePicker`, `PaneDropdown`, `RelatedMenu` following the `.impeccable.md` token palette and shadcn primitive conventions. Keep them short and focused.

- [ ] **Step 2: Commit**

```bash
git add site/src/workspace/pane site/src/workspace/hooks
git commit -m "feat(workspace): pane chrome (header, body, context, date picker, related)"
```

## Task 08: Framer Motion transitions

**Files:**
- Create: `site/src/workspace/motion/PaneTransition.tsx`

```bash
cd site && bun add framer-motion
```

```tsx
// site/src/workspace/motion/PaneTransition.tsx
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export function PaneTransition({ focused, children }: { focused: boolean; children: ReactNode }) {
  return (
    <motion.div
      className="h-full w-full"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      style={{ boxShadow: focused ? '0 0 0 1px var(--fg)' : undefined }}
    >
      {children}
    </motion.div>
  );
}
```

Commit:

```bash
git add site/src/workspace/motion site/package.json site/bun.lock
git commit -m "feat(workspace): pane transitions via framer motion"
```

## Task 09: Sidebar

**Files:**
- Create: `site/src/workspace/chrome/Sidebar.tsx`

```bash
cd site && bun add @tanstack/react-virtual
```

Implement the sidebar per `.impeccable.md`:

- Search `Input` at the top.
- Topic filter pills (shadcn `Badge` styled as toggle; multi-select).
- Long scrollable list (virtualized) with topic section headers (non-interactive).
- Dim charts whose date range doesn't cover the focused pane's date (show a "not available" hint on hover via shadcn `Tooltip`).

Click behaviors per `.impeccable.md`:

- single-click → `replaceChartInFocused(id)`
- shift-click → `splitFocused('v', 'after', id)`
- alt-click   → `splitFocused('h', 'after', id)`

Commit:

```bash
git add site/src/workspace/chrome/Sidebar.tsx site/package.json site/bun.lock
git commit -m "feat(workspace): sidebar with topic pills, search, virtualization"
```

## Task 10: Cmd-K command palette

**Files:**
- Create: `site/src/workspace/chrome/CommandPalette.tsx`
- Install: `ufuzzy`

```bash
cd site && bun add @leeoniya/ufuzzy
```

Wrap shadcn `Command` component. Items:
- Every chart (fuzzy over `title + description + topic`).
- Every workspace action (Save, Load, Close all, Duplicate pane, Set date, Swap panes, Toggle theme, Toggle sidebar).
- Named saves.

Enter fires the default action; `Shift+Enter` splits below; `Alt+Enter` splits right.

Commit.

## Task 11: Header + MobileNav + Home + Workspace routes

**Files:**
- Modify: `site/src/routes/Home.tsx`
- Create: `site/src/routes/Workspace.tsx`
- Modify: `site/src/App.tsx`
- Create: `site/src/workspace/chrome/Header.tsx`
- Create: `site/src/workspace/chrome/MobileNav.tsx`
- Create: `site/src/workspace/hooks/useMediaQuery.ts`

- [ ] **Step 1:** Home renders a single-pane workspace with the flagship chart at the latest date from `dates.latest`.

```tsx
// site/src/routes/Home.tsx
import { useEffect } from 'react';
import { useWorkspace } from '@/workspace/state/store';
import { loadDates } from '@/workspace/data/dates';
import { loadRegistry } from '@/workspace/data/registry';
import { WorkspaceShell } from '@/workspace/WorkspaceShell';   // Created below

export default function Home() {
  const setWs = useWorkspace((s) => s.setWorkspace);
  useEffect(() => {
    Promise.all([loadDates(), loadRegistry()]).then(([d]) => {
      setWs({
        root: { kind: 'pane', id: 'p0', chartId: 'block-propagation-by-size', date: d.latest },
        focusedPaneId: 'p0',
        defaultDate: d.latest,
      });
    });
  }, [setWs]);
  return <WorkspaceShell />;
}
```

- [ ] **Step 2: Workspace route decodes `/w/:encoded`**

```tsx
// site/src/routes/Workspace.tsx
import { useEffect } from 'react';
import { useParams } from 'react-router';
import { useWorkspace } from '@/workspace/state/store';
import { loadDates } from '@/workspace/data/dates';
import { WorkspaceShell } from '@/workspace/WorkspaceShell';

export default function Workspace() {
  const { encoded } = useParams<{ encoded?: string }>();
  const loadFromUrl = useWorkspace((s) => s.loadFromUrl);
  const setWs = useWorkspace((s) => s.setWorkspace);

  useEffect(() => {
    if (encoded) {
      if (!loadFromUrl(encoded)) {
        loadDates().then((d) => setWs({ root: null, focusedPaneId: null, defaultDate: d.latest }));
      }
    } else {
      loadDates().then((d) => setWs({ root: null, focusedPaneId: null, defaultDate: d.latest }));
    }
  }, [encoded, loadFromUrl, setWs]);

  return <WorkspaceShell />;
}
```

- [ ] **Step 3: WorkspaceShell pulls together the pieces**

```tsx
// site/src/workspace/WorkspaceShell.tsx
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
        {isMobile ? <MobileNav /> : (sidebarOpen ? <Sidebar /> : null)}
        <main className="flex-1 min-w-0">
          <PaneTree />
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
```

- [ ] **Step 4: Update `App.tsx` routes**

```tsx
<Route path="/w"           element={<Workspace />} />
<Route path="/w/:encoded"  element={<Workspace />} />
```

- [ ] **Step 5: Install react-mosaic + implement useKeyboardShortcuts + useMediaQuery + MobileNav.** Each is small; follow existing patterns.

- [ ] **Step 6: Commit**

```bash
git add site/src/routes site/src/workspace site/src/App.tsx
git commit -m "feat(workspace): shell, routes, shortcuts, mobile fallback"
```

## Task 12: Service Worker

**Files:**
- Create: `site/src/sw.ts`
- Modify: `site/src/main.tsx` (register)

```ts
// site/src/sw.ts
/// <reference lib="webworker" />
const sw = self as unknown as ServiceWorkerGlobalScope;

const ASSET_CACHE = 'observatory-assets-v1';
const DATA_CACHE  = 'observatory-data-v1';

sw.addEventListener('install', () => sw.skipWaiting());
sw.addEventListener('activate', (e) => e.waitUntil(sw.clients.claim()));

sw.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/data/') || url.pathname.endsWith('.arrow')) {
    e.respondWith(cacheFirst(DATA_CACHE, e.request));
    return;
  }
  if (url.pathname.match(/\.(js|css|woff2|svg|png)$/)) {
    e.respondWith(cacheFirst(ASSET_CACHE, e.request));
    return;
  }
  if (url.pathname === '/registry.json' || url.pathname === '/dates.json') {
    e.respondWith(staleWhileRevalidate(DATA_CACHE, e.request));
    return;
  }
  // default: network
});

async function cacheFirst(name: string, req: Request): Promise<Response> {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(name: string, req: Request): Promise<Response> {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const networkFetch = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; });
  return hit ?? networkFetch;
}
```

Register at the bottom of `site/src/main.tsx`:

```ts
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
```

Vite config: copy `sw.ts` → `sw.js` at build time. Either use `vite-plugin-pwa` or a simple postbuild step.

Commit:

```bash
git add site/src/sw.ts site/src/main.tsx site/vite.config.ts
git commit -m "feat(site): service worker for assets and data caching"
```

## Task 13: integration tests

**Files:**
- Create: `site/tests/e2e/workspace.spec.ts`

- [ ] **Step 1: Core scenarios**

```ts
import { test, expect } from '@playwright/test';

test('home renders flagship pane', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10_000 });
});

test('sidebar search narrows the list', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Meta+B');  // toggle sidebar if needed
  const search = page.getByPlaceholder(/search/i);
  await search.fill('mempool');
  await expect(page.getByText('hourly-coverage-lines', { exact: true })).toBeVisible();
});

test('split and close', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Meta+\\');                 // split right
  await expect(page.locator('canvas')).toHaveCount(2);
  await page.keyboard.press('Meta+W');                   // close focused
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('date change cascades to new pane default', async ({ page }) => {
  await page.goto('/');
  // set first pane date to an older date via date picker, then split, verify new pane inherits
  // ...precise selectors depend on PaneHeader implementation
});

test('url round-trip', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Meta+\\');
  const href = await page.evaluate(() => window.location.href);
  expect(href).toMatch(/\/w\//);
  await page.goto(href);
  await expect(page.locator('canvas')).toHaveCount(2);
});
```

- [ ] **Step 2: Commit**

```bash
git add site/tests/e2e/workspace.spec.ts
git commit -m "test(workspace): e2e scenarios"
```

## Self-review checklist

- [ ] Every keyboard shortcut in Section 00 works.
- [ ] URL round-trip (`encodeState`/`decodeState`) is stable modulo id regeneration.
- [ ] Sidebar uses `@tanstack/react-virtual` to render the chart list.
- [ ] Cmd-K uses shadcn `Command` + uFuzzy.
- [ ] Framer Motion transition is 180 ms and only animates opacity + scale.
- [ ] Service Worker caches `.arrow` files and the registry/dates JSON.
- [ ] Mobile view (< 768 px) collapses the tree to a tab strip.
- [ ] Dark mode toggle swaps theme without re-fetching.
- [ ] All unit + e2e tests green on CI.
- [ ] No `rounded-*` or `shadow-*` classes leak into workspace components.
- [ ] ERRATA updated for every deviation.

## Done condition

`plan-06-workspace-ui` PR merged. Users can open `/`, see the flagship workspace, split panes, change dates, save layouts, share via URL, use Cmd-K, and have it all work on mobile. Next: Plan 07 handles legacy URL redirects and the final cutover.
