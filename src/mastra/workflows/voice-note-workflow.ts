import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import {
  voiceNoteInputSchema,
  resolveTranscriptionOutputSchema,
  transcribeOutputSchema,
  parseVoiceCommandOutputSchema,
  resolveFolderOutputSchema,
  writeToInboxOutputSchema,
} from '../schemas/voice-note-schemas';
import { writeMdFile } from '../tools/write-utils';

// Path to the notes vault root — defaults to sibling notes/ directory
const NOTES_ROOT = process.env.NOTES_ROOT || resolve(import.meta.dirname, '..', '..', '..', 'notes');

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

    // If transcription already exists, pass through
    if (!needsTranscription && transcription) {
      return { audioFilePath, transcription };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required for transcription');
    }

    const audioBuffer = await readFile(audioFilePath);
    const blob = new Blob([audioBuffer]);
    const formData = new FormData();
    formData.append('file', blob, basename(audioFilePath));
    formData.append('model', 'whisper-1');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Whisper API error (${response.status}): ${errorBody}`);
    }

    const result = await response.json() as { text?: string };
    if (!result.text) {
      throw new Error('Whisper returned empty transcription');
    }

    return { audioFilePath, transcription: result.text };
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

// Folder config schema for type safety
const folderConfigSchema = z.object({
  folders: z.array(z.object({
    id: z.string(),
    name: z.string(),
    keywords: z.array(z.string()),
    vaultPath: z.string(),
  })),
  defaultFolder: z.object({
    id: z.string(),
    name: z.string(),
    vaultPath: z.string(),
  }),
});

// Step 4: Resolve target folder from folder-config.json
const resolveFolder = createStep({
  id: 'resolve-folder',
  description: 'Reads folder-config.json and resolves target folder path',
  inputSchema: parseVoiceCommandOutputSchema,
  outputSchema: resolveFolderOutputSchema,
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error('Input data required');

    const configPath = join(NOTES_ROOT, 'folder-config.json');
    const raw = await readFile(configPath, 'utf-8');
    const config = folderConfigSchema.parse(JSON.parse(raw));

    const matched = config.folders.find(f => f.id === inputData.targetFolder);
    const folder = matched || config.defaultFolder;

    return {
      ...inputData,
      folderPath: join(NOTES_ROOT, folder.vaultPath),
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
