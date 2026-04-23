import type { WorkspaceState } from './types';

const KEY = 'observatory.workspaces';

export interface Save {
  name: string;
  createdAt: string;
  state: WorkspaceState;
}

interface Envelope {
  version: 1;
  saves: Save[];
}

function read(): Envelope {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { version: 1, saves: [] };
    const parsed = JSON.parse(raw) as Envelope;
    if (parsed.version === 1 && Array.isArray(parsed.saves)) return parsed;
  } catch {
    // Corrupt or missing storage; start fresh.
  }
  return { version: 1, saves: [] };
}

function write(env: Envelope): void {
  localStorage.setItem(KEY, JSON.stringify(env));
}

export function listSaves(): readonly Save[] {
  return read().saves;
}

export function saveAs(name: string, state: WorkspaceState): void {
  const env = read();
  const existing = env.saves.findIndex((s) => s.name === name);
  const entry: Save = { name, createdAt: new Date().toISOString(), state };
  if (existing >= 0) {
    env.saves[existing] = entry;
  } else {
    env.saves.push(entry);
  }
  write(env);
}

export function loadSave(name: string): Save | null {
  return read().saves.find((s) => s.name === name) ?? null;
}

export function deleteSave(name: string): void {
  const env = read();
  env.saves = env.saves.filter((s) => s.name !== name);
  write(env);
}

export function renameSave(oldName: string, newName: string): boolean {
  const env = read();
  const entry = env.saves.find((s) => s.name === oldName);
  if (!entry) return false;
  entry.name = newName;
  write(env);
  return true;
}
