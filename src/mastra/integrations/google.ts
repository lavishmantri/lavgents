import { google, gmail_v1, calendar_v3, drive_v3 } from 'googleapis';
import { getToken } from './nango';

/**
 * Create an authenticated OAuth2 client with Nango-managed token.
 *
 * @param connectionId - User's connection ID in Nango
 * @returns Configured OAuth2 client
 */
async function getAuthClient(connectionId: string) {
  const token = await getToken('google', connectionId);
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  return auth;
}

/**
 * Get authenticated Gmail client.
 *
 * @param connectionId - User's connection ID in Nango
 * @returns Gmail API client
 */
export async function getGmail(connectionId: string): Promise<gmail_v1.Gmail> {
  const auth = await getAuthClient(connectionId);
  return google.gmail({ version: 'v1', auth });
}

/**
 * Get authenticated Google Calendar client.
 *
 * @param connectionId - User's connection ID in Nango
 * @returns Calendar API client
 */
export async function getCalendar(connectionId: string): Promise<calendar_v3.Calendar> {
  const auth = await getAuthClient(connectionId);
  return google.calendar({ version: 'v3', auth });
}

/**
 * Get authenticated Google Drive client.
 *
 * @param connectionId - User's connection ID in Nango
 * @returns Drive API client
 */
export async function getDrive(connectionId: string): Promise<drive_v3.Drive> {
  const auth = await getAuthClient(connectionId);
  return google.drive({ version: 'v3', auth });
}

// ============================================================================
// Gmail Helper Functions
// ============================================================================

export interface GmailMessage {
  id: string;
  threadId: string;
  from: { name: string; email: string };
  to: Array<{ name: string; email: string }>;
  subject: string;
  body: string;
  date: string;
  labels: string[];
  hasAttachments: boolean;
}

/**
 * Fetch emails from Gmail matching a query.
 *
 * @param connectionId - User's connection ID
 * @param query - Gmail search query (e.g., "in:inbox after:2024/01/01")
 * @param maxResults - Maximum number of emails to fetch
 * @returns Array of normalized email messages
 */
export async function fetchEmails(
  connectionId: string,
  query: string,
  maxResults: number = 50
): Promise<GmailMessage[]> {
  const gmail = await getGmail(connectionId);

  // List message IDs matching query
  const listResponse = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults,
  });

  const messageIds = listResponse.data.messages || [];

  // Fetch full message details in parallel
  const messages = await Promise.all(
    messageIds.map(async (msg) => {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'full',
      });
      return parseGmailMessage(detail.data);
    })
  );

  return messages;
}

/**
 * Parse Gmail API message into normalized format.
 */
function parseGmailMessage(message: gmail_v1.Schema$Message): GmailMessage {
  const headers = message.payload?.headers || [];
  const getHeader = (name: string): string =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

  const fromHeader = getHeader('from');
  const toHeader = getHeader('to');

  return {
    id: message.id || '',
    threadId: message.threadId || '',
    from: parseEmailAddress(fromHeader),
    to: toHeader.split(',').map((addr) => parseEmailAddress(addr.trim())),
    subject: getHeader('subject'),
    body: extractBody(message.payload),
    date: getHeader('date'),
    labels: message.labelIds || [],
    hasAttachments: hasAttachments(message.payload),
  };
}

/**
 * Parse "Name <email@example.com>" format.
 */
function parseEmailAddress(raw: string): { name: string; email: string } {
  const match = raw.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+)>?$/);
  if (match) {
    return {
      name: match[1]?.trim() || '',
      email: match[2]?.trim() || raw,
    };
  }
  return { name: '', email: raw };
}

/**
 * Extract plain text body from message payload.
 */
function extractBody(payload?: gmail_v1.Schema$MessagePart): string {
  if (!payload) return '';

  // Direct body
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }

  // Multipart - find text/plain or text/html
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }
    // Fallback to HTML if no plain text
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = Buffer.from(part.body.data, 'base64').toString('utf-8');
        return stripHtml(html);
      }
    }
    // Recurse into nested parts
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  return '';
}

/**
 * Simple HTML tag stripper.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if message has attachments.
 */
function hasAttachments(payload?: gmail_v1.Schema$MessagePart): boolean {
  if (!payload) return false;
  if (payload.filename && payload.filename.length > 0) return true;
  if (payload.parts) {
    return payload.parts.some((part) => hasAttachments(part));
  }
  return false;
}

/**
 * Add labels to a message.
 */
export async function addLabels(
  connectionId: string,
  messageId: string,
  labelIds: string[]
): Promise<void> {
  const gmail = await getGmail(connectionId);
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      addLabelIds: labelIds,
    },
  });
}

/**
 * Remove labels from a message.
 */
export async function removeLabels(
  connectionId: string,
  messageId: string,
  labelIds: string[]
): Promise<void> {
  const gmail = await getGmail(connectionId);
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      removeLabelIds: labelIds,
    },
  });
}

/**
 * Get all labels for the user's mailbox.
 */
export async function getLabels(connectionId: string): Promise<gmail_v1.Schema$Label[]> {
  const gmail = await getGmail(connectionId);
  const response = await gmail.users.labels.list({ userId: 'me' });
  return response.data.labels || [];
}
