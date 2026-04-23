import { describe, it, expect, beforeEach } from 'bun:test';
import { z } from 'zod';
import { query, QUERY_REGISTRY, clearRegistryForTests } from '../src/queries/registry';

beforeEach(() => clearRegistryForTests());

describe('query registry', () => {
  it('registers a query', () => {
    const Row = z.object({ a: z.number() });
    const q = query({
      id: 'test_q',
      topic: 'test',
      description: 'x',
      schema: Row,
      async fetch() { return []; },
    });
    expect(QUERY_REGISTRY.size).toBe(1);
    expect(QUERY_REGISTRY.get('test_q')).toBe(q);
  });

  it('rejects duplicate ids', () => {
    const Row = z.object({});
    query({ id: 'dup', topic: 't', description: '', schema: Row, async fetch() { return []; } });
    expect(() =>
      query({ id: 'dup', topic: 't', description: '', schema: Row, async fetch() { return []; } }),
    ).toThrow(/duplicate query id/i);
  });
});
