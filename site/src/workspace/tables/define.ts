import type { ColumnDef } from '@tanstack/react-table';
import type { Table } from 'apache-arrow';

export type TableBundle = Record<string, Table>;

export type TableDef<Row> = {
  id: string;
  topic: string;
  title: string;
  description: string;
  queries: readonly string[];
  related?: readonly string[];
  context?: () => Promise<{ default: string }>;
  activeFrom: string;
  activeTo: string | null;
  order?: number;
  columns: ColumnDef<Row, unknown>[];
  rows: (raw: TableBundle) => Row[];
};

export function defineTable<Row>(def: TableDef<Row>): TableDef<Row> {
  return def;
}
