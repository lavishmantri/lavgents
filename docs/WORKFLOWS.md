# Mastra Workflows

Workflows in Mastra are step-based pipelines that process data through a series of transformations. Each step has typed inputs/outputs and can access agents for LLM operations.

## Available Workflows

### Email Classification Workflow

**ID:** `email-classification-workflow`

Classifies a single email into configurable labels with confidence scores.

**Steps:**
1. `prepare-email` - Builds classification prompt from email data and label config
2. `classify-email` - Sends prompt to LLM agent and parses structured response

**Input:**
```typescript
{
  email: {
    id: string;
    subject: string;
    body: string;
    from: { email: string; name?: string };
    to: Array<{ email: string; name?: string }>;
    date: string;
    hasAttachments: boolean;
    labels?: string[];
    threadId?: string;
  };
  labelConfig?: LabelConfig; // Optional, uses defaults if omitted
}
```

**Output:**
```typescript
{
  emailId: string;
  labels: Array<{
    name: string;
    confidence: number; // 0-1
    reason?: string;
  }>;
  primaryLabel: string;
  priority: 'high' | 'medium' | 'low';
  suggestedAction?: string;
  summary?: string;
}
```

---

### Gmail Batch Classification Workflow

**ID:** `gmail-batch-classification-workflow`

Fetches emails from Gmail via Nango OAuth and classifies them in batch.

**Steps:**
1. `build-gmail-query` - Constructs Gmail search query from input filters
2. `fetch-gmail-emails` - Fetches emails using Google Gmail API
3. `classify-emails` - Classifies all emails with concurrency control (3 parallel)

**Input:**
```typescript
{
  userId: string;              // Nango connection ID

  // Time filtering (priority order: since > timeFrame > customDateRange)
  since?: string;              // ISO timestamp (for cron jobs)
  timeFrame?: 'last1h' | 'last24h' | 'last7d' | 'last30d';
  customDateRange?: {
    after?: string;            // YYYY/MM/DD
    before?: string;
  };

  // Filters
  fromFilter?: string;         // e.g., "example.com" or "user@example.com"
  additionalQuery?: string;    // Raw Gmail query syntax
  maxResults?: number;         // Default: 50

  labelConfig?: LabelConfig;
}
```

**Output:**
```typescript
{
  totalFetched: number;
  totalClassified: number;
  totalFailed: number;
  classifications: ClassificationOutput[];
  failedEmailIds?: string[];
  summary: {
    byPrimaryLabel: Record<string, number>;
    byPriority: { high: number; medium: number; low: number };
  };
  fetchedAt: string;
  queryUsed: string;
}
```

---

### Weather Workflow

**ID:** `weather-workflow`

Example workflow demonstrating basic Mastra patterns with weather data.

---

## Default Email Labels

Configured in `src/mastra/config/email-labels.ts`:

| Label | Description |
|-------|-------------|
| `action-required` | Emails requiring action from you |
| `fyi` | For your information only |
| `meeting` | Calendar and scheduling |
| `urgent` | Time-sensitive |
| `external` | From outside organization |
| `internal` | From colleagues |

## Customizing Labels

Edit `src/mastra/config/email-labels.ts`:

```typescript
export const defaultLabelConfig: LabelConfig = {
  labels: [
    { name: 'action-required', description: 'Emails requiring action', keywords: ['please', 'need'] },
    { name: 'newsletter', description: 'Marketing and newsletters', keywords: ['unsubscribe'] },
    // Add your labels...
  ],
  allowMultipleLabels: true,
  minConfidenceThreshold: 0.5,
};
```

Or pass a custom config when running the workflow:

```typescript
const result = await mastra.runWorkflow('email-classification-workflow', {
  email: emailData,
  labelConfig: {
    labels: [
      { name: 'sales', description: 'Sales inquiries' },
      { name: 'support', description: 'Support requests' },
    ],
    allowMultipleLabels: true,
    minConfidenceThreshold: 0.6,
  },
});
```

## Using Workflows

### Via Mastra Studio

1. Start dev server: `npm run dev`
2. Open http://localhost:4111
3. Navigate to Workflows
4. Select a workflow and provide input JSON
5. Run and view results

### Via API

```typescript
import { mastra } from './mastra';

// Single email classification
const result = await mastra.runWorkflow('email-classification-workflow', {
  email: {
    id: 'email-123',
    subject: 'Urgent: Project deadline',
    body: 'Please review and respond by EOD...',
    from: { email: 'boss@company.com', name: 'Boss' },
    to: [{ email: 'you@company.com' }],
    date: '2025-01-25T10:00:00Z',
    hasAttachments: false,
  },
});

// Batch Gmail classification
const batchResult = await mastra.runWorkflow('gmail-batch-classification-workflow', {
  userId: 'user-123',  // Nango connection ID
  timeFrame: 'last24h',
  maxResults: 100,
});
```

## Creating New Workflows

Follow the existing pattern:

```typescript
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

// Define step
const myStep = createStep({
  id: 'my-step',
  description: 'What this step does',
  inputSchema: z.object({ /* ... */ }),
  outputSchema: z.object({ /* ... */ }),
  execute: async ({ inputData, mastra }) => {
    // Access agents: mastra?.getAgent('agentName')
    // Process data
    return { /* output matching outputSchema */ };
  },
});

// Create workflow
const myWorkflow = createWorkflow({
  id: 'my-workflow',
  inputSchema: z.object({ /* ... */ }),
  outputSchema: z.object({ /* ... */ }),
})
  .then(step1)
  .then(step2);

myWorkflow.commit();

export { myWorkflow };
```

Then register in `src/mastra/index.ts`:

```typescript
import { myWorkflow } from './workflows/my-workflow';

export const mastra = new Mastra({
  workflows: { /* existing */, myWorkflow },
  // ...
});
```
