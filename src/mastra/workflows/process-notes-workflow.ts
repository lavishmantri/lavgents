import { createStep, createWorkflow } from '@mastra/core/workflows';
import { join } from 'node:path';
import { processNotesInputSchema, processNotesOutputSchema } from '../schemas/process-notes-schemas';
import { listMdFiles, readMdFile } from '../tools/read-utils';
import { NOTES_ROOT } from '../config/paths';

const scanAndProcess = createStep({
  id: 'scan-and-process',
  description: 'Scans telegram directory for unprocessed notes and starts a noteRouterWorkflow for each',
  inputSchema: processNotesInputSchema,
  outputSchema: processNotesOutputSchema,
  execute: async ({ mastra }) => {
    const telegramDir = join(NOTES_ROOT, 'telegram');
    const files = await listMdFiles(telegramDir);

    let processed = 0;
    let skipped = 0;

    for (const filePath of files) {
      const { frontmatter } = await readMdFile(filePath);
      if (frontmatter.status !== 'unprocessed') {
        skipped++;
        continue;
      }

      const workflow = mastra?.getWorkflow('noteRouterWorkflow');
      if (!workflow) throw new Error('noteRouterWorkflow not found');

      const run = await workflow.createRun();
      run.start({ inputData: { filePath } }).catch((err: unknown) => {
        console.error(`[ProcessNotes] Workflow failed for ${filePath}:`, err);
      });

      processed++;
    }

    return { processed, skipped };
  },
});

const processNotesWorkflow = createWorkflow({
  id: 'process-notes-workflow',
  inputSchema: processNotesInputSchema,
  outputSchema: processNotesOutputSchema,
})
  .then(scanAndProcess);

processNotesWorkflow.commit();

export { processNotesWorkflow };
