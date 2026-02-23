import type { CronJobDefinition } from './types.js';

/**
 * Centralized cron job registry.
 * Add new cron jobs here -- the scheduler picks them up automatically.
 */
export const cronJobs: CronJobDefinition[] = [
  {
    id: 'process-notes',
    schedule: '*/5 * * * *',
    workflowId: 'processNotesWorkflow',
    inputData: {},
  },
  {
    id: 'hiring-pipeline',
    schedule: '30 0 * * *',
    workflowId: 'hiringPipelineWorkflow',
    inputData: {},
  },
];
