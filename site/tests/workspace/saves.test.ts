import { describe, it, expect, beforeEach } from 'vitest';
import { listSaves, saveAs, deleteSave, loadSave } from '@/workspace/state/saves';
import { makePane } from '@/workspace/state/tree';

beforeEach(() => localStorage.clear());

describe('saves', () => {
  it('round-trips a named save', () => {
    const state = {
      root: makePane({ chartId: 'c', date: '2026-04-22' }),
      focusedPaneId: null,
      defaultDate: '2026-04-22',
    };
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
