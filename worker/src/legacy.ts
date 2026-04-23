/**
 * Legacy URL redirect support.
 *
 * Maps old notebook-centric URLs to new workspace URLs (/w/<base64url>).
 * Duplicates the Plan 06 url.ts encoder so the worker has no site-side import.
 *
 * EncodedPane  = ['p', chartIndex, dateIndex]
 * EncodedSplit = ['s' | 'S', ratio*100, EncodedTree, EncodedTree]
 *   's' = horizontal, 'S' = vertical
 * EncodedState = [charts[], dates[], defaultDateIndex, focusedPaneId | null, EncodedTree | null]
 */

import pako from 'pako';

// ---------------------------------------------------------------------------
// Notebook presets: old notebook id -> ordered chart ids
// ---------------------------------------------------------------------------

export const NOTEBOOK_PRESETS: Record<string, readonly string[]> = {
  'blob-inclusion': [
    'blob-density-scatter',
    'blob-count-stacked-epoch',
    'blob-popularity-heatmap',
    'blob-slot-heatmap-vertical',
  ],
  'blob-flow': [
    'entity-blobcount-sankey',
    'relay-blobcount-sankey',
    'entity-relay-sankey',
    'entity-relay-blobcount-sankey',
  ],
  'column-propagation': [
    'column-first-seen-heatmap',
    'column-delta-heatmap',
    'column-spread-timeseries',
  ],
  'mempool-visibility': [
    'hourly-coverage-lines',
    'coverage-heatmap',
    'age-percentile-lines',
    'sentry-coverage-bar',
  ],
  'mev-pipeline': [
    'bid-vs-block-scatter',
    'bid-value-vs-block',
    'bidding-duration-vs-block',
  ],
  'block-column-timing': [
    'block-to-column-histogram',
    'block-to-column-boxplot',
    'block-to-column-timeseries',
    'column-spread-boxplot-blob',
  ],
  'propagation-anomalies': [
    'anomaly-regression-scatter',
    'anomalies-by-relay-bar',
    'anomalies-by-blobcount-bar',
  ],
  'missed-slots': [
    'missed-slots-by-entity-bar',
    'entity-miss-rate-bar',
    'missed-slots-hourly-bar',
    'missed-slots-timeline-scatter',
  ],
  'block-propagation-size': [
    'region-winner-grouped-bar',
    'corrected-vs-size-scatter',
    'regional-cdf-subplots',
  ],
};

// ---------------------------------------------------------------------------
// Encoder — mirrors site/src/workspace/state/url.ts exactly
// ---------------------------------------------------------------------------

type EncodedPane = ['p', number, number];
type EncodedSplit = ['s' | 'S', number, EncodedTree, EncodedTree];
type EncodedTree = EncodedPane | EncodedSplit;
type EncodedState = [string[], string[], number, string | null, EncodedTree | null];

interface Pane {
  kind: 'pane';
  chartId: string;
  date: string;
}

interface Split {
  kind: 'split';
  orientation: 'h' | 'v';
  ratio: number;
  a: Node;
  b: Node;
}

type Node = Pane | Split;

function makePane(chartId: string, date: string): Pane {
  return { kind: 'pane', chartId, date };
}

function makeSplit(orientation: 'h' | 'v', ratio: number, a: Node, b: Node): Split {
  return { kind: 'split', orientation, ratio, a, b };
}

function internString(map: Map<string, number>, value: string): number {
  const existing = map.get(value);
  if (existing !== undefined) return existing;
  const idx = map.size;
  map.set(value, idx);
  return idx;
}

function encodeNode(n: Node, charts: Map<string, number>, dates: Map<string, number>): EncodedTree {
  if (n.kind === 'pane') {
    return ['p', internString(charts, n.chartId), internString(dates, n.date)];
  }
  return [
    n.orientation === 'h' ? 's' : 'S',
    Math.round(n.ratio * 100),
    encodeNode(n.a, charts, dates),
    encodeNode(n.b, charts, dates),
  ];
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] ?? 0);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeState(root: Node | null, defaultDate: string): string {
  const charts = new Map<string, number>();
  const dates = new Map<string, number>();
  const tree = root ? encodeNode(root, charts, dates) : null;
  const defIdx = internString(dates, defaultDate);
  const payload: EncodedState = [
    [...charts.keys()],
    [...dates.keys()],
    defIdx,
    null,
    tree,
  ];
  const bytes = pako.gzip(JSON.stringify(payload));
  return toBase64Url(bytes);
}

// ---------------------------------------------------------------------------
// Layout builder: chart ids -> Node tree
// ---------------------------------------------------------------------------

function layoutFor(chartIds: readonly string[], date: string): Node | null {
  if (chartIds.length === 0) return null;
  const [a, b, c, d] = chartIds;
  if (chartIds.length === 1) {
    // Single pane
    return makePane(a ?? '', date);
  }
  if (chartIds.length === 2) {
    // Horizontal split 50/50
    return makeSplit('h', 0.5, makePane(a ?? '', date), makePane(b ?? '', date));
  }
  if (chartIds.length === 3) {
    // horiz(a, vert(b, c))
    return makeSplit(
      'h',
      0.5,
      makePane(a ?? '', date),
      makeSplit('v', 0.5, makePane(b ?? '', date), makePane(c ?? '', date)),
    );
  }
  // 4+ charts: 2x2 grid — horiz(vert(a,b), vert(c,d))
  return makeSplit(
    'h',
    0.5,
    makeSplit('v', 0.5, makePane(a ?? '', date), makePane(b ?? '', date)),
    makeSplit('v', 0.5, makePane(c ?? '', date), makePane(d ?? '', date)),
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolves a legacy notebook URL to a /w/<base64url> workspace path.
 *
 * - notebookId: old notebook id (e.g. 'blob-inclusion'). If omitted or
 *   unknown, defaults to first chart of the first preset.
 * - date: YYYY-MM-DD target date. If omitted, latestDate is used.
 * - latestDate: the current latest available date, used as fallback.
 */
export function resolveLegacy(
  target: { notebookId?: string; date?: string },
  latestDate: string,
): string {
  const date = target.date ?? latestDate;
  const notebookId = target.notebookId;

  let chartIds: readonly string[] | undefined;
  if (notebookId !== undefined) {
    chartIds = NOTEBOOK_PRESETS[notebookId];
  }

  // Fallback: use blob-inclusion preset
  if (!chartIds || chartIds.length === 0) {
    chartIds = NOTEBOOK_PRESETS['blob-inclusion'] ?? [];
  }

  const root = layoutFor(chartIds, date);
  const encoded = encodeState(root, date);
  return `/w/${encoded}`;
}
