import { tableFromJSON, tableFromIPC, tableToIPC, Table, Schema } from 'apache-arrow';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function writeArrow<Row extends Record<string, unknown>>(
  rows: Row[],
  outputPath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const table = rows.length === 0
    ? new Table(new Schema([]))
    : tableFromJSON(rows);
  const bytes = tableToIPC(table, 'file');
  await fs.writeFile(outputPath, bytes);
}

export async function readArrow(inputPath: string): Promise<Table> {
  const buf = await fs.readFile(inputPath);
  return tableFromIPC(new Uint8Array(buf));
}
