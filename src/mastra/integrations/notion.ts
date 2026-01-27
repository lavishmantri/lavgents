import { Client } from '@notionhq/client';
import { getToken, hasConnection } from './nango';

/**
 * Get authenticated Notion client.
 * Supports both OAuth (via Nango) and API key authentication.
 *
 * @param connectionId - User's connection ID in Nango (for OAuth)
 * @returns Configured Notion client
 */
export async function getNotionClient(connectionId: string): Promise<Client> {
  // First try OAuth via Nango
  const hasOAuth = await hasConnection('notion', connectionId);

  if (hasOAuth) {
    const token = await getToken('notion', connectionId);
    return new Client({ auth: token });
  }

  // Fall back to API key if no OAuth connection
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    throw new Error('No Notion OAuth connection and NOTION_API_KEY not set');
  }
  return new Client({ auth: apiKey });
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Query a Notion database.
 */
export async function queryDatabase(
  connectionId: string,
  databaseId: string,
  options?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filter?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sorts?: any[];
    pageSize?: number;
    startCursor?: string;
  }
) {
  const client = await getNotionClient(connectionId);
  const response = await client.databases.query({
    database_id: databaseId,
    filter: options?.filter,
    sorts: options?.sorts,
    page_size: options?.pageSize,
    start_cursor: options?.startCursor,
  });
  return response;
}

/**
 * Get database metadata.
 */
export async function getDatabase(connectionId: string, databaseId: string) {
  const client = await getNotionClient(connectionId);
  const response = await client.databases.retrieve({
    database_id: databaseId,
  });
  return response;
}

/**
 * Create a new page in a database.
 */
export async function createDatabasePage(
  connectionId: string,
  databaseId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  children?: any[]
) {
  const client = await getNotionClient(connectionId);
  const response = await client.pages.create({
    parent: { database_id: databaseId },
    properties,
    children,
  });
  return response;
}

// ============================================================================
// Page Operations
// ============================================================================

/**
 * Get a page by ID.
 */
export async function getPage(connectionId: string, pageId: string) {
  const client = await getNotionClient(connectionId);
  const response = await client.pages.retrieve({
    page_id: pageId,
  });
  return response;
}

/**
 * Update page properties.
 */
export async function updatePage(
  connectionId: string,
  pageId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties: Record<string, any>
) {
  const client = await getNotionClient(connectionId);
  const response = await client.pages.update({
    page_id: pageId,
    properties,
  });
  return response;
}

/**
 * Archive (delete) a page.
 */
export async function archivePage(connectionId: string, pageId: string) {
  const client = await getNotionClient(connectionId);
  const response = await client.pages.update({
    page_id: pageId,
    archived: true,
  });
  return response;
}

// ============================================================================
// Block Operations
// ============================================================================

/**
 * Get page content (blocks).
 */
export async function getPageContent(
  connectionId: string,
  pageId: string,
  options?: {
    pageSize?: number;
    startCursor?: string;
  }
) {
  const client = await getNotionClient(connectionId);
  const response = await client.blocks.children.list({
    block_id: pageId,
    page_size: options?.pageSize,
    start_cursor: options?.startCursor,
  });
  return response;
}

/**
 * Append blocks to a page.
 */
export async function appendBlocks(
  connectionId: string,
  pageId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  children: any[]
) {
  const client = await getNotionClient(connectionId);
  const response = await client.blocks.children.append({
    block_id: pageId,
    children,
  });
  return response;
}

/**
 * Delete a block.
 */
export async function deleteBlock(connectionId: string, blockId: string) {
  const client = await getNotionClient(connectionId);
  const response = await client.blocks.delete({
    block_id: blockId,
  });
  return response;
}

// ============================================================================
// Search Operations
// ============================================================================

/**
 * Search across all pages and databases.
 */
export async function search(
  connectionId: string,
  query: string,
  options?: {
    filter?: { property: 'object'; value: 'page' | 'database' };
    pageSize?: number;
    startCursor?: string;
  }
) {
  const client = await getNotionClient(connectionId);
  const response = await client.search({
    query,
    filter: options?.filter,
    page_size: options?.pageSize,
    start_cursor: options?.startCursor,
  });
  return response;
}

// ============================================================================
// User Operations
// ============================================================================

/**
 * List all users in the workspace.
 */
export async function listUsers(connectionId: string) {
  const client = await getNotionClient(connectionId);
  const response = await client.users.list({});
  return response.results;
}

/**
 * Get current bot user info.
 */
export async function getMe(connectionId: string) {
  const client = await getNotionClient(connectionId);
  const response = await client.users.me({});
  return response;
}
