import { nango } from "./nango";

const PROVIDER_CONFIG_KEY = "google-mail";

// ============================================================================
// Gmail API Response Types
// ============================================================================

interface GmailPayload {
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string };
  parts?: GmailPayload[];
  mimeType?: string;
  filename?: string;
}

interface GmailMessageResponse {
  id: string;
  threadId: string;
  labelIds?: string[];
  payload?: GmailPayload;
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
}

interface GmailLabel {
  id: string;
  name: string;
  type?: string;
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
  maxResults: number = 50,
): Promise<GmailMessage[]> {
  const listResponse = await nango.get<GmailListResponse>({
    providerConfigKey: PROVIDER_CONFIG_KEY,
    connectionId,
    endpoint: "/gmail/v1/users/me/messages",
    params: { q: query, maxResults: String(maxResults) },
  });

  const messageIds = listResponse.data.messages || [];

  // Fetch full message details in parallel; tolerate individual failures.
  const messageDetails = await Promise.allSettled(
    messageIds.map(async (msg) => {
      if (!msg.id) {
        throw new Error("Message ID missing in Gmail list response");
      }

      const detail = await nango.get<GmailMessageResponse>({
        providerConfigKey: PROVIDER_CONFIG_KEY,
        connectionId,
        endpoint: `/gmail/v1/users/me/messages/${msg.id}`,
        params: { format: "full" },
      });
      return parseGmailMessage(detail.data);
    }),
  );

  const messages: GmailMessage[] = [];
  const fetchFailures: string[] = [];

  for (const result of messageDetails) {
    if (result.status === "fulfilled") {
      messages.push(result.value);
      continue;
    }

    const reason =
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
    fetchFailures.push(reason);
  }

  if (fetchFailures.length > 0) {
    console.warn(
      `[Google/Gmail] Failed to fetch ${fetchFailures.length}/${messageIds.length} message details`,
    );
  }

  if (messageIds.length > 0 && messages.length === 0) {
    throw new Error(
      `Failed to fetch any Gmail message details. First failure: ${fetchFailures[0] || "Unknown error"}`,
    );
  }

  return messages;
}

/**
 * Parse Gmail API message into normalized format.
 */
function parseGmailMessage(message: GmailMessageResponse): GmailMessage {
  const headers = message.payload?.headers || [];
  const getHeader = (name: string): string =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ||
    "";

  const fromHeader = getHeader("from");
  const toHeader = getHeader("to");

  return {
    id: message.id || "",
    threadId: message.threadId || "",
    from: parseEmailAddress(fromHeader),
    to: toHeader.split(",").map((addr) => parseEmailAddress(addr.trim())),
    subject: getHeader("subject"),
    body: extractBody(message.payload),
    date: getHeader("date"),
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
      name: match[1]?.trim() || "",
      email: match[2]?.trim() || raw,
    };
  }
  return { name: "", email: raw };
}

/**
 * Extract plain text body from message payload.
 */
function extractBody(payload?: GmailPayload): string {
  if (!payload) return "";

  // Direct body
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }

  // Multipart - find text/plain or text/html
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
    }
    // Fallback to HTML if no plain text
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        const html = Buffer.from(part.body.data, "base64").toString("utf-8");
        return stripHtml(html);
      }
    }
    // Recurse into nested parts
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  return "";
}

/**
 * Simple HTML tag stripper.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if message has attachments.
 */
function hasAttachments(payload?: GmailPayload): boolean {
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
  labelIds: string[],
): Promise<void> {
  await nango.post({
    providerConfigKey: PROVIDER_CONFIG_KEY,
    connectionId,
    endpoint: `/gmail/v1/users/me/messages/${messageId}/modify`,
    data: { addLabelIds: labelIds },
  });
}

/**
 * Remove labels from a message.
 */
export async function removeLabels(
  connectionId: string,
  messageId: string,
  labelIds: string[],
): Promise<void> {
  await nango.post({
    providerConfigKey: PROVIDER_CONFIG_KEY,
    connectionId,
    endpoint: `/gmail/v1/users/me/messages/${messageId}/modify`,
    data: { removeLabelIds: labelIds },
  });
}

/**
 * Get all labels for the user's mailbox.
 */
export async function getLabels(
  connectionId: string,
): Promise<GmailLabel[]> {
  const response = await nango.get<{ labels?: GmailLabel[] }>({
    providerConfigKey: PROVIDER_CONFIG_KEY,
    connectionId,
    endpoint: "/gmail/v1/users/me/labels",
  });
  return response.data.labels || [];
}

/**
 * Create a new Gmail label.
 *
 * @param connectionId - User's connection ID
 * @param labelName - Display name for the new label
 * @returns The created label
 */
export async function createLabel(
  connectionId: string,
  labelName: string,
): Promise<GmailLabel> {
  const response = await nango.post<GmailLabel>({
    providerConfigKey: PROVIDER_CONFIG_KEY,
    connectionId,
    endpoint: "/gmail/v1/users/me/labels",
    data: {
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });
  return response.data;
}
