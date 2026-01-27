import { Octokit } from '@octokit/rest';
import { getToken } from './nango';

/**
 * Get authenticated Octokit client for GitHub API.
 *
 * @param connectionId - User's connection ID in Nango
 * @returns Configured Octokit instance
 */
export async function getOctokit(connectionId: string): Promise<Octokit> {
  const token = await getToken('github', connectionId);
  return new Octokit({ auth: token });
}

// ============================================================================
// Repository Operations
// ============================================================================

/**
 * List repositories for the authenticated user.
 */
export async function listRepositories(
  connectionId: string,
  options?: {
    type?: 'all' | 'owner' | 'member';
    sort?: 'created' | 'updated' | 'pushed' | 'full_name';
    perPage?: number;
  }
) {
  const octokit = await getOctokit(connectionId);
  const response = await octokit.repos.listForAuthenticatedUser({
    type: options?.type || 'all',
    sort: options?.sort || 'updated',
    per_page: options?.perPage || 30,
  });
  return response.data;
}

/**
 * Get a specific repository.
 */
export async function getRepository(connectionId: string, owner: string, repo: string) {
  const octokit = await getOctokit(connectionId);
  const response = await octokit.repos.get({ owner, repo });
  return response.data;
}

// ============================================================================
// Issue Operations
// ============================================================================

/**
 * List issues for a repository.
 */
export async function listIssues(
  connectionId: string,
  owner: string,
  repo: string,
  options?: {
    state?: 'open' | 'closed' | 'all';
    labels?: string;
    assignee?: string;
    perPage?: number;
  }
) {
  const octokit = await getOctokit(connectionId);
  const response = await octokit.issues.listForRepo({
    owner,
    repo,
    state: options?.state || 'open',
    labels: options?.labels,
    assignee: options?.assignee,
    per_page: options?.perPage || 30,
  });
  return response.data;
}

/**
 * Create an issue.
 */
export async function createIssue(
  connectionId: string,
  owner: string,
  repo: string,
  issue: {
    title: string;
    body?: string;
    labels?: string[];
    assignees?: string[];
  }
) {
  const octokit = await getOctokit(connectionId);
  const response = await octokit.issues.create({
    owner,
    repo,
    ...issue,
  });
  return response.data;
}

/**
 * Add a comment to an issue.
 */
export async function addIssueComment(
  connectionId: string,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
) {
  const octokit = await getOctokit(connectionId);
  const response = await octokit.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
  return response.data;
}

// ============================================================================
// Pull Request Operations
// ============================================================================

/**
 * List pull requests for a repository.
 */
export async function listPullRequests(
  connectionId: string,
  owner: string,
  repo: string,
  options?: {
    state?: 'open' | 'closed' | 'all';
    head?: string;
    base?: string;
    perPage?: number;
  }
) {
  const octokit = await getOctokit(connectionId);
  const response = await octokit.pulls.list({
    owner,
    repo,
    state: options?.state || 'open',
    head: options?.head,
    base: options?.base,
    per_page: options?.perPage || 30,
  });
  return response.data;
}

/**
 * Get a specific pull request.
 */
export async function getPullRequest(
  connectionId: string,
  owner: string,
  repo: string,
  pullNumber: number
) {
  const octokit = await getOctokit(connectionId);
  const response = await octokit.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  });
  return response.data;
}

/**
 * Create a pull request.
 */
export async function createPullRequest(
  connectionId: string,
  owner: string,
  repo: string,
  pr: {
    title: string;
    head: string;
    base: string;
    body?: string;
    draft?: boolean;
  }
) {
  const octokit = await getOctokit(connectionId);
  const response = await octokit.pulls.create({
    owner,
    repo,
    ...pr,
  });
  return response.data;
}

/**
 * Add a review comment to a pull request.
 */
export async function addPullRequestReviewComment(
  connectionId: string,
  owner: string,
  repo: string,
  pullNumber: number,
  comment: {
    body: string;
    commitId: string;
    path: string;
    line: number;
  }
) {
  const octokit = await getOctokit(connectionId);
  const response = await octokit.pulls.createReviewComment({
    owner,
    repo,
    pull_number: pullNumber,
    body: comment.body,
    commit_id: comment.commitId,
    path: comment.path,
    line: comment.line,
  });
  return response.data;
}

// ============================================================================
// User Operations
// ============================================================================

/**
 * Get authenticated user info.
 */
export async function getAuthenticatedUser(connectionId: string) {
  const octokit = await getOctokit(connectionId);
  const response = await octokit.users.getAuthenticated();
  return response.data;
}
