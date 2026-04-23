import { create } from 'zustand';
import type { WorkspaceState } from './types';
import {
  splitPane, closePane, setPaneChart, setPaneDate, setRatio, swapPanes,
  focusNeighbor, findPane, makePane,
} from './tree';
import { encodeState, decodeState } from './url';

export type Theme = 'light' | 'dark';

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

  toggleSidebar() { set((s) => ({ sidebarOpen: !s.sidebarOpen })); },
  openCmdk()      { set({ cmdkOpen: true }); },
  closeCmdk()     { set({ cmdkOpen: false }); },
  setTheme(t)     { set({ theme: t }); },

  splitFocused(orientation, position, chartId) {
    const { ws } = get();
    if (!ws.root || !ws.focusedPaneId) return;
    const root = splitPane(
      ws.root,
      ws.focusedPaneId,
      orientation,
      position,
      chartId ? { chartId } : undefined,
    );
    set({ ws: { ...ws, root } });
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
        defaultDate: date,
      },
    });
  },

  setRatioForSplit(splitId, ratio) {
    const { ws } = get();
    if (!ws.root) return;
    set({ ws: { ...ws, root: setRatio(ws.root, splitId, ratio) } });
  },

  swap(idA, idB) {
    const { ws } = get();
    if (!ws.root) return;
    set({ ws: { ...ws, root: swapPanes(ws.root, idA, idB) } });
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
