export type WorkerRequest = { id: number; url: string };
export type WorkerResponse =
  | { id: number; kind: 'ok'; buffer: ArrayBuffer }
  | { id: number; kind: 'error'; status: number; message: string };
