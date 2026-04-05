import { createStep, createWorkflow } from '@mastra/core/workflows';
import { readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import {
  voiceNoteInputSchema,
  resolveTranscriptionOutputSchema,
  transcribeOutputSchema,
  parseVoiceCommandOutputSchema,
  resolveFolderOutputSchema,
  writeToInboxOutputSchema,
} from '../schemas/voice-note-schemas';
import { writeMdFile } from '../tools/write-utils';
import { transcribeAudioBuffer } from '../tools/transcribe';
import { NOTES_ROOT } from '../config/paths';
import { getDiscoveredVaults } from '../config/vaults';

// Step 1: Check if transcription is already provided or exists as sidecar .txt
const resolveTranscription = createStep({
  id: 'resolve-transcription',
  description: 'Checks if transcription is provided or exists as a sidecar .txt file',
  inputSchema: voiceNoteInputSchema,
  outputSchema: resolveTranscriptionOutputSchema,
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error('Input data required');

    const { audioFilePath, transcription } = inputData;

    if (transcription) {
      return { audioFilePath, transcription, needsTranscription: false };
    }

    // Check for sidecar .txt file (e.g. note.m4a → note.txt)
    const sidecarPath = audioFilePath.replace(/\.[^.]+$/, '.txt');
    try {
      const sidecarText = await readFile(sidecarPath, 'utf-8');
      if (sidecarText.trim()) {
        return { audioFilePath, transcription: sidecarText.trim(), needsTranscription: false };
      }
    } catch {
      // No sidecar file — needs transcription
    }

    return { audioFilePath, needsTranscription: true };
  },
});

// Step 2: Transcribe audio via OpenAI Whisper
const transcribeAudio = createStep({
  id: 'transcribe-audio',
  description: 'Transcribes audio using OpenAI Whisper API if needed',
  inputSchema: resolveTranscriptionOutputSchema,
  outputSchema: transcribeOutputSchema,
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error('Input data required');

    const { audioFilePath, transcription, needsTranscription } = inputData;

    if (!needsTranscription && transcription) {
      return { audioFilePath, transcription };
    }

    const audioBuffer = await readFile(audioFilePath);
    const text = await transcribeAudioBuffer(audioBuffer, basename(audioFilePath));
    return { audioFilePath, transcription: text };
  },
});

// Step 3: Parse transcription into structured command via LLM agent
const parseVoiceCommand = createStep({
  id: 'parse-voice-command',
  description: 'Uses LLM agent to parse transcription into structured voice command',
  inputSchema: transcribeOutputSchema,
  outputSchema: parseVoiceCommandOutputSchema,
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('Input data required');

    const { audioFilePath, transcription } = inputData;
    const agent = mastra?.getAgent('voiceNoteAgent');

    if (!agent) {
      throw new Error('Voice note agent not found');
    }

    const response = await agent.generate([
      { role: 'user', content: transcription },
    ]);

    const text = response.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error(`Failed to parse agent response as JSON: ${text.substring(0, 200)}`);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      intent: parsed.intent || 'note',
      targetFolder: parsed.targetFolder || 'inbox',
      items: parsed.items,
      content: parsed.content || transcription,
      rawTranscription: transcription,
      audioFilePath,
    };
  },
});

// Step 4: Resolve target folder from discovered vaults (Agents.md system)
const resolveFolder = createStep({
  id: 'resolve-folder',
  description: 'Resolves target folder path from discovered vaults',
  inputSchema: parseVoiceCommandOutputSchema,
  outputSchema: resolveFolderOutputSchema,
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error('Input data required');

    const vaults = await getDiscoveredVaults();

    const matched = vaults.find(v => v.id === inputData.targetFolder);
    const fallback = vaults.find(v => v.id === 'inbox') ?? { id: 'inbox', name: 'Inbox', path: join(NOTES_ROOT, 'inbox') };
    const folder = matched ?? fallback;

    return {
      ...inputData,
      folderPath: folder.path,
      folderId: folder.id,
      folderName: folder.name,
    };
  },
});

// Step 5: Write markdown file to the folder's +/ inbox
const writeToInbox = createStep({
  id: 'write-to-inbox',
  description: 'Generates filename, builds YAML frontmatter, writes .md file to inbox',
  inputSchema: resolveFolderOutputSchema,
  outputSchema: writeToInboxOutputSchema,
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error('Input data required');

    const { intent, folderPath, folderId, folderName, items, content, rawTranscription, audioFilePath } = inputData;
    const timestamp = new Date().toISOString();
    const dateSlug = timestamp.replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `${dateSlug}-${folderId}.md`;
    const inboxPath = join(folderPath, '+');
    const filePath = join(inboxPath, fileName);

    const frontmatter: Record<string, unknown> = {
      created: timestamp,
      source: 'voice-note',
      intent,
      folder: folderName,
      audio: audioFilePath,
    };

    if (items && items.length > 0) {
      frontmatter.items = items;
    }

    // Build markdown body
    let body = content;
    if (items && items.length > 0) {
      body += '\n\n## Items\n\n' + items.map(item => `- [ ] ${item}`).join('\n');
    }
    if (rawTranscription !== content) {
      body += '\n\n---\n\n> **Raw transcription:** ' + rawTranscription;
    }

    await writeMdFile(filePath, frontmatter, body);

    return { success: true, filePath, timestamp, folderId, intent };
  },
});

// Create the workflow
const voiceNoteWorkflow = createWorkflow({
  id: 'voice-note-workflow',
  inputSchema: voiceNoteInputSchema,
  outputSchema: writeToInboxOutputSchema,
})
  .then(resolveTranscription)
  .then(transcribeAudio)
  .then(parseVoiceCommand)
  .then(resolveFolder)
  .then(writeToInbox);

voiceNoteWorkflow.commit();

export { voiceNoteWorkflow };
