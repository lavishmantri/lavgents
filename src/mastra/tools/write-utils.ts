import { writeFile as fsWriteFile, mkdir, rename } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { stringify as yamlStringify } from 'yaml';
import { readMdFile } from './read-utils';

/**
 * Write raw content to a file path.
 */
export async function writeContent(filePath: string, content: string): Promise<void> {
  await fsWriteFile(filePath, content, 'utf-8');
}

/**
 * Write content to a file, optionally ensuring the parent directory exists.
 */
export async function writeFile(
  filePath: string,
  content: string,
  options: { mkdir?: boolean } = {},
): Promise<void> {
  if (options.mkdir) {
    await mkdir(dirname(filePath), { recursive: true });
  }
  await writeContent(filePath, content);
}

/**
 * Write a Markdown file with YAML frontmatter.
 */
export async function writeMdFile(
  filePath: string,
  frontmatter: Record<string, unknown>,
  body: string,
): Promise<void> {
  const yamlBlock = yamlStringify(frontmatter).trimEnd();
  const content = `---\n${yamlBlock}\n---\n\n${body}\n`;
  await writeFile(filePath, content, { mkdir: true });
}

/**
 * Write binary content to a file, optionally ensuring the parent directory exists.
 */
export async function writeBinaryFile(
  filePath: string,
  content: Buffer,
  options: { mkdir?: boolean } = {},
): Promise<void> {
  if (options.mkdir) {
    await mkdir(dirname(filePath), { recursive: true });
  }
  await fsWriteFile(filePath, content);
}

/**
 * Merge fields into an existing markdown file's frontmatter.
 */
export async function updateMdFrontmatter(
  filePath: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const { frontmatter, body } = await readMdFile(filePath);
  const merged = { ...frontmatter, ...updates };
  await writeMdFile(filePath, merged, body);
}

/**
 * Move a markdown note (and its companion audio file if referenced) to a new directory.
 */
export async function moveMdFile(src: string, destDir: string): Promise<string> {
  await mkdir(destDir, { recursive: true });
  const dest = join(destDir, basename(src));
  await rename(src, dest);

  // Move companion audio file if referenced in frontmatter
  const { frontmatter } = await readMdFile(dest);
  if (typeof frontmatter.audioFile === 'string') {
    const audioSrc = join(dirname(src), frontmatter.audioFile);
    const audioDest = join(destDir, frontmatter.audioFile);
    try {
      await rename(audioSrc, audioDest);
    } catch {
      // Audio file may not exist or already moved — non-fatal
    }
  }

  return dest;
}
