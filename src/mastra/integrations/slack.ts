import { WebClient } from '@slack/web-api';
import { getToken } from './nango';

/**
 * Get authenticated Slack WebClient.
 *
 * @param connectionId - User's connection ID in Nango
 * @returns Configured Slack WebClient
 */
export async function getSlackClient(connectionId: string): Promise<WebClient> {
  const token = await getToken('slack', connectionId);
  return new WebClient(token);
}

// ============================================================================
// Message Operations
// ============================================================================

/**
 * Send a message to a channel.
 */
export async function sendMessage(
  connectionId: string,
  channel: string,
  text: string,
  options?: {
    threadTs?: string;
    unfurlLinks?: boolean;
    unfurlMedia?: boolean;
  }
) {
  const client = await getSlackClient(connectionId);
  const response = await client.chat.postMessage({
    channel,
    text,
    thread_ts: options?.threadTs,
    unfurl_links: options?.unfurlLinks ?? true,
    unfurl_media: options?.unfurlMedia ?? true,
  });
  return response;
}

/**
 * Send a message with blocks (rich formatting).
 */
export async function sendBlockMessage(
  connectionId: string,
  channel: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blocks: any[],
  options?: {
    text?: string; // Fallback text for notifications
    threadTs?: string;
  }
) {
  const client = await getSlackClient(connectionId);
  const response = await client.chat.postMessage({
    channel,
    blocks,
    text: options?.text || 'New message',
    thread_ts: options?.threadTs,
  });
  return response;
}

/**
 * Update an existing message.
 */
export async function updateMessage(
  connectionId: string,
  channel: string,
  ts: string,
  text: string
) {
  const client = await getSlackClient(connectionId);
  const response = await client.chat.update({
    channel,
    ts,
    text,
  });
  return response;
}

/**
 * Delete a message.
 */
export async function deleteMessage(connectionId: string, channel: string, ts: string) {
  const client = await getSlackClient(connectionId);
  const response = await client.chat.delete({
    channel,
    ts,
  });
  return response;
}

/**
 * Get messages from a channel.
 */
export async function getChannelHistory(
  connectionId: string,
  channel: string,
  options?: {
    limit?: number;
    oldest?: string;
    latest?: string;
  }
) {
  const client = await getSlackClient(connectionId);
  const response = await client.conversations.history({
    channel,
    limit: options?.limit || 100,
    oldest: options?.oldest,
    latest: options?.latest,
  });
  return response.messages || [];
}

/**
 * Get thread replies.
 */
export async function getThreadReplies(
  connectionId: string,
  channel: string,
  threadTs: string
) {
  const client = await getSlackClient(connectionId);
  const response = await client.conversations.replies({
    channel,
    ts: threadTs,
  });
  return response.messages || [];
}

// ============================================================================
// Channel Operations
// ============================================================================

/**
 * List channels the user has access to.
 */
export async function listChannels(
  connectionId: string,
  options?: {
    types?: string; // e.g., "public_channel,private_channel"
    limit?: number;
  }
) {
  const client = await getSlackClient(connectionId);
  const response = await client.conversations.list({
    types: options?.types || 'public_channel,private_channel',
    limit: options?.limit || 100,
  });
  return response.channels || [];
}

/**
 * Get channel info.
 */
export async function getChannelInfo(connectionId: string, channel: string) {
  const client = await getSlackClient(connectionId);
  const response = await client.conversations.info({
    channel,
  });
  return response.channel;
}

/**
 * Join a channel.
 */
export async function joinChannel(connectionId: string, channel: string) {
  const client = await getSlackClient(connectionId);
  const response = await client.conversations.join({
    channel,
  });
  return response;
}

// ============================================================================
// User Operations
// ============================================================================

/**
 * Get info about a user.
 */
export async function getUserInfo(connectionId: string, userId: string) {
  const client = await getSlackClient(connectionId);
  const response = await client.users.info({
    user: userId,
  });
  return response.user;
}

/**
 * Get the authenticated user's info.
 */
export async function getAuthenticatedUser(connectionId: string) {
  const client = await getSlackClient(connectionId);
  const response = await client.auth.test();
  return response;
}

/**
 * List users in a workspace.
 */
export async function listUsers(connectionId: string, limit: number = 100) {
  const client = await getSlackClient(connectionId);
  const response = await client.users.list({
    limit,
  });
  return response.members || [];
}

// ============================================================================
// Reaction Operations
// ============================================================================

/**
 * Add a reaction to a message.
 */
export async function addReaction(
  connectionId: string,
  channel: string,
  ts: string,
  emoji: string
) {
  const client = await getSlackClient(connectionId);
  const response = await client.reactions.add({
    channel,
    timestamp: ts,
    name: emoji,
  });
  return response;
}

/**
 * Remove a reaction from a message.
 */
export async function removeReaction(
  connectionId: string,
  channel: string,
  ts: string,
  emoji: string
) {
  const client = await getSlackClient(connectionId);
  const response = await client.reactions.remove({
    channel,
    timestamp: ts,
    name: emoji,
  });
  return response;
}
