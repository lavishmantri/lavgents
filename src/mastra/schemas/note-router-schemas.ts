import { z } from 'zod';

// Workflow input: just the file path of the unprocessed note
export const noteRouterInputSchema = z.object({
  filePath: z.string(),
});

// Step 1 output: classification result
export const classifyNoteOutputSchema = z.object({
  filePath: z.string(),
  chatId: z.number(),
  noteBody: z.string(),
  suggestedFolderId: z.string(),
  suggestedFolderName: z.string(),
  suggestedFolderPath: z.string(),
});

// Step 2 suspend payload (what we send with suspend)
export const awaitConfirmationSuspendSchema = z.object({
  runId: z.string(),
  chatId: z.number(),
  messageId: z.number(),
  suggestedFolderId: z.string(),
  suggestedFolderName: z.string(),
});

// Step 2 resume payload (what user sends back via callback)
export const awaitConfirmationResumeSchema = z.object({
  confirmed: z.boolean(),
  selectedFolderId: z.string().optional(),
});

// Step 3 output: final result
export const routeNoteOutputSchema = z.object({
  success: z.boolean(),
  filePath: z.string(),
  routedTo: z.string(),
  routedAt: z.string(),
});

// Type exports
export type NoteRouterInput = z.infer<typeof noteRouterInputSchema>;
export type ClassifyNoteOutput = z.infer<typeof classifyNoteOutputSchema>;
export type AwaitConfirmationResume = z.infer<typeof awaitConfirmationResumeSchema>;
export type RouteNoteOutput = z.infer<typeof routeNoteOutputSchema>;
