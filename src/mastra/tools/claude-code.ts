import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

export const claudeCodeTool = createTool({
  id: 'run-claude-code',
  description:
    'Spawn Claude Code CLI in a specific folder for complex tasks like restructuring files, refactoring content, or multi-file edits. Use this for tasks too complex for simple read/write tools.',
  inputSchema: z.object({
    cwd: z.string().describe('Working directory to run Claude Code in'),
    prompt: z.string().describe('The task prompt for Claude Code'),
  }),
  outputSchema: z.object({
    output: z.string(),
    success: z.boolean(),
  }),
  execute: async ({ cwd, prompt }) => {
    try {
      const { stdout } = await execFile('claude', ['-p', prompt], {
        cwd,
        timeout: 5 * 60 * 1000, // 5 minutes
        maxBuffer: 10 * 1024 * 1024, // 10 MB
      });
      return { output: stdout.trim(), success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { output: message, success: false };
    }
  },
});
