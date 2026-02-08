import { z } from 'zod';

// Workflow entry input
export const voiceNoteInputSchema = z.object({
  audioFilePath: z.string(),
  transcription: z.string().optional(),
});

// Step 1 output: resolve-transcription
export const resolveTranscriptionOutputSchema = z.object({
  audioFilePath: z.string(),
  transcription: z.string().optional(),
  needsTranscription: z.boolean(),
});

// Step 2 output: transcribe-audio
export const transcribeOutputSchema = z.object({
  audioFilePath: z.string(),
  transcription: z.string(),
});

// Step 3 output: parse-voice-command
export const parseVoiceCommandOutputSchema = z.object({
  intent: z.string(),
  targetFolder: z.string(),
  items: z.array(z.string()).optional(),
  content: z.string(),
  rawTranscription: z.string(),
  audioFilePath: z.string(),
});

// Step 4 output: resolve-folder
export const resolveFolderOutputSchema = z.object({
  intent: z.string(),
  targetFolder: z.string(),
  items: z.array(z.string()).optional(),
  content: z.string(),
  rawTranscription: z.string(),
  audioFilePath: z.string(),
  folderPath: z.string(),
  folderId: z.string(),
  folderName: z.string(),
});

// Step 5 output: write-to-inbox
export const writeToInboxOutputSchema = z.object({
  success: z.boolean(),
  filePath: z.string(),
  timestamp: z.string(),
  folderId: z.string(),
  intent: z.string(),
});

// Type exports
export type VoiceNoteInput = z.infer<typeof voiceNoteInputSchema>;
export type ResolveTranscriptionOutput = z.infer<typeof resolveTranscriptionOutputSchema>;
export type TranscribeOutput = z.infer<typeof transcribeOutputSchema>;
export type ParseVoiceCommandOutput = z.infer<typeof parseVoiceCommandOutputSchema>;
export type ResolveFolderOutput = z.infer<typeof resolveFolderOutputSchema>;
export type WriteToInboxOutput = z.infer<typeof writeToInboxOutputSchema>;
