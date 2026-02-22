import { z } from 'zod';

export const processNotesInputSchema = z.object({});

export const processNotesOutputSchema = z.object({
  processed: z.number(),
  skipped: z.number(),
});

export type ProcessNotesInput = z.infer<typeof processNotesInputSchema>;
export type ProcessNotesOutput = z.infer<typeof processNotesOutputSchema>;
