import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

/**
 * Read a PDF file and extract its text content.
 */
export async function readPdf(filePath: string): Promise<{ text: string; numPages: number }> {
  const buffer = await readFile(filePath);
  const data = await pdfParse(buffer);
  return { text: data.text, numPages: data.numpages };
}
