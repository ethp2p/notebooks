import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearCacheForTests, getOrCreate } from '@/workspace/data/cache';
import type { Table } from 'apache-arrow';

beforeEach(clearCacheForTests);

// For the pure cache test we exercise getOrCreate directly; the worker-based
// fetchArrow is covered by Playwright in a later task.

describe('cache.getOrCreate', () => {
  it('shares a promise across concurrent callers', async () => {
    const fake = { numRows: 1 } as unknown as Table;
    const factory = vi.fn(async () => fake);
    const [a, b] = await Promise.all([
      getOrCreate('k', factory),
      getOrCreate('k', factory),
    ]);
    expect(a).toBe(b);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('re-runs after failure', async () => {
    let call = 0;
    const fake = { numRows: 2 } as unknown as Table;
    const factory = vi.fn(async () => {
      call++;
      if (call === 1) throw new Error('x');
      return fake;
    });
    await expect(getOrCreate('k', factory)).rejects.toThrow('x');
    await expect(getOrCreate('k', factory)).resolves.toEqual({ numRows: 2 });
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
