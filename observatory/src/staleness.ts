import parser from '@babel/parser';
import traverse from '@babel/traverse';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const STRIP_KEYS = new Set([
  'loc', 'start', 'end',
  'leadingComments', 'trailingComments', 'innerComments',
  'comments',
]);

function stripNode(node: Record<string, unknown>): void {
  for (const key of STRIP_KEYS) {
    delete node[key];
  }
}

export function hashSource(src: string): string {
  const ast = parser.parse(src, {
    sourceType: 'module',
    plugins: ['typescript'],
    createParenthesizedExpressions: false,
  });
  // Strip position/comment data from the File root (not visited by traverse).
  stripNode(ast as unknown as Record<string, unknown>);
  traverse(ast, {
    enter(p) {
      // Strip location and comment fields so the hash is insensitive to
      // whitespace moves and comment edits.
      stripNode(p.node as unknown as Record<string, unknown>);
    },
  });
  const normalized = JSON.stringify(ast);
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

export async function hashFile(filePath: string): Promise<string> {
  const src = await fs.readFile(filePath, 'utf8');
  return hashSource(src);
}

export interface StalenessCache {
  queries: Record<string, { hash: string; dates: Record<string, { fetchedAt: string }> }>;
}

const CACHE_PATH = path.join('build', '.cache.json');

export async function loadCache(): Promise<StalenessCache> {
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8');
    return JSON.parse(raw) as StalenessCache;
  } catch {
    return { queries: {} };
  }
}

export async function saveCache(cache: StalenessCache): Promise<void> {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
}

export interface StalenessInput {
  queryId: string;
  queryHash: string;
  date: string;
  outputPath: string;
}

export async function needsFetch(input: StalenessInput, cache: StalenessCache): Promise<string | null> {
  const entry = cache.queries[input.queryId];
  if (!entry) return 'new';
  if (entry.hash !== input.queryHash) return 'query-changed';
  const dateEntry = entry.dates[input.date];
  if (!dateEntry) return 'new';
  try {
    await fs.access(input.outputPath);
  } catch {
    return 'output-missing';
  }
  return null;
}

export function recordFetch(
  cache: StalenessCache,
  queryId: string,
  queryHash: string,
  date: string,
): void {
  const entry = cache.queries[queryId] ?? { hash: queryHash, dates: {} };
  entry.hash = queryHash;
  entry.dates[date] = { fetchedAt: new Date().toISOString() };
  cache.queries[queryId] = entry;
}
