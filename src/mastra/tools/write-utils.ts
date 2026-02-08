import { writeFile as fsWriteFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { stringify as yamlStringify } from 'yaml';

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
