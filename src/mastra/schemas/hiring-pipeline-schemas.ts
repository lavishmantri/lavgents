import { z } from 'zod';

export const hiringPipelineInputSchema = z.object({});

export const hiringPipelineOutputSchema = z.object({
  scannedCount: z.number(),
  skippedCount: z.number(),
  processedCount: z.number(),
  results: z.array(z.object({
    name: z.string(),
    role: z.string(),
    status: z.string(),
    error: z.string().optional(),
  })),
});

export type HiringPipelineInput = z.infer<typeof hiringPipelineInputSchema>;
export type HiringPipelineOutput = z.infer<typeof hiringPipelineOutputSchema>;
