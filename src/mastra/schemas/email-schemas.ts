import { z } from 'zod';

// Normalized email schema
export const normalizedEmailSchema = z.object({
  id: z.string(),
  threadId: z.string().optional(),
  subject: z.string(),
  body: z.string(),
  from: z.object({
    email: z.string(),
    name: z.string().optional(),
  }),
  to: z.array(z.object({
    email: z.string(),
    name: z.string().optional(),
  })),
  date: z.string(),
  snippet: z.string().optional(),
  hasAttachments: z.boolean(),
  labels: z.array(z.string()).optional(),
});

// Classification output
export const classificationOutputSchema = z.object({
  emailId: z.string(),
  labels: z.array(z.object({
    name: z.string(),
    confidence: z.number().min(0).max(1),
    reason: z.string().optional(),
  })),
  primaryLabel: z.string(),
  priority: z.enum(['high', 'medium', 'low']),
  suggestedAction: z.string().optional(),
  summary: z.string().optional(),
});

// Label configuration
export const labelConfigSchema = z.object({
  labels: z.array(z.object({
    name: z.string(),
    description: z.string(),
    keywords: z.array(z.string()).optional(),
  })),
  allowMultipleLabels: z.boolean().default(true),
  minConfidenceThreshold: z.number().default(0.5),
});

// Batch classification result schema
export const batchClassificationResultSchema = z.object({
  connectionId: z.string(),
  totalFetched: z.number(),
  totalClassified: z.number(),
  totalFailed: z.number(),
  classifications: z.array(classificationOutputSchema),
  failedEmailIds: z.array(z.string()).optional(),
  summary: z.object({
    byPrimaryLabel: z.record(z.string(), z.number()),
    byPriority: z.object({
      high: z.number(),
      medium: z.number(),
      low: z.number(),
    }),
  }),
  fetchedAt: z.string(),
  queryUsed: z.string(),
});

// Label application result (per email)
export const labelApplicationResultSchema = z.object({
  emailId: z.string(),
  labelName: z.string(),
  labelId: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
});

// Batch label application result schema (final workflow output)
export const batchLabelApplicationResultSchema = z.object({
  totalEmails: z.number(),
  totalLabeled: z.number(),
  totalFailed: z.number(),
  labelsCreated: z.number(),
  results: z.array(labelApplicationResultSchema),
  classificationSummary: z.object({
    byPrimaryLabel: z.record(z.string(), z.number()),
    byPriority: z.object({
      high: z.number(),
      medium: z.number(),
      low: z.number(),
    }),
  }),
});

// Type exports
export type NormalizedEmail = z.infer<typeof normalizedEmailSchema>;
export type ClassificationOutput = z.infer<typeof classificationOutputSchema>;
export type LabelConfig = z.infer<typeof labelConfigSchema>;
export type BatchClassificationResult = z.infer<typeof batchClassificationResultSchema>;
export type LabelApplicationResult = z.infer<typeof labelApplicationResultSchema>;
export type BatchLabelApplicationResult = z.infer<typeof batchLabelApplicationResultSchema>;
