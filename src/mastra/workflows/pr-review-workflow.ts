import { createStep, createWorkflow } from '@mastra/core/workflows';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import {
  prReviewInputSchema,
  fetchDiffOutputSchema,
  claudeReviewOutputSchema,
  postReviewOutputSchema,
} from '../schemas/pr-review-schemas';
import { listPullRequestFiles } from '../integrations/github';
import { addIssueComment } from '../integrations/github';

const execFile = promisify(execFileCb);

const MAX_DIFF_CHARS = 80_000;

// Step 1: Fetch the PR diff via GitHub API
const fetchDiff = createStep({
  id: 'fetch-diff',
  description: 'Fetches per-file patches for a pull request and assembles a unified diff',
  inputSchema: prReviewInputSchema,
  outputSchema: fetchDiffOutputSchema,
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error('Input data required');

    const connectionId = process.env.GITHUB_CONNECTION_ID;
    if (!connectionId) throw new Error('GITHUB_CONNECTION_ID not configured');

    const { owner, repo, pullNumber, prTitle, prBody, prAuthor } = inputData;

    const files = await listPullRequestFiles(connectionId, owner, repo, pullNumber);

    let diff = '';
    let truncated = false;

    for (const file of files) {
      const header = `diff --git a/${file.filename} b/${file.filename}\n--- a/${file.filename}\n+++ b/${file.filename}\n`;
      const patch = file.patch || '';
      const chunk = header + patch + '\n';

      if (diff.length + chunk.length > MAX_DIFF_CHARS) {
        diff += `\n... (diff truncated — ${files.length - files.indexOf(file)} files remaining)\n`;
        truncated = true;
        break;
      }

      diff += chunk;
    }

    return {
      owner,
      repo,
      pullNumber,
      prTitle,
      prBody,
      prAuthor,
      diff,
      fileCount: files.length,
      truncated,
    };
  },
});

// Step 2: Run claude CLI in print mode to generate a code review
const runClaudeReview = createStep({
  id: 'run-claude-review',
  description: 'Invokes the claude CLI in print mode to generate a code review',
  inputSchema: fetchDiffOutputSchema,
  outputSchema: claudeReviewOutputSchema,
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error('Input data required');

    const { owner, repo, pullNumber, prTitle, prBody, prAuthor, diff, fileCount, truncated } = inputData;

    const prompt = `You are reviewing a GitHub pull request. Provide a thorough code review.

## PR Details
- **Title**: ${prTitle}
- **Author**: ${prAuthor}
- **Repository**: ${owner}/${repo}
- **PR #${pullNumber}**
${prBody ? `- **Description**: ${prBody}` : ''}
- **Files changed**: ${fileCount}${truncated ? ' (diff was truncated)' : ''}

## Diff
\`\`\`diff
${diff}
\`\`\`

## Review Instructions
Please review the code changes above. Focus on:
1. **Bugs** — logic errors, off-by-one, null/undefined risks
2. **Security** — injection, auth issues, secrets exposure
3. **Code quality** — readability, naming, duplication
4. **Suggestions** — concrete improvements with code snippets where helpful

Be concise. Skip files that look fine. Only comment on things that matter.`;

    const { stdout } = await execFile('claude', ['-p', prompt], {
      timeout: 5 * 60 * 1000, // 5 minutes
      maxBuffer: 10 * 1024 * 1024, // 10 MB
    });

    return {
      owner,
      repo,
      pullNumber,
      reviewBody: stdout.trim(),
    };
  },
});

// Step 3: Post the review as a comment on the PR
const postReviewComment = createStep({
  id: 'post-review-comment',
  description: 'Posts the code review as an issue comment on the pull request',
  inputSchema: claudeReviewOutputSchema,
  outputSchema: postReviewOutputSchema,
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error('Input data required');

    const connectionId = process.env.GITHUB_CONNECTION_ID;
    if (!connectionId) throw new Error('GITHUB_CONNECTION_ID not configured');

    const { owner, repo, pullNumber, reviewBody } = inputData;

    const body = `## Claude Code Review\n\n${reviewBody}\n\n---\n*Automated review by [Claude Code](https://claude.ai/claude-code)*`;

    try {
      const comment = await addIssueComment(connectionId, owner, repo, pullNumber, body);
      return {
        success: true,
        commentId: comment.id,
        commentUrl: comment.html_url,
      };
    } catch (err) {
      console.error('[PR Review] Failed to post comment:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  },
});

const prReviewWorkflow = createWorkflow({
  id: 'pr-review-workflow',
  inputSchema: prReviewInputSchema,
  outputSchema: postReviewOutputSchema,
})
  .then(fetchDiff)
  .then(runClaudeReview)
  .then(postReviewComment);

prReviewWorkflow.commit();

export { prReviewWorkflow };
