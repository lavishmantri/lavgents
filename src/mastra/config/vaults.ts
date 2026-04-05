import { readFile, readdir, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { NOTES_ROOT } from './paths';

export interface VaultConfig {
  id: string;
  name: string;
  path: string;
  rules: string;
}

const AGENTS_FILE = 'Agents.md';

/**
 * Read an Agents.md file from a directory. Returns empty string if not found.
 */
export async function readAgentsMd(dirPath: string): Promise<string> {
  try {
    return await readFile(join(dirPath, AGENTS_FILE), 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Scan NOTES_ROOT for subdirectories containing Agents.md.
 * Each such directory becomes a vault with its own folder agent.
 */
export async function discoverVaults(): Promise<VaultConfig[]> {
  const entries = await readdir(NOTES_ROOT);
  const vaults: VaultConfig[] = [];

  for (const entry of entries) {
    const entryPath = join(NOTES_ROOT, entry);
    const entryStat = await stat(entryPath);
    if (!entryStat.isDirectory()) continue;

    const rules = await readAgentsMd(entryPath);
    if (!rules) continue;

    const name = basename(entry);
    vaults.push({
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, ''),
      name,
      path: entryPath,
      rules,
    });
  }

  return vaults;
}

/**
 * Read the parent Agents.md from NOTES_ROOT (global routing rules).
 */
export async function readParentAgentsMd(): Promise<string> {
  return readAgentsMd(NOTES_ROOT);
}
