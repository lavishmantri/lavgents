import { z } from 'zod';

export const prReviewInputSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  pullNumber: z.number(),
  prTitle: z.string(),
  prBody: z.string().optional(),
  prAuthor: z.string(),
});

export const fetchDiffOutputSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  pullNumber: z.number(),
  prTitle: z.string(),
  prBody: z.string().optional(),
  prAuthor: z.string(),
  diff: z.string(),
  fileCount: z.number(),
  truncated: z.boolean(),
});

export const claudeReviewOutputSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  pullNumber: z.number(),
  reviewBody: z.string(),
});

export const postReviewOutputSchema = z.object({
  success: z.boolean(),
  commentId: z.number().optional(),
  commentUrl: z.string().optional(),
  error: z.string().optional(),
});
