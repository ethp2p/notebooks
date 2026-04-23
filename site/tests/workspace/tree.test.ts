import { describe, it, expect } from 'vitest';
import {
  makePane, makeSplit, splitPane, closePane, setPaneChart, setPaneDate,
  setRatio, findPane, swapPanes, focusNeighbor,
} from '@/workspace/state/tree';

describe('tree ops', () => {
  const leaf = (id: string, chartId = 'c1', date = '2026-04-22') =>
    makePane({ id, chartId, date });

  it('splits a pane', () => {
    const root = leaf('p1');
    const next = splitPane(root, 'p1', 'h', 'after');
    expect(next.kind).toBe('split');
    if (next.kind === 'split') {
      expect(next.a.id).toBe('p1');
      expect(next.b.kind).toBe('pane');
    }
  });

  it('closes a pane by promoting its sibling', () => {
    const a = leaf('a');
    const b = leaf('b');
    const sp = makeSplit({ id: 's', orientation: 'h', ratio: 0.5, a, b });
    const next = closePane(sp, 'a');
    expect(next?.kind).toBe('pane');
    if (next?.kind === 'pane') {
      expect(next.id).toBe('b');
    }
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
    const sp = makeSplit({
      id: 's', orientation: 'h', ratio: 0.5,
      a: leaf('a'), b: leaf('b'),
    });
    const low = setRatio(sp, 's', 0.0001);
    const high = setRatio(sp, 's', 0.9999);
    if (low.kind === 'split') expect(low.ratio).toBe(0.1);
    else expect.fail('expected split');
    if (high.kind === 'split') expect(high.ratio).toBe(0.9);
    else expect.fail('expected split');
  });

  it('swapPanes exchanges two panes in place', () => {
    const a = leaf('a', 'c1');
    const b = leaf('b', 'c2');
    const root = makeSplit({ id: 's', orientation: 'h', ratio: 0.5, a, b });
    const next = swapPanes(root, 'a', 'b');
    // chartIds are swapped; ids remain at original positions
    if (next.kind === 'split') {
      // position a now holds b's chart
      expect(next.a.id).toBe('a');
      if (next.a.kind === 'pane') expect(next.a.chartId).toBe('c2');
      // position b now holds a's chart
      expect(next.b.id).toBe('b');
      if (next.b.kind === 'pane') expect(next.b.chartId).toBe('c1');
    } else {
      expect.fail('expected split');
    }
    // findPane preserves ids
    expect(findPane(next, 'a')?.chartId).toBe('c2');
    expect(findPane(next, 'b')?.chartId).toBe('c1');
  });

  it('focusNeighbor walks leaves', () => {
    const root = makeSplit({
      id: 's', orientation: 'h', ratio: 0.5,
      a: leaf('a'),
      b: makeSplit({
        id: 's2', orientation: 'v', ratio: 0.5,
        a: leaf('b'),
        b: leaf('c'),
      }),
    });
    expect(focusNeighbor(root, 'a', 'next')).toBe('b');
    expect(focusNeighbor(root, 'b', 'next')).toBe('c');
    expect(focusNeighbor(root, 'c', 'prev')).toBe('b');
  });
});
