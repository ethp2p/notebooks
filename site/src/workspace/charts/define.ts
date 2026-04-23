import type { ChartDef } from './types';

export function defineChart<
  Queries extends readonly string[],
  Data,
>(def: ChartDef<Queries, Data>): ChartDef<Queries, Data> {
  return def;
}
