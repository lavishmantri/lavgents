
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { Observability, DefaultExporter, CloudExporter, SensitiveDataFilter } from '@mastra/observability';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { toolCallAppropriatenessScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';
import { emailClassificationWorkflow } from './workflows/email-classification-workflow';
import { gmailBatchClassificationWorkflow } from './workflows/gmail-batch-classification-workflow';
import { emailClassifierAgent } from './agents/email-classifier-agent';
import { voiceNoteAgent } from './agents/voice-note-agent';
import { voiceNoteWorkflow } from './workflows/voice-note-workflow';
import { telegramNoteWorkflow } from './workflows/telegram-note-workflow';
import { noteRouterWorkflow } from './workflows/note-router-workflow';
import { processNotesWorkflow } from './workflows/process-notes-workflow';
import { registerApiRoute } from '@mastra/core/server';
import { telegramWebhookHandler } from './webhooks/handlers';
import { CronScheduler } from './scheduler/scheduler.js';
import { cronJobs } from './scheduler/jobs.js';

export const mastra = new Mastra({
  workflows: {
    weatherWorkflow,
    emailClassificationWorkflow,
    gmailBatchClassificationWorkflow,
    voiceNoteWorkflow,
    telegramNoteWorkflow,
    noteRouterWorkflow,
    processNotesWorkflow,
  },
  agents: { weatherAgent, emailClassifierAgent, voiceNoteAgent },
  scorers: { toolCallAppropriatenessScorer, completenessScorer, translationScorer },
  bundler: {
    sourcemap: true,
  },
  storage: new LibSQLStore({
    id: "mastra-storage",
    url: "file:../mastra.db",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  server: {
    apiRoutes: [
      registerApiRoute('/webhooks/telegram', {
        method: 'POST',
        handler: telegramWebhookHandler,
      }),
    ],
  },
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new DefaultExporter(), // Persists traces to storage for Mastra Studio
          new CloudExporter(), // Sends traces to Mastra Cloud (if MASTRA_CLOUD_ACCESS_TOKEN is set)
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
        ],
      },
    },
  }),
});

// Start cron scheduler with worker thread + LibSQL persistence
const scheduler = new CronScheduler('file:../mastra.db');
for (const job of cronJobs) {
  scheduler.register(job);
}
scheduler.start(mastra).catch((err) => {
  console.error('[CronScheduler] Failed to start:', err);
});
