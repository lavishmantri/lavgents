import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as yamlParse } from 'yaml';

export interface MdFile {
  frontmatter: Record<string, unknown>;
  body: string;
}

/**
 * Parse a markdown file with YAML frontmatter into structured data.
 */
export async function readMdFile(filePath: string): Promise<MdFile> {
  const raw = await readFile(filePath, 'utf-8');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);

  if (!match) {
    return { frontmatter: {}, body: raw.trim() };
  }

  const frontmatter = (yamlParse(match[1]) as Record<string, unknown>) || {};
  const body = match[2].trim();
  return { frontmatter, body };
}

/**
 * List all .md files in a directory (non-recursive).
 */
export async function listMdFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath);
    return entries
      .filter(name => name.endsWith('.md'))
      .map(name => join(dirPath, name));
  } catch {
    return [];
  }
}
