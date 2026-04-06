import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { writeMdFile } from './write-utils';
import { NOTES_ROOT } from '../config/paths';

/**
 * Tool for the brainiac agent to persist user input as a raw note in the
 * telegram/ inbox folder. This creates an audit trail of all interactions
 * before dispatching to domain-specific folder agents.
 */
export const saveNoteTool = createTool({
  id: 'save-note',
  description:
    'Save the user\'s message as a raw note to the Obsidian vault. Call this for any substantive input (workout logs, meals, ideas, tasks, etc.) before dispatching to a folder agent. Skip for ephemeral queries like weather or date.',
  inputSchema: z.object({
    content: z.string().describe('The user\'s raw message text to save'),
    senderName: z.string().optional().describe('Name of the sender'),
    messageType: z.enum(['text', 'voice', 'audio']).optional().describe('How the message was sent'),
  }),
  outputSchema: z.object({
    savedTo: z.string().describe('Relative path where the note was saved'),
  }),
  execute: async ({ content, senderName, messageType }) => {
    const telegramDir = join(NOTES_ROOT, 'telegram');
    await mkdir(telegramDir, { recursive: true });

    const now = new Date();
    const dateSlug = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `${dateSlug}-telegram.md`;
    const filePath = join(telegramDir, fileName);

    const frontmatter: Record<string, unknown> = {
      created: now.toISOString(),
      source: 'telegram',
      status: 'unprocessed',
      ...(senderName && { sender: senderName }),
      ...(messageType && { messageType }),
    };

    await writeMdFile(filePath, frontmatter, content);

    return { savedTo: `telegram/${fileName}` };
  },
});
