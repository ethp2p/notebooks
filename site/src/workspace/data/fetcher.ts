import { tableFromIPC, type Table } from 'apache-arrow';
import type { WorkerRequest, WorkerResponse } from './types';
import { getOrCreate } from './cache';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (b: ArrayBuffer) => void; reject: (e: unknown) => void }>();

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (e: MessageEvent<WorkerResponse>) => {
    const m = e.data;
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.kind === 'ok') p.resolve(m.buffer);
    else p.reject(new FetchError(m.status, m.message));
  });
  return worker;
}

export class FetchError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'FetchError';
  }
}

async function requestBuffer(url: string): Promise<ArrayBuffer> {
  const w = ensureWorker();
  const id = nextId++;
  const req: WorkerRequest = { id, url };
  return new Promise<ArrayBuffer>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage(req);
  });
}

function dataUrl(queryId: string, date: string): string {
  return `/data/${date}/${queryId}.arrow`;
}

export function fetchArrow(queryId: string, date: string): Promise<Table> {
  const key = `${queryId}:${date}`;
  return getOrCreate(key, async () => {
    const buf = await requestBuffer(dataUrl(queryId, date));
    return tableFromIPC(new Uint8Array(buf));
  });
}

export function fetchArrowBundle(
  queryIds: readonly string[],
  date: string,
): Promise<Record<string, Table>> {
  return Promise.all(queryIds.map((id) => fetchArrow(id, date).then((t) => [id, t] as const)))
    .then((entries) => Object.fromEntries(entries));
}
