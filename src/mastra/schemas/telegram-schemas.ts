import { z } from 'zod';

// Workflow entry input
export const telegramNoteInputSchema = z.object({
  chatId: z.number(),
  messageId: z.number(),
  senderName: z.string(),
  date: z.number(),
  messageType: z.enum(['text', 'voice', 'audio']),
  text: z.string().optional(),
  fileId: z.string().optional(),
  mimeType: z.string().optional(),
  duration: z.number().optional(),
});

// Step 1 output: save-content
export const saveContentOutputSchema = z.object({
  chatId: z.number(),
  messageId: z.number(),
  senderName: z.string(),
  messageType: z.enum(['text', 'voice', 'audio']),
  savedFilePath: z.string(),
  timestamp: z.string(),
});

// Step 2 / final output: send-reply
export const sendReplyOutputSchema = z.object({
  success: z.boolean(),
  savedFilePath: z.string(),
  messageType: z.enum(['text', 'voice', 'audio']),
  replyMessageId: z.number().optional(),
  timestamp: z.string(),
});

// Type exports
export type TelegramNoteInput = z.infer<typeof telegramNoteInputSchema>;
export type SaveContentOutput = z.infer<typeof saveContentOutputSchema>;
export type SendReplyOutput = z.infer<typeof sendReplyOutputSchema>;
