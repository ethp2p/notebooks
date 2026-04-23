import { Mosaic } from 'react-mosaic-component';
import type { MosaicNode, MosaicSplitNode } from 'react-mosaic-component';
import { useWorkspace } from '@/workspace/state/store';
import type { Node, Split, Pane as PaneType } from '@/workspace/state/types';
import { isPane } from '@/workspace/state/types';
import { newId } from '@/workspace/state/tree';
import { Pane } from '@/workspace/pane/Pane';

// react-mosaic-component v7 uses an n-ary tree where split nodes carry
// `children: MosaicNode<T>[]` and `splitPercentages?: number[]`.
// Our internal tree is always binary (exactly two children per split).

function toMosaic(n: Node | null): MosaicNode<string> | null {
  if (!n) return null;
  if (isPane(n)) return n.id;
  const first = toMosaic(n.a);
  const second = toMosaic(n.b);
  if (first === null || second === null) return first ?? second;
  const split: MosaicSplitNode<string> = {
    type: 'split',
    direction: n.orientation === 'h' ? 'row' : 'column',
    splitPercentages: [Math.round(n.ratio * 100), Math.round((1 - n.ratio) * 100)],
    children: [first, second],
  };
  return split;
}

function findPaneByIdLocal(n: Node | null, id: string): PaneType | null {
  if (!n) return null;
  if (isPane(n)) return n.id === id ? n : null;
  return findPaneByIdLocal(n.a, id) ?? findPaneByIdLocal(n.b, id);
}

function rebuildFromMosaic(m: MosaicNode<string> | null, prev: Node | null): Node | null {
  if (!m || !prev) return null;
  if (typeof m === 'string') return findPaneByIdLocal(prev, m);
  // tabs nodes are not used in our design; treat as unsupported
  if (m.type === 'tabs') return null;
  // binary split: take first two children only
  const childA = m.children[0] ?? null;
  const childB = m.children[1] ?? null;
  const a = childA !== null ? rebuildFromMosaic(childA, prev) : null;
  const b = childB !== null ? rebuildFromMosaic(childB, prev) : null;
  if (!a || !b) return a ?? b;
  const pcts = m.splitPercentages;
  const firstPct = pcts !== undefined ? (pcts[0] ?? 50) : 50;
  const split: Split = {
    kind: 'split',
    id: newId('s'),
    orientation: m.direction === 'row' ? 'h' : 'v',
    ratio: firstPct / 100,
    a,
    b,
  };
  return split;
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
        const rebuilt = rebuildFromMosaic(m, ws.root);
        setWs({ ...ws, root: rebuilt });
      }}
    />
  );
}
