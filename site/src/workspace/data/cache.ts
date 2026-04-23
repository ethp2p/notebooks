import type { Table } from 'apache-arrow';

const cache = new Map<string, Promise<Table>>();

export function getOrCreate(key: string, factory: () => Promise<Table>): Promise<Table> {
  const existing = cache.get(key);
  if (existing) return existing;
  const created = factory().catch((err: unknown) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, created);
  return created;
}

export function clearCacheForTests(): void {
  cache.clear();
}
