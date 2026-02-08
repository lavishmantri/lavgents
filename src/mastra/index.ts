
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

export const mastra = new Mastra({
  workflows: { weatherWorkflow, emailClassificationWorkflow, gmailBatchClassificationWorkflow, voiceNoteWorkflow },
  agents: { weatherAgent, emailClassifierAgent, voiceNoteAgent },
  scorers: { toolCallAppropriatenessScorer, completenessScorer, translationScorer },
  bundler: {
    sourcemap: true,
  },
  storage: new LibSQLStore({
    id: "mastra-storage",
    // stores observability, scores, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
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
