import crypto from 'crypto';

/**
 * Webhook handlers for external service integrations.
 * Uses Mastra's built-in Hono server via registerApiRoute.
 */

// ============================================================================
// Signature Verification Helpers
// ============================================================================

/**
 * Verify GitHub webhook signature (HMAC-SHA256).
 * @see https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */
export function verifyGitHubSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) return false;

  const expected = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

/**
 * Verify Slack request signature.
 * @see https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature(
  payload: string,
  timestamp: string,
  signature: string,
  signingSecret: string
): boolean {
  if (!signature || !timestamp || !signingSecret) return false;

  // Check timestamp to prevent replay attacks (allow 5 minute window)
  const time = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - time) > 300) return false;

  const sigBasestring = `v0:${timestamp}:${payload}`;
  const expected = `v0=${crypto
    .createHmac('sha256', signingSecret)
    .update(sigBasestring)
    .digest('hex')}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// ============================================================================
// Webhook Event Types
// ============================================================================

export interface GitHubWebhookEvent {
  action?: string;
  sender?: {
    login: string;
    id: number;
  };
  repository?: {
    full_name: string;
    html_url: string;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface SlackWebhookEvent {
  type: string;
  event?: {
    type: string;
    user?: string;
    channel?: string;
    text?: string;
    ts?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  };
  challenge?: string; // For URL verification
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// ============================================================================
// Webhook Handler Functions
// ============================================================================

/**
 * Process a verified GitHub webhook event.
 * Implement your business logic here.
 */
export async function handleGitHubEvent(
  eventType: string,
  event: GitHubWebhookEvent
): Promise<void> {
  console.log(`[GitHub Webhook] Received ${eventType}:`, {
    action: event.action,
    repo: event.repository?.full_name,
    sender: event.sender?.login,
  });

  // Example: Handle specific events
  switch (eventType) {
    case 'push':
      // Handle push event
      console.log('[GitHub] Push to', event.repository?.full_name);
      break;

    case 'pull_request':
      // Handle PR events
      console.log('[GitHub] PR', event.action, 'on', event.repository?.full_name);
      break;

    case 'issues':
      // Handle issue events
      console.log('[GitHub] Issue', event.action, 'on', event.repository?.full_name);
      break;

    default:
      console.log(`[GitHub] Unhandled event type: ${eventType}`);
  }
}

/**
 * Process a verified Slack webhook event.
 * Implement your business logic here.
 */
export async function handleSlackEvent(event: SlackWebhookEvent): Promise<void> {
  console.log(`[Slack Webhook] Received ${event.type}:`, event.event);

  // Handle URL verification challenge
  if (event.type === 'url_verification') {
    // The challenge response is handled in the route
    return;
  }

  // Handle event callbacks
  if (event.type === 'event_callback' && event.event) {
    const innerEvent = event.event;

    switch (innerEvent.type) {
      case 'message':
        // Handle new messages
        console.log('[Slack] Message in', innerEvent.channel);
        break;

      case 'app_mention':
        // Handle @mentions of your app
        console.log('[Slack] App mentioned by', innerEvent.user);
        break;

      case 'reaction_added':
        // Handle emoji reactions
        console.log('[Slack] Reaction added:', innerEvent.reaction);
        break;

      default:
        console.log(`[Slack] Unhandled event type: ${innerEvent.type}`);
    }
  }
}

// ============================================================================
// Route Definitions for Mastra
// ============================================================================

/**
 * GitHub webhook route handler.
 * Register with Mastra's registerApiRoute.
 */
export const githubWebhookHandler = async (c: {
  req: {
    header: (name: string) => string | undefined;
    text: () => Promise<string>;
  };
  json: (data: unknown, status?: number) => Response;
}) => {
  const signature = c.req.header('x-hub-signature-256') || '';
  const eventType = c.req.header('x-github-event') || 'unknown';
  const body = await c.req.text();

  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[GitHub Webhook] GITHUB_WEBHOOK_SECRET not configured');
    return c.json({ error: 'Webhook not configured' }, 500);
  }

  if (!verifyGitHubSignature(body, signature, secret)) {
    console.warn('[GitHub Webhook] Invalid signature');
    return c.json({ error: 'Invalid signature' }, 401);
  }

  try {
    const event = JSON.parse(body) as GitHubWebhookEvent;
    await handleGitHubEvent(eventType, event);
    return c.json({ ok: true });
  } catch (err) {
    console.error('[GitHub Webhook] Error processing event:', err);
    return c.json({ error: 'Processing failed' }, 500);
  }
};

/**
 * Slack webhook route handler.
 * Register with Mastra's registerApiRoute.
 */
export const slackWebhookHandler = async (c: {
  req: {
    header: (name: string) => string | undefined;
    text: () => Promise<string>;
  };
  json: (data: unknown, status?: number) => Response;
}) => {
  const signature = c.req.header('x-slack-signature') || '';
  const timestamp = c.req.header('x-slack-request-timestamp') || '';
  const body = await c.req.text();

  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) {
    console.error('[Slack Webhook] SLACK_SIGNING_SECRET not configured');
    return c.json({ error: 'Webhook not configured' }, 500);
  }

  if (!verifySlackSignature(body, timestamp, signature, secret)) {
    console.warn('[Slack Webhook] Invalid signature');
    return c.json({ error: 'Invalid signature' }, 401);
  }

  try {
    const event = JSON.parse(body) as SlackWebhookEvent;

    // Handle Slack URL verification challenge
    if (event.type === 'url_verification' && event.challenge) {
      return c.json({ challenge: event.challenge });
    }

    await handleSlackEvent(event);
    return c.json({ ok: true });
  } catch (err) {
    console.error('[Slack Webhook] Error processing event:', err);
    return c.json({ error: 'Processing failed' }, 500);
  }
};
