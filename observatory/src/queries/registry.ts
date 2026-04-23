import type { z } from 'zod';
import type { ClickHouseClient, Database } from '../clickhouse';

export interface QueryContext {
  date: string;
  database: Database;
}

export interface QueryDef<Schema extends z.ZodTypeAny = z.ZodTypeAny> {
  id: string;
  topic: string;
  description: string;
  database?: Database;
  schema: Schema;
  fetch(client: ClickHouseClient, ctx: QueryContext): Promise<Array<z.infer<Schema>>>;
}

export const QUERY_REGISTRY: Map<string, QueryDef> = new Map();

export function query<S extends z.ZodTypeAny>(def: QueryDef<S>): QueryDef<S> {
  if (QUERY_REGISTRY.has(def.id)) {
    throw new Error(`Duplicate query id: ${def.id}`);
  }
  QUERY_REGISTRY.set(def.id, def as QueryDef);
  return def;
}

/** Test-only. Do not call from production. */
export function clearRegistryForTests(): void {
  QUERY_REGISTRY.clear();
}
