import type { NormalizedEmail } from '../schemas/email-schemas';

// Gmail API message header type
interface GmailHeader {
  name: string;
  value: string;
}

// Gmail API message part type
interface GmailMessagePart {
  mimeType?: string;
  body?: {
    data?: string;
    size?: number;
  };
  parts?: GmailMessagePart[];
  headers?: GmailHeader[];
}

// Gmail API message type (simplified for what we need)
interface GmailMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailMessagePart;
  internalDate?: string;
}

// Gmail API response from fetch emails
interface GmailFetchResponse {
  messages?: GmailMessage[];
  resultSizeEstimate?: number;
}

/**
 * Extract a specific header value from Gmail message headers
 */
export function getHeader(headers: GmailHeader[] | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return header?.value;
}

/**
 * Parse email address string like "John Doe <john@example.com>" or "john@example.com"
 */
export function parseEmailAddress(address: string): { email: string; name?: string } {
  if (!address) return { email: '' };

  // Match pattern: "Name <email>" or just "email"
  const match = address.match(/^(?:"?([^"<]*)"?\s*)?<?([^\s<>]+@[^\s<>]+)>?$/);

  if (match) {
    const name = match[1]?.trim();
    const email = match[2]?.trim() || address.trim();
    return { email, ...(name ? { name } : {}) };
  }

  return { email: address.trim() };
}

/**
 * Parse comma-separated email addresses
 */
export function parseEmailAddresses(addresses: string | undefined): Array<{ email: string; name?: string }> {
  if (!addresses) return [];

  // Split by comma, but be careful about commas inside quotes
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of addresses) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === ',' && !inQuotes) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());

  return parts.map(parseEmailAddress);
}

/**
 * Decode base64url encoded content (used by Gmail API)
 */
function decodeBase64Url(data: string): string {
  // Replace base64url characters with base64 characters
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

/**
 * Recursively extract the text body from Gmail message parts
 */
export function extractBody(part: GmailMessagePart | undefined): string {
  if (!part) return '';

  // If this part has direct content
  if (part.body?.data) {
    const mimeType = part.mimeType?.toLowerCase() || '';
    if (mimeType === 'text/plain' || mimeType === 'text/html') {
      const decoded = decodeBase64Url(part.body.data);
      // Strip HTML tags if it's HTML content
      if (mimeType === 'text/html') {
        return decoded
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      return decoded;
    }
  }

  // If this part has nested parts, search for text content
  if (part.parts) {
    // Prefer plain text over HTML
    const plainPart = part.parts.find(p => p.mimeType?.toLowerCase() === 'text/plain');
    if (plainPart) {
      return extractBody(plainPart);
    }

    // Fall back to HTML
    const htmlPart = part.parts.find(p => p.mimeType?.toLowerCase() === 'text/html');
    if (htmlPart) {
      return extractBody(htmlPart);
    }

    // Recursively check nested multipart
    for (const subPart of part.parts) {
      const body = extractBody(subPart);
      if (body) return body;
    }
  }

  return '';
}

/**
 * Check if message has attachments
 */
function hasAttachments(part: GmailMessagePart | undefined): boolean {
  if (!part) return false;

  // Check if this part is an attachment
  const mimeType = part.mimeType?.toLowerCase() || '';
  if (mimeType !== 'text/plain' && mimeType !== 'text/html' && !mimeType.startsWith('multipart/')) {
    if (part.body?.size && part.body.size > 0) {
      return true;
    }
  }

  // Check nested parts
  if (part.parts) {
    return part.parts.some(hasAttachments);
  }

  return false;
}

/**
 * Normalize a single Gmail message to our standard format
 */
export function normalizeGmailMessage(message: GmailMessage): NormalizedEmail {
  const headers = message.payload?.headers;

  const from = parseEmailAddress(getHeader(headers, 'From') || '');
  const to = parseEmailAddresses(getHeader(headers, 'To'));
  const subject = getHeader(headers, 'Subject') || '(no subject)';
  const date = getHeader(headers, 'Date') || '';

  // Try to parse internal date if Date header is missing
  let normalizedDate = date;
  if (!date && message.internalDate) {
    normalizedDate = new Date(parseInt(message.internalDate, 10)).toISOString();
  }

  const body = extractBody(message.payload);

  return {
    id: message.id,
    threadId: message.threadId,
    subject,
    body: body || message.snippet || '',
    from,
    to,
    date: normalizedDate,
    snippet: message.snippet,
    hasAttachments: hasAttachments(message.payload),
    labels: message.labelIds,
  };
}

/**
 * Normalize Gmail API response to array of NormalizedEmail
 *
 * Composio wraps responses in: { successful: boolean, error: string | null, data: { ... } }
 * The actual messages are in data.messages
 */
export function normalizeGmailMessages(response: GmailFetchResponse | unknown): NormalizedEmail[] {
  if (!response) {
    console.log('[normalizeGmailMessages] Response is null/undefined');
    return [];
  }

  const res = response as Record<string, unknown>;

  console.log('[normalizeGmailMessages] Response keys:', Object.keys(res));

  // Check Composio error response (correct spelling: 'successful')
  if (res.successful === false) {
    console.log('[normalizeGmailMessages] Composio error:', res.error);
    return [];
  }

  let messages: GmailMessage[] = [];

  // Composio wraps everything in 'data' property
  const payload = (res.data ?? res) as Record<string, unknown>;

  console.log('[normalizeGmailMessages] Payload keys:', typeof payload === 'object' ? Object.keys(payload) : 'N/A');

  if (Array.isArray(payload.messages)) {
    messages = payload.messages as GmailMessage[];
  } else if (Array.isArray(payload)) {
    messages = payload as unknown as GmailMessage[];
  } else if (Array.isArray(res.messages)) {
    // Fallback: messages directly on response
    messages = res.messages as GmailMessage[];
  }

  console.log('[normalizeGmailMessages] Found', messages.length, 'messages');
  return messages.map(normalizeGmailMessage).filter(email => email.id);
}
