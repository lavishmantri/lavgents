import { homedir } from 'node:os';

function expandTilde(p: string): string {
  return p.startsWith('~') ? p.replace('~', homedir()) : p;
}

export const HIRING_FOLDER = expandTilde(
  process.env.HIRING_FOLDER || '~/zig/hiring',
);
