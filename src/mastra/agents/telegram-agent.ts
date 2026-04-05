import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { getModelConfig } from '../config/model';
import { discoverVaults, readParentAgentsMd } from '../config/vaults';
import { createFolderAgent } from './folder-agent';
import { createDispatchTool } from '../tools/dispatch-tools';
import { sendReplyTool, sendKeyboardTool } from '../tools/telegram-tools';
import { dateTool } from '../tools/date-tool';
import { webSearchTool } from '../tools/web-search';
import { weatherTool } from '../tools/weather-tool';

export interface TelegramAgentBundle {
  telegramAgent: Agent;
  folderAgents: Agent[];
}

/**
 * Build the main Telegram listener agent and all folder agents.
 * Discovers vaults from NOTES_ROOT, creates a folder agent per vault,
 * and wires dispatch tools into the main agent.
 */
export async function buildTelegramAgent(): Promise<TelegramAgentBundle> {
  const vaults = await discoverVaults();
  const parentRules = await readParentAgentsMd();

  const folderAgents: Agent[] = [];
  const dispatchTools: Record<string, ReturnType<typeof createDispatchTool>> = {};

  for (const vault of vaults) {
    const agent = createFolderAgent(vault);
    folderAgents.push(agent);
    dispatchTools[`dispatch_${vault.id}`] = createDispatchTool(vault, agent);
  }

  // Build vault listing for the system prompt
  const vaultList = vaults
    .map(v => {
      const firstLine = v.rules.split('\n').find(l => l.trim() && !l.startsWith('#'))?.trim() || v.name;
      return `- **${v.name}** (tool: dispatch_${v.id}): ${firstLine}`;
    })
    .join('\n');

  const instructions = `You are a personal AI assistant accessible via Telegram.
You are smart, conversational, and action-oriented.

${parentRules ? `## Global Rules\n\n${parentRules}\n` : ''}
## Available Folder Agents

You can delegate tasks to specialized folder agents. Each agent deeply understands its folder's contents and conventions.

${vaultList || 'No folder agents discovered. Create Agents.md files in subdirectories of the notes root to enable them.'}

## How You Work

1. **Smart delegation**: When a message relates to a specific folder's domain (workout, finance, journal, etc.), delegate to that folder's agent using the appropriate dispatch tool. The folder agent will handle all file operations.
2. **Handle general tasks yourself**: For weather, general questions, web searches, date/time, or anything that doesn't belong to a specific folder — handle it directly with your own tools.
3. **Always reply**: After processing (whether you handled it or delegated), use the send-telegram-reply tool to respond to the user with a concise summary of what was done.
4. **Conversational**: You remember prior messages in a conversation. Use context from earlier messages when relevant.
5. **Ask when unsure**: If a message could go to multiple folders or you're not sure where it belongs, ask the user.
6. **Be concise**: Telegram messages should be brief and to the point. Use markdown formatting sparingly.`;

  const telegramAgent = new Agent({
    id: 'telegram-listener-agent',
    name: 'Telegram Listener Agent',
    model: getModelConfig(),
    instructions,
    tools: {
      ...dispatchTools,
      sendReply: sendReplyTool,
      sendKeyboard: sendKeyboardTool,
      dateTool,
      webSearchTool,
      weatherTool,
    },
    memory: new Memory(),
  });

  return { telegramAgent, folderAgents };
}
