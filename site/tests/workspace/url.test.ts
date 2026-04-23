import { describe, it, expect } from 'vitest';
import { encodeState, decodeState } from '@/workspace/state/url';
import type { WorkspaceState } from '@/workspace/state/types';
import { makePane, makeSplit, structurallyEqual } from '@/workspace/state/tree';

// Compares two WorkspaceState values structurally: same tree shape + chartIds + dates;
// ids are ignored because decodeState regenerates them via regenerateIds.
function statesStructurallyEqual(a: WorkspaceState, b: WorkspaceState): boolean {
  return (
    structurallyEqual(a.root, b.root) &&
    a.defaultDate === b.defaultDate
    // focusedPaneId is deliberately excluded: ids are regenerated on decode
  );
}

describe('url encode/decode', () => {
  it('round-trips a single-pane state', () => {
    const s: WorkspaceState = {
      root: makePane({ id: 'p1', chartId: 'c-a', date: '2026-04-22' }),
      focusedPaneId: 'p1',
      defaultDate: '2026-04-22',
    };
    const enc = encodeState(s);
    const dec = decodeState(enc);
    expect(dec).not.toBeNull();
    if (dec) {
      expect(statesStructurallyEqual(s, dec)).toBe(true);
    }
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
    const dec = decodeState(encodeState(s));
    expect(dec).not.toBeNull();
    if (dec) {
      expect(statesStructurallyEqual(s, dec)).toBe(true);
    }
  });

  it('returns null for malformed input', () => {
    expect(decodeState('!!! not valid !!!')).toBeNull();
  });
});
