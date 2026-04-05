import { createStep, createWorkflow } from '@mastra/core/workflows';
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
import { getDiscoveredVaults } from '../config/vaults';
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

    // Get discovered vaults for classification context
    const vaults = await getDiscoveredVaults();
    const vaultContext = vaults.map(v => {
      const desc = v.rules.split('\n').find(l => l.trim() && !l.startsWith('#'))?.trim() || v.name;
      return `- **${v.name}** (id: ${v.id}): ${desc}`;
    }).join('\n');

    // Ask the agent to classify
    const agent = mastra?.getAgent('voiceNoteAgent');
    if (!agent) throw new Error('Voice note agent not found');

    const prompt = `Given these available folders:\n\n${vaultContext}\n\nClassify this note and return JSON with "targetFolder" (the folder id) and "content" (a clean version of the note):\n\n${body}`;

    const response = await agent.generate([{ role: 'user', content: prompt }]);
    const text = response.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`Failed to parse agent classification: ${text.substring(0, 200)}`);

    const parsed = JSON.parse(jsonMatch[0]);
    const targetFolder = parsed.targetFolder || 'inbox';

    const matched = vaults.find(v => v.id === targetFolder);
    const fallback = vaults.find(v => v.id === 'inbox') ?? { id: 'inbox', name: 'Inbox', path: join(NOTES_ROOT, 'inbox') };
    const folder = matched ?? fallback;

    return {
      filePath,
      chatId,
      noteBody: body,
      suggestedFolderId: folder.id,
      suggestedFolderName: folder.name,
      suggestedFolderPath: folder.path,
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
        const vaults = await getDiscoveredVaults();
        const picked = vaults.find(v => v.id === resumeData.selectedFolderId);
        if (picked) {
          return {
            ...inputData,
            suggestedFolderId: picked.id,
            suggestedFolderName: picked.name,
            suggestedFolderPath: picked.path,
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
