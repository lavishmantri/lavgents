
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
import { hiringPipelineWorkflow } from './workflows/hiring-pipeline-workflow';
import { prReviewWorkflow } from './workflows/pr-review-workflow';
import { hiringScreeningAgent } from './agents/hiring-screening-agent';
import { hiringInterviewPrepAgent } from './agents/hiring-interview-prep-agent';
import { registerApiRoute } from '@mastra/core/server';
import { githubWebhookHandler } from './webhooks/handlers';
import { telegramWebhookHandler } from './channels/telegram';
import { whatsappVerifyHandler, whatsappWebhookHandler } from './channels/whatsapp';
import {
  connectionsPageHandler,
  listConnectionsHandler,
  createSessionHandler,
  completeConnectionHandler,
  deleteConnectionHandler,
  renameConnectionHandler,
} from './webhooks/connections';
import { CronScheduler } from './scheduler/scheduler.js';
import { cronJobs } from './scheduler/jobs.js';
import { cronsPageHandler, listCronsHandler, toggleCronHandler } from './webhooks/crons.js';
import { buildBrain } from './agents/brain';

// Build the Brainiac second-brain agent system (discovers vaults, creates folder agents)
const { brainiac, folderAgents } = await buildBrain();

// Collect all folder agents into a keyed object for Mastra registration
const folderAgentMap = Object.fromEntries(
  folderAgents.map(a => [a.id ?? a.name, a]),
);

export const mastra = new Mastra({
  workflows: {
    weatherWorkflow,
    emailClassificationWorkflow,
    gmailBatchClassificationWorkflow,
    voiceNoteWorkflow,
    telegramNoteWorkflow,
    noteRouterWorkflow,
    processNotesWorkflow,
    hiringPipelineWorkflow,
    prReviewWorkflow,
  },
  agents: {
    weatherAgent,
    emailClassifierAgent,
    voiceNoteAgent,
    hiringScreeningAgent,
    hiringInterviewPrepAgent,
    "brainiac": brainiac,
    ...folderAgentMap,
  },
  scorers: { toolCallAppropriatenessScorer, completenessScorer, translationScorer },
  bundler: {
    sourcemap: true,
  },
  storage: new LibSQLStore({
    id: "mastra-storage",
    url: "file:../data/mastra.db",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  server: {
    middleware: [
      { path: '/connections', handler: connectionsPageHandler },
      { path: '/connections/list', handler: listConnectionsHandler },
      { path: '/crons', handler: cronsPageHandler },
      { path: '/crons/list', handler: listCronsHandler },
      { path: '/webhooks/whatsapp', handler: whatsappVerifyHandler },
    ],
    apiRoutes: [
      registerApiRoute('/webhooks/telegram', {
        method: 'POST',
        handler: telegramWebhookHandler,
      }),
      registerApiRoute('/webhooks/whatsapp', {
        method: 'POST',
        handler: whatsappWebhookHandler,
      }),
      registerApiRoute('/webhooks/github', {
        method: 'POST',
        handler: githubWebhookHandler,
      }),
      registerApiRoute('/connections/session', {
        method: 'POST',
        handler: createSessionHandler,
      }),
      registerApiRoute('/connections/complete', {
        method: 'POST',
        handler: completeConnectionHandler,
      }),
      registerApiRoute('/connections/delete', {
        method: 'POST',
        handler: deleteConnectionHandler,
      }),
      registerApiRoute('/connections/rename', {
        method: 'POST',
        handler: renameConnectionHandler,
      }),
      registerApiRoute('/crons/toggle', {
        method: 'POST',
        handler: toggleCronHandler,
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
const scheduler = new CronScheduler('file:../data/mastra.db');
for (const job of cronJobs) {
  scheduler.register(job);
}
scheduler.start(mastra).catch((err) => {
  console.error('[CronScheduler] Failed to start:', err);
});
