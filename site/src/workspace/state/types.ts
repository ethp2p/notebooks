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
