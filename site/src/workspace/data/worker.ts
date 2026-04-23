import type { WorkerRequest, WorkerResponse } from './types';

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, url } = e.data;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const msg: WorkerResponse = { id, kind: 'error', status: res.status, message: res.statusText };
      (self as unknown as Worker).postMessage(msg);
      return;
    }
    const buf = await res.arrayBuffer();
    const out: WorkerResponse = { id, kind: 'ok', buffer: buf };
    (self as unknown as Worker).postMessage(out, [buf]);
  } catch (err) {
    const msg: WorkerResponse = {
      id,
      kind: 'error',
      status: 0,
      message: err instanceof Error ? err.message : 'unknown worker error',
    };
    (self as unknown as Worker).postMessage(msg);
  }
};
