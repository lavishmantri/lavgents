import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { gmailFetchInputSchema, type TimeFrame } from '../schemas/gmail-fetch-schemas';
import {
  normalizedEmailSchema,
  classificationOutputSchema,
  labelConfigSchema,
  batchClassificationResultSchema,
  batchLabelApplicationResultSchema,
  labelApplicationResultSchema,
  type NormalizedEmail,
  type ClassificationOutput,
  type LabelApplicationResult,
} from '../schemas/email-schemas';
import { defaultLabelConfig } from '../config/email-labels';
import { fetchEmails, addLabels, getLabels, createLabel, type GmailMessage } from '../integrations/google';

// Helper: Convert time frame preset to Gmail query date
function timeFrameToDate(timeFrame: TimeFrame): string {
  const now = new Date();
  const offsets: Record<TimeFrame, number> = {
    'last1h': 60 * 60 * 1000,
    'last24h': 24 * 60 * 60 * 1000,
    'last7d': 7 * 24 * 60 * 60 * 1000,
    'last30d': 30 * 24 * 60 * 60 * 1000,
  };
  const targetDate = new Date(now.getTime() - offsets[timeFrame]);
  // Gmail uses YYYY/MM/DD format
  return `${targetDate.getFullYear()}/${String(targetDate.getMonth() + 1).padStart(2, '0')}/${String(targetDate.getDate()).padStart(2, '0')}`;
}

// Helper: Convert ISO timestamp to Gmail query date
function isoToGmailDate(isoString: string): string {
  const date = new Date(isoString);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

// Step 1: Build Gmail search query from inputs
const buildGmailQuery = createStep({
  id: 'build-gmail-query',
  description: 'Constructs Gmail search query from input parameters',
  inputSchema: gmailFetchInputSchema,
  outputSchema: z.object({
    query: z.string(),
    maxResults: z.number(),
    connectionId: z.string(),
    labelConfig: labelConfigSchema,
  }),
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error('Input data required');

    const {
      connectionId,
      since,
      timeFrame,
      customDateRange,
      fromFilter,
      additionalQuery,
      maxResults = 50,
      labelConfig = defaultLabelConfig,
    } = inputData;

    const queryParts: string[] = [];

    // Time filtering (priority: since > timeFrame > customDateRange)
    if (since) {
      queryParts.push(`after:${isoToGmailDate(since)}`);
    } else if (timeFrame) {
      queryParts.push(`after:${timeFrameToDate(timeFrame)}`);
    } else if (customDateRange) {
      if (customDateRange.after) {
        queryParts.push(`after:${customDateRange.after}`);
      }
      if (customDateRange.before) {
        queryParts.push(`before:${customDateRange.before}`);
      }
    }

    // From filter
    if (fromFilter) {
      queryParts.push(`from:${fromFilter}`);
    }

    // Additional query (pass-through for power users)
    if (additionalQuery) {
      queryParts.push(additionalQuery);
    }

    // Default to inbox if no query parts
    const query = queryParts.length > 0 ? queryParts.join(' ') : 'in:inbox';

    return { query, maxResults, connectionId, labelConfig };
  },
});

// Step 2: Fetch emails via Google Gmail API (Nango OAuth)
const fetchGmailEmails = createStep({
  id: 'fetch-gmail-emails',
  description: 'Fetches emails from Gmail via Google API with Nango OAuth',
  inputSchema: z.object({
    query: z.string(),
    maxResults: z.number(),
    connectionId: z.string(),
    labelConfig: labelConfigSchema,
  }),
  outputSchema: z.object({
    emails: z.array(normalizedEmailSchema),
    totalFetched: z.number(),
    queryUsed: z.string(),
    fetchedAt: z.string(),
    connectionId: z.string(),
    labelConfig: labelConfigSchema,
  }),
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error('Input data required');

    const { query, maxResults, connectionId, labelConfig } = inputData;

    console.log('[Gmail Fetch] Starting with:', { query, maxResults, connectionId });

    let gmailMessages: GmailMessage[];
    try {
      // Fetch emails using Google integration (Nango handles OAuth token)
      gmailMessages = await fetchEmails(connectionId, query, maxResults);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `fetch-gmail-emails failed for connectionId "${connectionId}" with query "${query}" and maxResults ${maxResults}: ${message}`
      );
    }

    // Convert GmailMessage to NormalizedEmail format
    const emails: NormalizedEmail[] = gmailMessages.map((msg: GmailMessage) => ({
      id: msg.id,
      threadId: msg.threadId,
      from: msg.from,
      to: msg.to,
      subject: msg.subject,
      body: msg.body,
      date: msg.date,
      labels: msg.labels,
      hasAttachments: msg.hasAttachments,
    }));

    console.log('[Gmail Fetch] Fetched emails count:', emails.length);

    return {
      emails,
      totalFetched: emails.length,
      queryUsed: query,
      fetchedAt: new Date().toISOString(),
      connectionId,
      labelConfig,
    };
  },
});

// Helper: Classify a single email
async function classifyEmail(
  email: NormalizedEmail,
  labelConfig: z.infer<typeof labelConfigSchema>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agent: any
): Promise<{ classification: ClassificationOutput | null; error: string | null; emailId: string }> {
  try {
    const labelDescriptions = labelConfig.labels
      .map(l => `- "${l.name}": ${l.description}`)
      .join('\n');

    const classificationPrompt = `Classify this email:

LABELS (assign one or more with confidence scores):
${labelDescriptions}

EMAIL:
From: ${email.from.name || ''} <${email.from.email}>
Subject: ${email.subject}
Date: ${email.date}
Has Attachments: ${email.hasAttachments}

Body:
${email.body.substring(0, 2000)}${email.body.length > 2000 ? '...' : ''}

Return valid JSON matching this exact structure:
{
  "emailId": "${email.id}",
  "labels": [{"name": "label-name", "confidence": 0.9, "reason": "brief reason"}],
  "primaryLabel": "most-relevant-label",
  "priority": "high|medium|low",
  "suggestedAction": "what to do next",
  "summary": "one-sentence summary"
}`;

    const response = await agent.generate([
      { role: 'user', content: classificationPrompt }
    ]);

    const text = response.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return { classification: null, error: 'Failed to parse classification response', emailId: email.id };
    }

    const result = JSON.parse(jsonMatch[0]);
    const classification = classificationOutputSchema.parse({ ...result, emailId: email.id });

    return { classification, error: null, emailId: email.id };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown classification error';
    return { classification: null, error: errorMessage, emailId: email.id };
  }
}

// Step 3: Classify all emails with concurrency control
const classifyEmails = createStep({
  id: 'classify-emails',
  description: 'Classifies all fetched emails using the LLM agent',
  inputSchema: z.object({
    emails: z.array(normalizedEmailSchema),
    totalFetched: z.number(),
    queryUsed: z.string(),
    fetchedAt: z.string(),
    connectionId: z.string(),
    labelConfig: labelConfigSchema,
  }),
  outputSchema: batchClassificationResultSchema,
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('Input data required');

    const { emails, totalFetched, queryUsed, fetchedAt, connectionId, labelConfig } = inputData;
    const agent = mastra?.getAgent('emailClassifierAgent');

    if (!agent) {
      throw new Error('Email classifier agent not found');
    }

    // Process emails with concurrency control
    const concurrency = 3;
    const results: { classification: ClassificationOutput | null; error: string | null; emailId: string }[] = [];

    // Process in batches
    for (let i = 0; i < emails.length; i += concurrency) {
      const batch = emails.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(email => classifyEmail(email, labelConfig, agent))
      );
      results.push(...batchResults);
    }

    // Aggregate results
    const classifications: ClassificationOutput[] = [];
    const failedEmailIds: string[] = [];

    for (const result of results) {
      if (result.classification) {
        classifications.push(result.classification);
      } else {
        failedEmailIds.push(result.emailId);
      }
    }

    // Build summary stats
    const byPrimaryLabel: Record<string, number> = {};
    const byPriority = { high: 0, medium: 0, low: 0 };

    for (const classification of classifications) {
      byPrimaryLabel[classification.primaryLabel] = (byPrimaryLabel[classification.primaryLabel] || 0) + 1;
      byPriority[classification.priority]++;
    }

    return {
      connectionId,
      totalFetched,
      totalClassified: classifications.length,
      totalFailed: failedEmailIds.length,
      classifications,
      failedEmailIds: failedEmailIds.length > 0 ? failedEmailIds : undefined,
      summary: {
        byPrimaryLabel,
        byPriority,
      },
      fetchedAt,
      queryUsed,
    };
  },
});

// Step 4: Apply Gmail labels based on classifications
const applyGmailLabels = createStep({
  id: 'apply-gmail-labels',
  description: 'Applies primaryLabel from each classification as a Gmail label',
  inputSchema: batchClassificationResultSchema,
  outputSchema: batchLabelApplicationResultSchema,
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error('Input data required');

    const { connectionId, classifications, summary } = inputData;

    console.log('[Gmail Labels] Applying labels for', classifications.length, 'emails');

    // Pre-fetch all existing labels into a cache: normalizedName -> id
    const existingLabels = await getLabels(connectionId);
    const labelCache = new Map<string, string>();
    for (const label of existingLabels) {
      if (label.name && label.id) {
        labelCache.set(label.name.toLowerCase(), label.id);
      }
    }

    let labelsCreated = 0;

    // Resolve a label name to an ID, creating it if necessary
    async function resolveLabelId(labelName: string): Promise<string> {
      const cached = labelCache.get(labelName.toLowerCase());
      if (cached) return cached;

      // Create the label
      try {
        const newLabel = await createLabel(connectionId, labelName);
        if (newLabel.id) {
          labelCache.set(labelName.toLowerCase(), newLabel.id);
          labelsCreated++;
          return newLabel.id;
        }
        throw new Error('Created label has no ID');
      } catch (err) {
        // Handle 409 conflict (label already exists, e.g. race condition)
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('409') || message.toLowerCase().includes('already exists')) {
          // Re-fetch labels and retry lookup
          const refreshed = await getLabels(connectionId);
          for (const label of refreshed) {
            if (label.name && label.id) {
              labelCache.set(label.name.toLowerCase(), label.id);
            }
          }
          const retryId = labelCache.get(labelName.toLowerCase());
          if (retryId) return retryId;
        }
        throw err;
      }
    }

    // Process in batches of 3 (matches existing concurrency pattern)
    const concurrency = 3;
    const results: LabelApplicationResult[] = [];

    for (let i = 0; i < classifications.length; i += concurrency) {
      const batch = classifications.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (classification): Promise<LabelApplicationResult> => {
          const { emailId, primaryLabel } = classification;
          try {
            const labelId = await resolveLabelId(primaryLabel);
            await addLabels(connectionId, emailId, [labelId]);
            return { emailId, labelName: primaryLabel, labelId, success: true };
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            return { emailId, labelName: primaryLabel, labelId: '', success: false, error };
          }
        }),
      );
      results.push(...batchResults);
    }

    const totalLabeled = results.filter(r => r.success).length;
    const totalFailed = results.filter(r => !r.success).length;

    console.log('[Gmail Labels] Done:', { totalLabeled, totalFailed, labelsCreated });

    return {
      totalEmails: classifications.length,
      totalLabeled,
      totalFailed,
      labelsCreated,
      results,
      classificationSummary: summary,
    };
  },
});

// Create the workflow
const gmailBatchClassificationWorkflow = createWorkflow({
  id: 'gmail-batch-classification-workflow',
  inputSchema: gmailFetchInputSchema,
  outputSchema: batchLabelApplicationResultSchema,
})
  .then(buildGmailQuery)
  .then(fetchGmailEmails)
  .then(classifyEmails)
  .then(applyGmailLabels);

gmailBatchClassificationWorkflow.commit();

export { gmailBatchClassificationWorkflow };
