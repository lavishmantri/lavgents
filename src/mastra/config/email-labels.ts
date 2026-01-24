import type { LabelConfig } from '../schemas/email-schemas';

export const defaultLabelConfig: LabelConfig = {
  labels: [
    { name: 'action-required', description: 'Emails requiring action from you', keywords: ['please', 'need', 'request', 'action'] },
    { name: 'fyi', description: 'For your information only', keywords: ['fyi', 'info', 'update', 'announcement'] },
    { name: 'meeting', description: 'Calendar and scheduling', keywords: ['meeting', 'calendar', 'invite', 'schedule'] },
    { name: 'urgent', description: 'Time-sensitive', keywords: ['urgent', 'asap', 'critical', 'deadline'] },
    { name: 'external', description: 'From outside organization', keywords: [] },
    { name: 'internal', description: 'From colleagues', keywords: [] },
  ],
  allowMultipleLabels: true,
  minConfidenceThreshold: 0.5,
};
