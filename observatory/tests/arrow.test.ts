import { describe, it, expect } from 'bun:test';
import { writeArrow, readArrow } from '../src/arrow';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('arrow', () => {
  it('round-trips a small table', async () => {
    const rows = [
      { a: 1, b: 'x' },
      { a: 2, b: 'y' },
      { a: 3, b: 'z' },
    ];
    const tmp = path.join(os.tmpdir(), `arrow-test-${Date.now()}.arrow`);
    await writeArrow(rows, tmp);
    const table = await readArrow(tmp);
    expect(table.numRows).toBe(3);
    expect(Array.from(table.getChild('a')!.toArray())).toEqual([1, 2, 3]);
    expect(Array.from(table.getChild('b')!.toArray())).toEqual(['x', 'y', 'z']);
    fs.unlinkSync(tmp);
  });

  it('handles empty input', async () => {
    const tmp = path.join(os.tmpdir(), `arrow-empty-${Date.now()}.arrow`);
    await writeArrow([], tmp);
    const table = await readArrow(tmp);
    expect(table.numRows).toBe(0);
    fs.unlinkSync(tmp);
  });
});
