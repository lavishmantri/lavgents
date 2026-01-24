import { z } from 'zod';
import { labelConfigSchema } from './email-schemas';

// Time frame presets for manual triggers
export const timeFrameSchema = z.enum(['last1h', 'last24h', 'last7d', 'last30d']);

// Custom date range for advanced filtering
export const customDateRangeSchema = z.object({
  after: z.string().optional(),  // YYYY/MM/DD format
  before: z.string().optional(),
});

// Gmail fetch input schema
export const gmailFetchInputSchema = z.object({
  // Required: Composio user ID with active Gmail connection
  userId: z.string(),

  // Time filtering (priority: since > timeFrame > customDateRange)
  since: z.string().optional(),        // ISO timestamp - for cron (e.g., last run time)
  timeFrame: timeFrameSchema.optional(),  // Preset - for manual triggers
  customDateRange: customDateRangeSchema.optional(),

  // Optional filters
  fromFilter: z.string().optional(),   // e.g., "info@example.com" or "example.com"
  additionalQuery: z.string().optional(),
  maxResults: z.number().default(50),

  // Optional classification config
  labelConfig: labelConfigSchema.optional(),
});

// Type exports
export type TimeFrame = z.infer<typeof timeFrameSchema>;
export type CustomDateRange = z.infer<typeof customDateRangeSchema>;
export type GmailFetchInput = z.infer<typeof gmailFetchInputSchema>;
