import { Agent } from '@mastra/core/agent';
import { getModelConfig } from '../config/model';
import { createVaultTools } from '../tools/vault-tools';
import { claudeCodeTool } from '../tools/claude-code';
import { dateTool } from '../tools/date-tool';
import { webSearchTool } from '../tools/web-search';
import type { VaultConfig } from '../config/vaults';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Create a Claude Code tool pre-bound to this folder's working directory.
 */
function createBoundClaudeCodeTool(vault: VaultConfig) {
  return createTool({
    id: `${vault.id}--claude-code`,
    description: `Run Claude Code CLI in the ${vault.name} folder for complex multi-file tasks`,
    inputSchema: z.object({
      prompt: z.string().describe('The task prompt for Claude Code'),
    }),
    outputSchema: z.object({
      output: z.string(),
      success: z.boolean(),
    }),
    execute: async ({ prompt }, ctx) => {
      return claudeCodeTool.execute!({ cwd: vault.path, prompt }, ctx);
    },
  });
}

/**
 * Create a specialized folder agent for a vault.
 * The agent deeply understands its folder's contents and rules from Agents.md.
 */
export function createFolderAgent(vault: VaultConfig): Agent {
  const vaultTools = createVaultTools(vault);
  const boundClaudeCode = createBoundClaudeCodeTool(vault);

  return new Agent({
    id: `folder-${vault.id}`,
    name: `${vault.name} Agent`,
    model: getModelConfig(),
    instructions: `You are a specialized agent managing the "${vault.name}" folder.
You deeply understand the contents, structure, and conventions of this folder — similar to how a developer understands their codebase.

## Your Agents.md Rules

${vault.rules}

## How You Work

- Use your file tools to read, write, search, list, and organize files within your folder.
- Before creating or modifying content, read existing files to understand current patterns and conventions.
- When asked to create something (a workout, a journal entry, a budget), check recent files for the format and style being used.
- For complex multi-file restructuring tasks, use the Claude Code tool.
- Always follow the rules and conventions defined in your Agents.md above.
- Be concise and action-oriented in your responses — report what you did, not what you plan to do.
- Include the relative file path when you create or modify a file.`,
    tools: {
      ...vaultTools,
      claudeCode: boundClaudeCode,
      dateTool,
      webSearchTool,
    },
  });
}
