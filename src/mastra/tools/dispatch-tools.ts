import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { Agent } from '@mastra/core/agent';
import type { VaultConfig } from '../config/vaults';

/**
 * Extract a short description from an Agents.md file.
 * Uses the first non-heading, non-empty paragraph as the tool description.
 */
function extractDescription(rules: string, fallbackName: string): string {
  const lines = rules.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
    // Take first meaningful paragraph line, truncate if needed
    return trimmed.length > 200 ? trimmed.slice(0, 200) + '...' : trimmed;
  }
  return `Delegate tasks to the ${fallbackName} folder agent`;
}

/**
 * Create a dispatch tool that the main agent uses to delegate work to a folder agent.
 * The tool description is derived from the vault's Agents.md so the LLM can make smart routing decisions.
 */
export function createDispatchTool(vault: VaultConfig, folderAgent: Agent) {
  const description = extractDescription(vault.rules, vault.name);

  return createTool({
    id: `dispatch-${vault.id}`,
    description: `[${vault.name}] ${description}`,
    inputSchema: z.object({
      message: z.string().describe('The task or message to send to the folder agent'),
      context: z.string().optional().describe('Additional context from the conversation'),
    }),
    outputSchema: z.object({
      response: z.string(),
    }),
    execute: async ({ message, context }) => {
      const prompt = context ? `Context: ${context}\n\nTask: ${message}` : message;
      const result = await folderAgent.generate([{ role: 'user', content: prompt }]);
      return { response: result.text };
    },
  });
}
