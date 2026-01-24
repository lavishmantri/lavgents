import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { normalizedEmailSchema, classificationOutputSchema, labelConfigSchema } from '../schemas/email-schemas';
import { defaultLabelConfig } from '../config/email-labels';

// Step 1: Prepare email for classification
const prepareEmail = createStep({
  id: 'prepare-email',
  description: 'Prepares email data for classification',
  inputSchema: z.object({
    email: normalizedEmailSchema,
    labelConfig: labelConfigSchema.optional(),
  }),
  outputSchema: z.object({
    email: normalizedEmailSchema,
    labelConfig: labelConfigSchema,
    classificationPrompt: z.string(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error('Input data required');

    const { email, labelConfig = defaultLabelConfig } = inputData;

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
${email.body}

Return valid JSON matching this exact structure:
{
  "emailId": "${email.id}",
  "labels": [{"name": "label-name", "confidence": 0.9, "reason": "brief reason"}],
  "primaryLabel": "most-relevant-label",
  "priority": "high|medium|low",
  "suggestedAction": "what to do next",
  "summary": "one-sentence summary"
}`;

    return { email, labelConfig, classificationPrompt };
  },
});

// Step 2: Classify with LLM
const classifyEmail = createStep({
  id: 'classify-email',
  description: 'Uses LLM to classify email into labels',
  inputSchema: z.object({
    email: normalizedEmailSchema,
    labelConfig: labelConfigSchema,
    classificationPrompt: z.string(),
  }),
  outputSchema: classificationOutputSchema,
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('Input data required');

    const { email, classificationPrompt } = inputData;
    const agent = mastra?.getAgent('emailClassifierAgent');

    if (!agent) throw new Error('Email classifier agent not found');

    const response = await agent.generate([
      { role: 'user', content: classificationPrompt }
    ]);

    // Parse JSON from response
    const text = response.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('Failed to parse classification response as JSON');
    }

    const result = JSON.parse(jsonMatch[0]);
    return classificationOutputSchema.parse({ ...result, emailId: email.id });
  },
});

// Create and export workflow
const emailClassificationWorkflow = createWorkflow({
  id: 'email-classification-workflow',
  inputSchema: z.object({
    email: normalizedEmailSchema,
    labelConfig: labelConfigSchema.optional(),
  }),
  outputSchema: classificationOutputSchema,
})
  .then(prepareEmail)
  .then(classifyEmail);

emailClassificationWorkflow.commit();

export { emailClassificationWorkflow };
