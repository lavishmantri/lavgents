import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { resolve, join, relative } from 'node:path';
import { readdir, stat, readFile, writeFile as fsWriteFile, mkdir, rename } from 'node:fs/promises';
import { readMdFile, listMdFiles } from './read-utils';
import { writeMdFile, updateMdFrontmatter } from './write-utils';
import type { VaultConfig } from '../config/vaults';

/**
 * Resolve a relative path within a vault and validate it doesn't escape the vault root.
 * Throws if the resolved path is outside the vault.
 */
function safePath(vaultRoot: string, relativePath: string): string {
  const resolved = resolve(vaultRoot, relativePath);
  if (!resolved.startsWith(vaultRoot)) {
    throw new Error(`Path "${relativePath}" escapes vault root`);
  }
  return resolved;
}

/**
 * Create a set of file tools scoped to a specific vault folder.
 * All tools accept relative paths and enforce vault boundary.
 */
export function createVaultTools(vault: VaultConfig) {
  const root = vault.path;

  const readNote = createTool({
    id: `${vault.id}--read-note`,
    description: `Read a markdown note's frontmatter and body from the ${vault.name} folder`,
    inputSchema: z.object({
      path: z.string().describe('Relative path to the .md file within the folder'),
    }),
    outputSchema: z.object({
      frontmatter: z.record(z.string(), z.unknown()),
      body: z.string(),
    }),
    execute: async ({ path }) => {
      const abs = safePath(root, path);
      return await readMdFile(abs);
    },
  });

  const writeNote = createTool({
    id: `${vault.id}--write-note`,
    description: `Create or overwrite a markdown note with frontmatter in the ${vault.name} folder`,
    inputSchema: z.object({
      path: z.string().describe('Relative path for the .md file'),
      frontmatter: z.record(z.string(), z.unknown()).describe('YAML frontmatter fields'),
      body: z.string().describe('Markdown body content'),
    }),
    outputSchema: z.object({ written: z.string() }),
    execute: async ({ path, frontmatter, body }) => {
      const abs = safePath(root, path);
      await writeMdFile(abs, frontmatter, body);
      return { written: path };
    },
  });

  const listNotes = createTool({
    id: `${vault.id}--list-notes`,
    description: `List all .md files in a subfolder of the ${vault.name} folder`,
    inputSchema: z.object({
      subFolder: z.string().optional().describe('Subfolder relative path (defaults to folder root)'),
    }),
    outputSchema: z.object({
      files: z.array(z.string()).describe('Relative paths of .md files'),
    }),
    execute: async ({ subFolder }) => {
      const dir = subFolder ? safePath(root, subFolder) : root;
      const abs = await listMdFiles(dir);
      return { files: abs.map(f => relative(root, f)) };
    },
  });

  const searchNotes = createTool({
    id: `${vault.id}--search-notes`,
    description: `Search for text across all files in the ${vault.name} folder`,
    inputSchema: z.object({
      query: z.string().describe('Text or regex pattern to search for'),
    }),
    outputSchema: z.object({
      matches: z.array(z.object({
        file: z.string(),
        line: z.number(),
        text: z.string(),
      })),
    }),
    execute: async ({ query }) => {
      const matches: { file: string; line: number; text: string }[] = [];
      const pattern = new RegExp(query, 'i');

      async function walk(dir: string) {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(full);
          } else if (entry.name.endsWith('.md')) {
            const content = await readFile(full, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (pattern.test(lines[i])) {
                matches.push({ file: relative(root, full), line: i + 1, text: lines[i].trim() });
              }
            }
          }
        }
      }

      await walk(root);
      return { matches: matches.slice(0, 50) };
    },
  });

  const moveNote = createTool({
    id: `${vault.id}--move-note`,
    description: `Move a note to a different subfolder within the ${vault.name} folder`,
    inputSchema: z.object({
      from: z.string().describe('Relative path of the file to move'),
      toFolder: z.string().describe('Relative path of the destination folder'),
    }),
    outputSchema: z.object({ moved: z.string() }),
    execute: async ({ from, toFolder }) => {
      const srcAbs = safePath(root, from);
      const destDir = safePath(root, toFolder);
      await mkdir(destDir, { recursive: true });
      const destAbs = join(destDir, from.split('/').pop()!);
      await rename(srcAbs, destAbs);
      return { moved: relative(root, destAbs) };
    },
  });

  const updateNoteFrontmatter = createTool({
    id: `${vault.id}--update-frontmatter`,
    description: `Update frontmatter fields on an existing note in the ${vault.name} folder`,
    inputSchema: z.object({
      path: z.string().describe('Relative path to the .md file'),
      updates: z.record(z.string(), z.unknown()).describe('Fields to merge into frontmatter'),
    }),
    outputSchema: z.object({ updated: z.string() }),
    execute: async ({ path, updates }) => {
      const abs = safePath(root, path);
      await updateMdFrontmatter(abs, updates);
      return { updated: path };
    },
  });

  const listFolders = createTool({
    id: `${vault.id}--list-folders`,
    description: `List subdirectories in the ${vault.name} folder`,
    inputSchema: z.object({
      subFolder: z.string().optional().describe('Subfolder to list (defaults to folder root)'),
    }),
    outputSchema: z.object({
      folders: z.array(z.string()),
    }),
    execute: async ({ subFolder }) => {
      const dir = subFolder ? safePath(root, subFolder) : root;
      const entries = await readdir(dir, { withFileTypes: true });
      return {
        folders: entries
          .filter(e => e.isDirectory() && !e.name.startsWith('.'))
          .map(e => subFolder ? `${subFolder}/${e.name}` : e.name),
      };
    },
  });

  const readAnyFile = createTool({
    id: `${vault.id}--read-file`,
    description: `Read any file (not just .md) from the ${vault.name} folder`,
    inputSchema: z.object({
      path: z.string().describe('Relative path to the file'),
    }),
    outputSchema: z.object({ content: z.string() }),
    execute: async ({ path }) => {
      const abs = safePath(root, path);
      const content = await readFile(abs, 'utf-8');
      return { content };
    },
  });

  const writeAnyFile = createTool({
    id: `${vault.id}--write-file`,
    description: `Write any file (not just .md) to the ${vault.name} folder`,
    inputSchema: z.object({
      path: z.string().describe('Relative path for the file'),
      content: z.string().describe('File content'),
    }),
    outputSchema: z.object({ written: z.string() }),
    execute: async ({ path, content }) => {
      const abs = safePath(root, path);
      await mkdir(resolve(abs, '..'), { recursive: true });
      await fsWriteFile(abs, content, 'utf-8');
      return { written: path };
    },
  });

  return {
    [`${vault.id}ReadNote`]: readNote,
    [`${vault.id}WriteNote`]: writeNote,
    [`${vault.id}ListNotes`]: listNotes,
    [`${vault.id}SearchNotes`]: searchNotes,
    [`${vault.id}MoveNote`]: moveNote,
    [`${vault.id}UpdateFrontmatter`]: updateNoteFrontmatter,
    [`${vault.id}ListFolders`]: listFolders,
    [`${vault.id}ReadFile`]: readAnyFile,
    [`${vault.id}WriteFile`]: writeAnyFile,
  };
}
