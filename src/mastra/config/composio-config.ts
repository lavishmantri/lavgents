import { Composio } from '@composio/core';

// Initialize Composio client
export const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY!,
});

// Get Gmail tools for a specific user (using auth config)
export async function getGmailTools(authConfigId?: string) {
  const params: { toolkits: string[]; authConfigIds?: string[] } = {
    toolkits: ['gmail'],
  };
  if (authConfigId) {
    params.authConfigIds = [authConfigId];
  }
  return composio.tools.getRawComposioTools(params);
}

// Get all integrated tools (Gmail, Calendar, Notion, etc.)
export async function getAllTools(authConfigIds?: string[]) {
  return composio.tools.getRawComposioTools({
    toolkits: ['gmail', 'googlecalendar', 'notion'],
    ...(authConfigIds ? { authConfigIds } : {}),
  });
}

// Check if user has active Gmail connection
export async function checkGmailConnection(userId: string) {
  const connections = await composio.connectedAccounts.list({
    userIds: [userId],
    statuses: ['ACTIVE'],
  });
  return connections.items?.some(conn => conn.toolkit?.slug?.toLowerCase() === 'gmail') ?? false;
}

// Get connection initiation link for OAuth
export async function getGmailConnectLink(userId: string, authConfigId: string, callbackUrl?: string) {
  const result = await composio.connectedAccounts.initiate(
    userId,
    authConfigId,
    callbackUrl ? { callbackUrl } : undefined
  );
  return result.redirectUrl;
}

// Execute a Composio tool
export async function executeComposioTool(
  toolSlug: string,
  args: Record<string, unknown>,
  userId: string
) {
  return composio.tools.execute(toolSlug, {
    userId,
    arguments: args,
    dangerouslySkipVersionCheck: true, // For development; use specific versions in production
  });
}
