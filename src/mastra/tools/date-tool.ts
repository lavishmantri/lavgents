import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const dateTool = createTool({
  id: 'get-current-date',
  description: 'Get the current date and time. Useful for creating dated files, timestamps, or time-aware decisions.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    iso: z.string().describe('ISO 8601 timestamp'),
    date: z.string().describe('YYYY-MM-DD format'),
    time: z.string().describe('HH:MM format'),
    dayOfWeek: z.string(),
  }),
  execute: async () => {
    const now = new Date();
    return {
      iso: now.toISOString(),
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().slice(0, 5),
      dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
    };
  },
});
