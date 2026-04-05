import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const webSearchTool = createTool({
  id: 'web-search',
  description: 'Search the web for information. Returns search results with titles, URLs, and snippets.',
  inputSchema: z.object({
    query: z.string().describe('Search query'),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
    })),
  }),
  execute: async ({ query }) => {
    // Placeholder — wire to a search provider (Brave, SerpAPI, Tavily, etc.)
    return {
      results: [
        {
          title: 'Web search not configured',
          url: '',
          snippet: `Searched for: "${query}". Configure a search provider in src/mastra/tools/web-search.ts to enable web search.`,
        },
      ],
    };
  },
});
