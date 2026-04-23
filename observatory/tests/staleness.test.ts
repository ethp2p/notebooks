import { describe, it, expect } from 'bun:test';
import { hashSource } from '../src/staleness';

describe('staleness.hashSource', () => {
  it('is stable across comment whitespace changes', () => {
    const a = `// a\nexport function foo() { return 1; }`;
    const b = `/* hi */\nexport function foo() { return 1; }`;
    expect(hashSource(a)).toBe(hashSource(b));
  });

  it('changes when code changes', () => {
    const a = `export function foo() { return 1; }`;
    const b = `export function foo() { return 2; }`;
    expect(hashSource(a)).not.toBe(hashSource(b));
  });
});
