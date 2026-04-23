import pako from 'pako';
import { isPane, type Node, type WorkspaceState } from './types';
import { makePane, makeSplit } from './tree';

// Compact wire format uses interned string arrays for chartIds and dates.
//
// EncodedPane  = ['p', chartIndex, dateIndex]
// EncodedSplit = ['s' | 'S', ratio*100, EncodedTree, EncodedTree]
//   's' = horizontal, 'S' = vertical
// EncodedState = [charts[], dates[], defaultDateIndex, focusedPaneId | null, EncodedTree | null]

type EncodedPane = ['p', number, number];
type EncodedSplit = ['s' | 'S', number, EncodedTree, EncodedTree];
type EncodedTree = EncodedPane | EncodedSplit;
type EncodedState = [string[], string[], number, string | null, EncodedTree | null];

function internString(map: Map<string, number>, value: string): number {
  const existing = map.get(value);
  if (existing !== undefined) return existing;
  const idx = map.size;
  map.set(value, idx);
  return idx;
}

function encodeNode(n: Node, charts: Map<string, number>, dates: Map<string, number>): EncodedTree {
  if (isPane(n)) {
    return ['p', internString(charts, n.chartId), internString(dates, n.date)];
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
    id: '',
    orientation: tag === 's' ? 'h' : 'v',
    ratio: r10 / 100,
    a: decodeNode(a, charts, dates),
    b: decodeNode(b, charts, dates),
  });
}

// Regenerate all ids after decode so two decoded states don't share ids.
function regenerateIds(n: Node): Node {
  if (isPane(n)) return makePane({ chartId: n.chartId, date: n.date });
  return makeSplit({
    id: '',
    orientation: n.orientation,
    ratio: n.ratio,
    a: regenerateIds(n.a),
    b: regenerateIds(n.b),
  });
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] ?? 0);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeState(s: WorkspaceState): string {
  const charts = new Map<string, number>();
  const dates = new Map<string, number>();
  const tree = s.root ? encodeNode(s.root, charts, dates) : null;
  // Ensure defaultDate is interned even if it doesn't appear in the tree.
  const defIdx = internString(dates, s.defaultDate);
  const payload: EncodedState = [
    [...charts.keys()],
    [...dates.keys()],
    defIdx,
    s.focusedPaneId,
    tree,
  ];
  const bytes = pako.gzip(JSON.stringify(payload));
  return toBase64Url(bytes);
}

export function decodeState(enc: string): WorkspaceState | null {
  try {
    const bytes = fromBase64Url(enc);
    const json = pako.ungzip(bytes, { to: 'string' });
    const [charts, dates, defIdx, focusedId, tree] = JSON.parse(json) as EncodedState;
    const root = tree ? regenerateIds(decodeNode(tree, charts, dates)) : null;
    return {
      root,
      focusedPaneId: focusedId,
      defaultDate: dates[defIdx] ?? dates[dates.length - 1] ?? '',
    };
  } catch {
    return null;
  }
}
