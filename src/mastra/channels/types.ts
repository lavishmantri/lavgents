/**
 * Shared types for channel adapters.
 * A channel adapter converts platform-specific input (Telegram, Slack, web, etc.)
 * into a ChannelMessage and delivers the ChannelResponse back through the platform.
 */

export interface ChannelMessage {
  /** Normalized plain text to send to the brain agent */
  text: string;
  /** Unique conversation thread ID (chatId for Telegram, channel+ts for Slack, session for web) */
  threadId: string;
  /** User/resource identifier for memory threading */
  resourceId: string;
  /** Display name of the sender */
  senderName: string;
}

export interface ChannelResponse {
  /** The brain agent's response text */
  text: string;
  /** True if a folder agent is asking a clarifying question that must be relayed to the user */
  needsFollowUp: boolean;
}
