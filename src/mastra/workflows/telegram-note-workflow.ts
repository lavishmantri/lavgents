import { createStep, createWorkflow } from '@mastra/core/workflows';
import { resolve, join } from 'node:path';
import {
  telegramNoteInputSchema,
  saveContentOutputSchema,
  sendReplyOutputSchema,
} from '../schemas/telegram-schemas';
import { writeMdFile, writeBinaryFile } from '../tools/write-utils';
import { getFile, downloadFile, sendMessage } from '../integrations/telegram';

// Path to the notes vault root — defaults to sibling notes/ directory
const NOTES_ROOT = process.env.NOTES_ROOT || resolve(import.meta.dirname, '..', '..', '..', 'notes');

/**
 * Map mime type to file extension for audio files.
 */
function audioExtension(mimeType?: string): string {
  if (!mimeType) return 'ogg';
  const map: Record<string, string> = {
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
  };
  return map[mimeType] || 'ogg';
}

// Step 1: Save content to notes vault
const saveContent = createStep({
  id: 'save-content',
  description: 'Saves text or audio message to the notes vault as markdown/binary',
  inputSchema: telegramNoteInputSchema,
  outputSchema: saveContentOutputSchema,
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error('Input data required');

    const { chatId, messageId, senderName, date, messageType, text, fileId, mimeType, duration } = inputData;
    const timestamp = new Date(date * 1000).toISOString();
    const dateSlug = timestamp.replace(/[:.]/g, '-').slice(0, 19);
    const telegramDir = join(NOTES_ROOT, 'telegram');

    const frontmatter: Record<string, unknown> = {
      created: timestamp,
      source: 'telegram',
      sender: senderName,
      messageType,
    };

    if (messageType === 'text') {
      const fileName = `${dateSlug}-telegram.md`;
      const filePath = join(telegramDir, fileName);
      await writeMdFile(filePath, frontmatter, text || '');
      return { chatId, messageId, senderName, messageType, savedFilePath: filePath, timestamp };
    }

    // Voice or audio message
    if (!fileId) throw new Error('fileId required for voice/audio messages');

    const ext = audioExtension(mimeType);
    const audioFileName = `${dateSlug}-telegram.${ext}`;
    const audioFilePath = join(telegramDir, audioFileName);

    // Download and save binary
    const fileInfo = await getFile(fileId);
    if (!fileInfo.file_path) throw new Error('Telegram getFile did not return file_path');
    const buffer = await downloadFile(fileInfo.file_path);
    await writeBinaryFile(audioFilePath, buffer, { mkdir: true });

    // Create companion .md with metadata
    if (duration !== undefined) frontmatter.duration = duration;
    if (mimeType) frontmatter.mimeType = mimeType;
    frontmatter.audioFile = audioFileName;

    const mdFileName = `${dateSlug}-telegram.md`;
    const mdFilePath = join(telegramDir, mdFileName);
    await writeMdFile(mdFilePath, frontmatter, `Audio note saved: \`${audioFileName}\``);

    return { chatId, messageId, senderName, messageType, savedFilePath: audioFilePath, timestamp };
  },
});

// Step 2: Send reply confirmation
const sendReply = createStep({
  id: 'send-reply',
  description: 'Sends a confirmation reply back to the Telegram chat',
  inputSchema: saveContentOutputSchema,
  outputSchema: sendReplyOutputSchema,
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error('Input data required');

    const { chatId, messageId, messageType, savedFilePath, timestamp } = inputData;
    const replyText = messageType === 'text' ? 'Text note saved.' : 'Audio note saved.';

    try {
      const reply = await sendMessage(chatId, replyText, { replyToMessageId: messageId });
      return { success: true, savedFilePath, messageType, replyMessageId: reply.message_id, timestamp };
    } catch (err) {
      // Reply failure is non-fatal — the file is already saved
      console.error('[Telegram] Failed to send reply:', err);
      return { success: true, savedFilePath, messageType, timestamp };
    }
  },
});

// Create the workflow
const telegramNoteWorkflow = createWorkflow({
  id: 'telegram-note-workflow',
  inputSchema: telegramNoteInputSchema,
  outputSchema: sendReplyOutputSchema,
})
  .then(saveContent)
  .then(sendReply);

telegramNoteWorkflow.commit();

export { telegramNoteWorkflow };
