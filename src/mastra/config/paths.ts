import { homedir } from 'node:os';
import { resolve } from 'node:path';

function expandTilde(p: string): string {
  return p.startsWith('~') ? p.replace('~', homedir()) : p;
}

const defaultNotesRoot = resolve(import.meta.dirname, '..', '..', '..', 'notes');

export const NOTES_ROOT = expandTilde(process.env.NOTES_ROOT || defaultNotesRoot);
