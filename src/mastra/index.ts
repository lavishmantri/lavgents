
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
import { registerApiRoute } from '@mastra/core/server';
import { telegramWebhookHandler, processNotesHandler } from './webhooks/handlers';
import cron from 'node-cron';

export const mastra = new Mastra({
  workflows: {
    weatherWorkflow,
    emailClassificationWorkflow,
    gmailBatchClassificationWorkflow,
    voiceNoteWorkflow,
    telegramNoteWorkflow,
    noteRouterWorkflow,
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
      registerApiRoute('/api/process-notes', {
        method: 'POST',
        handler: async (c: { json: (data: unknown, status?: number) => Response; get: (key: string) => unknown }) => {
          try {
            const m = c.get('mastra') as Mastra;
            const result = await processNotesHandler(m);
            return c.json(result);
          } catch (err) {
            console.error('[ProcessNotes] Error:', err);
            return c.json({ error: 'Processing failed' }, 500);
          }
        },
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

// Process unprocessed notes every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  console.log('[Cron] Processing unprocessed notes...');
  try {
    const result = await processNotesHandler(mastra);
    console.log(`[Cron] Processed: ${result.processed}, Skipped: ${result.skipped}`);
  } catch (err) {
    console.error('[Cron] Error processing notes:', err);
  }
});
