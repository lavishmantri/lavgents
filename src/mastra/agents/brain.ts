import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { getModelConfig } from '../config/model';
import { discoverVaults, readParentAgentsMd } from '../config/vaults';
import { createFolderAgent } from './folder-agent';
import { createDispatchTool } from '../tools/dispatch-tools';
import { dateTool } from '../tools/date-tool';
import { webSearchTool } from '../tools/web-search';
import { weatherTool } from '../tools/weather-tool';
import { saveNoteTool } from '../tools/save-note';

export interface BrainBundle {
  brainiac: Agent;
  folderAgents: Agent[];
}

/**
 * Build the Brainiac second-brain orchestrator and all folder agents.
 * Discovers vaults from NOTES_ROOT, creates a folder agent per vault,
 * and wires dispatch tools into the main agent.
 * The brain is channel-agnostic — it knows nothing about Telegram, Slack, etc.
 */
export async function buildBrain(): Promise<BrainBundle> {
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

  const instructions = `You are Brainiac, a personal second brain assistant.
You help manage knowledge, notes, tasks, and information across different areas of life.
You are smart, conversational, and action-oriented.

${parentRules ? `## Global Rules\n\n${parentRules}\n` : ''}
## Available Folder Agents

You can delegate tasks to specialized folder agents. Each agent deeply understands its folder's contents and conventions.

${vaultList || 'No folder agents discovered yet. Drop an Agents.md file into any subfolder of the notes root to activate it.'}

## How You Work

1. **Save substantive input first**: For any message that contains information worth keeping (workout logs, meals, ideas, tasks, goals, notes), call the save-note tool first to persist a raw copy. Skip this for ephemeral queries (weather, date, quick questions).
2. **Smart delegation**: When a message relates to a specific folder's domain (workouts, finance, travel, journal, etc.), delegate to that folder's agent using the appropriate dispatch tool. The folder agent handles all file operations including structuring and organizing the information.
3. **Handle general tasks yourself**: For weather, general questions, web searches, date/time, or anything that doesn't belong to a specific folder — handle it directly with your own tools.
4. **Relay follow-up questions**: If a dispatch tool returns needsFollowUp=true, relay the folder agent's question to the user verbatim. When the user responds, dispatch to the same folder agent again with the answer as context.
5. **Conversational memory**: You remember prior messages in a conversation. Use context from earlier messages when relevant.
6. **Ask when unsure**: If a message could go to multiple folders or you're not sure where it belongs, ask the user.
7. **Be concise**: Keep responses short and to the point. Use markdown formatting when it helps readability.`;

  const brainiac = new Agent({
    id: 'brainiac',
    name: 'Second Brain Assistant',
    model: getModelConfig(),
    instructions,
    tools: {
      ...dispatchTools,
      saveNote: saveNoteTool,
      dateTool,
      webSearchTool,
      weatherTool,
    },
    memory: new Memory(),
  });

  return { brainiac, folderAgents };
}
