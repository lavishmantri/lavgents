import { createStep, createWorkflow } from '@mastra/core/workflows';
import { join } from 'node:path';
import { readdir, readFile, mkdir, copyFile, unlink, writeFile } from 'node:fs/promises';
import { HIRING_FOLDER } from '../config/hiring-paths';
import { readPdf } from '../tools/pdf-utils';
import { getScreeningPrompt } from '../agents/hiring-screening-agent';
import { getInterviewPrepPrompt } from '../agents/hiring-interview-prep-agent';
import { hiringPipelineInputSchema, hiringPipelineOutputSchema } from '../schemas/hiring-pipeline-schemas';

function detectRole(resumeText: string): 'backend' | 'frontend' {
  const text = resumeText.toLowerCase();

  const backendKeywords = [
    'python', 'fastapi', 'django', 'flask', 'backend', 'api', 'microservices',
    'kubernetes', 'docker', 'aws', 'gcp', 'distributed systems', 'kafka',
    'redis', 'postgresql', 'mongodb', 'celery', 'rabbitmq', 'queue', 'event-driven',
  ];

  const frontendKeywords = [
    'react', 'next.js', 'nextjs', 'typescript', 'javascript', 'frontend',
    'front-end', 'ui', 'ux', 'css', 'tailwind', 'shadcn', 'react native',
    'angular', 'vue', 'redux', 'state management', 'component', 'responsive',
  ];

  let backendScore = 0;
  let frontendScore = 0;

  for (const keyword of backendKeywords) {
    if (text.includes(keyword)) {
      backendScore++;
    }
  }

  for (const keyword of frontendKeywords) {
    if (text.includes(keyword)) {
      frontendScore++;
    }
  }

  return backendScore > frontendScore ? 'backend' : 'frontend';
}

function extractCandidateName(resumeText: string): { name: string; normalizedName: string } {
  const lines = resumeText.split('\n').filter((line) => line.trim().length > 0);

  let name = '';
  for (const line of lines.slice(0, 5)) {
    const trimmed = line.trim();
    if (
      trimmed.includes('@') ||
      trimmed.match(/^\+?\d[\d\s-]{8,}/) ||
      trimmed.toLowerCase().includes('linkedin') ||
      trimmed.toLowerCase().includes('github') ||
      trimmed.toLowerCase().includes('http')
    ) {
      continue;
    }
    if (trimmed.length > 50) continue;
    if (trimmed.length >= 2) {
      name = trimmed;
      break;
    }
  }

  if (!name && lines.length > 0) {
    name = lines[0].trim();
  }

  const normalizedName = name
    .toLowerCase()
    .replace(/[^a-z\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

  return { name, normalizedName };
}

async function getExistingCandidateNames(hiringFolder: string): Promise<Set<string>> {
  const existingFolders = new Set<string>();

  const addFolders = async (dirPath: string) => {
    try {
      const dirents = await readdir(dirPath, { withFileTypes: true });
      for (const d of dirents) {
        if (d.isDirectory()) {
          existingFolders.add(d.name.toLowerCase());
        }
      }
    } catch {
      // Directory might not exist
    }
  };

  await Promise.all([
    addFolders(join(hiringFolder, 'candidates')),
    addFolders(join(hiringFolder, 'archive', 'rejected')),
    addFolders(join(hiringFolder, 'archive', 'approved')),
  ]);

  return existingFolders;
}

function isResumeProcessed(pdfPath: string, existingFolders: Set<string>): boolean {
  const fileName = pdfPath
    .replace(/^.*[\\/]/, '')
    .replace(/\.pdf$/i, '')
    .toLowerCase();
  const normalizedFileName = fileName
    .replace(/[^a-z\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

  for (const folder of existingFolders) {
    if (folder.includes(normalizedFileName)) {
      return true;
    }
  }
  return false;
}

const scanAndProcess = createStep({
  id: 'scan-and-process',
  description: 'Scans hiring folder for unprocessed PDFs and generates screening + interview prep docs',
  inputSchema: hiringPipelineInputSchema,
  outputSchema: hiringPipelineOutputSchema,
  execute: async ({ mastra }) => {
    const dirents = await readdir(HIRING_FOLDER, { withFileTypes: true });
    const pdfFiles = dirents
      .filter((d) => !d.isDirectory() && d.name.toLowerCase().endsWith('.pdf'))
      .map((d) => join(HIRING_FOLDER, d.name));

    const existingFolders = await getExistingCandidateNames(HIRING_FOLDER);

    const unprocessedPdfFiles = pdfFiles.filter((pdfPath) => !isResumeProcessed(pdfPath, existingFolders));
    const skippedCount = pdfFiles.length - unprocessedPdfFiles.length;

    const results: Array<{ name: string; role: string; status: string; error?: string }> = [];

    for (const pdfPath of unprocessedPdfFiles) {
      let candidateName = '';
      let role: 'backend' | 'frontend' = 'backend';

      try {
        const { text: resumeText } = await readPdf(pdfPath);
        role = detectRole(resumeText);
        const extracted = extractCandidateName(resumeText);
        candidateName = extracted.name;

        const roleFilePath = join(HIRING_FOLDER, 'roles', `${role}-engineer.md`);
        const roleFileContent = await readFile(roleFilePath, 'utf-8');

        const date = new Date().toISOString().split('T')[0];
        const candidateFolderName = `${date}_${extracted.normalizedName}_${role}`;
        const candidateFolderPath = join(HIRING_FOLDER, 'candidates', candidateFolderName);
        await mkdir(candidateFolderPath, { recursive: true });

        const resumeDestPath = join(candidateFolderPath, 'resume.pdf');
        await copyFile(pdfPath, resumeDestPath);
        await unlink(pdfPath);

        const screeningAgent = mastra?.getAgent('hiring-screening-agent');
        if (!screeningAgent) throw new Error('hiring-screening-agent not found');

        const screeningPrompt = getScreeningPrompt(resumeText, role, roleFileContent);
        const screeningResponse = await screeningAgent.generate([{ role: 'user', content: screeningPrompt }]);
        const screeningContent = screeningResponse.text || '';
        await writeFile(join(candidateFolderPath, 'screening.md'), screeningContent, 'utf-8');

        const interviewPrepAgent = mastra?.getAgent('hiring-interview-prep-agent');
        if (!interviewPrepAgent) throw new Error('hiring-interview-prep-agent not found');

        const interviewPrepPrompt = getInterviewPrepPrompt(
          resumeText,
          screeningContent,
          roleFileContent,
          role,
        );
        const interviewPrepResponse = await interviewPrepAgent.generate([{ role: 'user', content: interviewPrepPrompt }]);
        const interviewPrepContent = interviewPrepResponse.text || '';
        await writeFile(join(candidateFolderPath, 'interview-prep.md'), interviewPrepContent, 'utf-8');

        results.push({
          name: candidateName,
          role,
          status: 'success',
        });
      } catch (error) {
        results.push({
          name: candidateName || pdfPath.replace(/^.*[\\/]/, '').replace(/\.pdf$/i, ''),
          role,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      scannedCount: pdfFiles.length,
      skippedCount,
      processedCount: unprocessedPdfFiles.length,
      results,
    };
  },
});

const hiringPipelineWorkflow = createWorkflow({
  id: 'hiring-pipeline-workflow',
  inputSchema: hiringPipelineInputSchema,
  outputSchema: hiringPipelineOutputSchema,
})
  .then(scanAndProcess);

hiringPipelineWorkflow.commit();

export { hiringPipelineWorkflow };
