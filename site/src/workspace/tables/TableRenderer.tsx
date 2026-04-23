import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { cn } from '@/lib/cn';

interface Props<Row> {
  columns: ColumnDef<Row, unknown>[];
  data: Row[];
  className?: string;
}

export function TableRenderer<Row>({ columns, data, className }: Props<Row>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  return (
    <div className={cn('h-full w-full overflow-auto', className)}>
      <table className="w-full border-collapse font-mono text-sm">
        <thead className="sticky top-0 bg-bg">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-border">
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  className="cursor-pointer px-3 py-2 text-left text-xs uppercase tracking-caps text-muted"
                  onClick={h.column.getToggleSortingHandler()}
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((r) => (
            <tr key={r.id} className="border-b border-border hover:bg-hover">
              {r.getVisibleCells().map((c) => (
                <td key={c.id} className="px-3 py-2 text-fg">
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
