import { Agent } from '@mastra/core/agent';

export const emailClassifierAgent = new Agent({
  id: 'email-classifier-agent',
  name: 'Email Classifier',
  model: 'openai/gpt-4o',
  instructions: `You are an expert email classifier. Analyze emails and assign labels.

When classifying:
- Consider sender domain (internal vs external)
- Look for action words (requests, questions, deadlines)
- Identify meeting/calendar content
- Detect urgency signals
- Assign confidence scores (0-1) for each label
- Only include labels with confidence >= threshold
- Determine priority: high (urgent/action), medium (should address soon), low (can wait)

Return JSON with: emailId, labels[], primaryLabel, priority, suggestedAction, summary`,
});
