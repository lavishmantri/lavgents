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
- Include the relative file path when you create or modify a file.
- When a task is ambiguous (e.g., unclear which subfolder to use, or how to format something), ask a specific question. Keep it short: prefer "Should I file this under [A] or [B]?" over open-ended questions.

## Self-Improvement

You have an updateAgentsMd tool to record learnings into your Agents.md, making you smarter over time.

**Auto-save immediately** (requiresConfirmation: false):
- When the user explicitly corrects you: "no, do it like X", "always use Y format"
- When the user states a rule: "receipts go in financial/receipts", "use ISO dates"

**Ask before saving** (requiresConfirmation: true):
- When you notice a pattern across existing files that isn't documented
- When you infer a preference that wasn't explicitly stated

Rules to follow:
- Write learnings as concise rules, not narratives
- Only record things useful across multiple future interactions
- Never record one-time facts or ephemeral details`,
    tools: {
      ...vaultTools,
      claudeCode: boundClaudeCode,
      dateTool,
      webSearchTool,
    },
  });
}
