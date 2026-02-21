import { createStep, createWorkflow } from '@mastra/core/workflows';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  noteRouterInputSchema,
  classifyNoteOutputSchema,
  awaitConfirmationSuspendSchema,
  awaitConfirmationResumeSchema,
  routeNoteOutputSchema,
} from '../schemas/note-router-schemas';
import { readMdFile } from '../tools/read-utils';
import { updateMdFrontmatter, moveMdFile } from '../tools/write-utils';
import { sendMessageWithKeyboard } from '../integrations/telegram';
import { parseVaultIndex } from './voice-note-workflow';
import { NOTES_ROOT } from '../config/paths';

// Step 1: Classify the note using the LLM agent
const classifyNote = createStep({
  id: 'classify-note',
  description: 'Reads unprocessed note, classifies intent via LLM agent using vault-index context',
  inputSchema: noteRouterInputSchema,
  outputSchema: classifyNoteOutputSchema,
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('Input data required');

    const { filePath } = inputData;
    const { frontmatter, body } = await readMdFile(filePath);

    const chatId = frontmatter.chatId as number;
    if (!chatId) throw new Error(`Note ${filePath} has no chatId in frontmatter`);

    // Mark as processing
    await updateMdFrontmatter(filePath, { status: 'processing' });

    // Read vault index for classification context
    const indexPath = join(NOTES_ROOT, 'vault-index.md');
    const vaultIndex = await readFile(indexPath, 'utf-8');
    const folders = parseVaultIndex(vaultIndex);

    // Ask the agent to classify
    const agent = mastra?.getAgent('voiceNoteAgent');
    if (!agent) throw new Error('Voice note agent not found');

    const prompt = `Given the following vault organization:\n\n${vaultIndex}\n\nClassify this note and return JSON with "targetFolder" (the Path value from vault-index) and "content" (a clean version of the note):\n\n${body}`;

    const response = await agent.generate([{ role: 'user', content: prompt }]);
    const text = response.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`Failed to parse agent classification: ${text.substring(0, 200)}`);

    const parsed = JSON.parse(jsonMatch[0]);
    const targetFolder = parsed.targetFolder || 'inbox';

    const matched = folders.find(f => f.id === targetFolder || f.vaultPath === targetFolder);
    const fallback = folders.find(f => f.id === 'inbox') || { id: 'inbox', name: 'Inbox', vaultPath: 'inbox' };
    const folder = matched || fallback;

    return {
      filePath,
      chatId,
      noteBody: body,
      suggestedFolderId: folder.id,
      suggestedFolderName: folder.name,
      suggestedFolderPath: folder.vaultPath,
    };
  },
});

// Step 2: Send inline keyboard and suspend for human confirmation
const awaitConfirmation = createStep({
  id: 'await-confirmation',
  description: 'Sends Telegram inline keyboard for routing confirmation, suspends for user response',
  inputSchema: classifyNoteOutputSchema,
  outputSchema: classifyNoteOutputSchema,
  suspendSchema: awaitConfirmationSuspendSchema,
  resumeSchema: awaitConfirmationResumeSchema,
  execute: async ({ inputData, suspend, resumeData, runId }) => {
    if (!inputData) throw new Error('Input data required');

    // If resumed, update classification if user chose a different folder
    if (resumeData) {
      if (resumeData.selectedFolderId && resumeData.selectedFolderId !== inputData.suggestedFolderId) {
        const indexPath = join(NOTES_ROOT, 'vault-index.md');
        const raw = await readFile(indexPath, 'utf-8');
        const folders = parseVaultIndex(raw);
        const picked = folders.find(f => f.id === resumeData.selectedFolderId);
        if (picked) {
          return {
            ...inputData,
            suggestedFolderId: picked.id,
            suggestedFolderName: picked.name,
            suggestedFolderPath: picked.vaultPath,
          };
        }
      }
      return inputData;
    }

    // First execution: send keyboard and suspend
    const preview = inputData.noteBody.length > 100
      ? inputData.noteBody.substring(0, 100) + '...'
      : inputData.noteBody;

    const keyboard = [
      [{ text: `Yes, route to ${inputData.suggestedFolderName}`, callback_data: `route:confirm:${runId}` }],
      [{ text: 'Change folder...', callback_data: `route:change:${runId}` }],
    ];

    const msg = await sendMessageWithKeyboard(
      inputData.chatId,
      `Route this note to ${inputData.suggestedFolderName}?\n\n"${preview}"`,
      keyboard,
    );

    return suspend({
      runId: runId!,
      chatId: inputData.chatId,
      messageId: msg.message_id,
      suggestedFolderId: inputData.suggestedFolderId,
      suggestedFolderName: inputData.suggestedFolderName,
    });
  },
});

// Step 3: Move the note to the target folder
const routeNote = createStep({
  id: 'route-note',
  description: 'Moves note file to the confirmed target folder and updates frontmatter',
  inputSchema: classifyNoteOutputSchema,
  outputSchema: routeNoteOutputSchema,
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error('Input data required');

    const { filePath, chatId, suggestedFolderId, suggestedFolderName, suggestedFolderPath } = inputData;
    const destDir = join(NOTES_ROOT, suggestedFolderPath, '+');
    const routedAt = new Date().toISOString();

    // Move file
    const newPath = await moveMdFile(filePath, destDir);

    // Update frontmatter
    await updateMdFrontmatter(newPath, {
      status: 'processed',
      routedTo: suggestedFolderName,
      routedAt,
    });

    // Notify user
    try {
      const { sendMessage } = await import('../integrations/telegram');
      await sendMessage(chatId, `Routed to ${suggestedFolderName}.`);
    } catch {
      // Notification is best-effort — routing already succeeded
    }

    return {
      success: true,
      filePath: newPath,
      routedTo: suggestedFolderName,
      routedAt,
    };
  },
});

// Create and export the workflow
const noteRouterWorkflow = createWorkflow({
  id: 'note-router-workflow',
  inputSchema: noteRouterInputSchema,
  outputSchema: routeNoteOutputSchema,
})
  .then(classifyNote)
  .then(awaitConfirmation)
  .then(routeNote);

noteRouterWorkflow.commit();

export { noteRouterWorkflow };
