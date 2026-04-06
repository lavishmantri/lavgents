import type { Mastra } from '@mastra/core/mastra';
import crypto from 'crypto';
import {
  answerCallbackQuery,
  sendMessageWithKeyboard,
  getFile,
  downloadFile,
  sendMessage,
} from '../integrations/telegram';
import { transcribeAudioBuffer } from '../tools/transcribe';
import { getDiscoveredVaults } from '../config/vaults';
import type { TelegramNoteInput } from '../schemas/telegram-schemas';

/**
 * Telegram channel adapter.
 * Converts Telegram webhook payloads into brain agent calls and delivers responses.
 * The brain agent knows nothing about Telegram — this adapter is the only Telegram-aware layer.
 */

// ============================================================================
// Types
// ============================================================================

export interface TelegramWebhookEvent {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      is_bot: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    date: number;
    text?: string;
    voice?: {
      file_id: string;
      file_unique_id: string;
      duration: number;
      mime_type?: string;
      file_size?: number;
    };
    audio?: {
      file_id: string;
      file_unique_id: string;
      duration: number;
      mime_type?: string;
      file_size?: number;
      title?: string;
      performer?: string;
    };
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
    };
    message?: {
      message_id: number;
      chat: { id: number };
    };
    data?: string;
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Verify Telegram webhook secret token (timing-safe comparison).
 * @see https://core.telegram.org/bots/api#setwebhook
 */
export function verifyTelegramSecret(headerToken: string, expectedSecret: string): boolean {
  if (!headerToken || !expectedSecret) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(expectedSecret));
  } catch {
    return false;
  }
}

/**
 * Extract workflow-compatible input from a Telegram webhook event.
 */
function extractTelegramInput(event: TelegramWebhookEvent): TelegramNoteInput | null {
  const msg = event.message;
  if (!msg) return null;

  const senderName =
    [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || 'Unknown';

  if (msg.voice) {
    return {
      chatId: msg.chat.id,
      messageId: msg.message_id,
      senderName,
      date: msg.date,
      messageType: 'voice',
      fileId: msg.voice.file_id,
      mimeType: msg.voice.mime_type,
      duration: msg.voice.duration,
    };
  }

  if (msg.audio) {
    return {
      chatId: msg.chat.id,
      messageId: msg.message_id,
      senderName,
      date: msg.date,
      messageType: 'audio',
      fileId: msg.audio.file_id,
      mimeType: msg.audio.mime_type,
      duration: msg.audio.duration,
    };
  }

  if (msg.text) {
    return {
      chatId: msg.chat.id,
      messageId: msg.message_id,
      senderName,
      date: msg.date,
      messageType: 'text',
      text: msg.text,
    };
  }

  return null;
}

/**
 * Map mime type to file extension for audio files.
 */
function audioExtension(mimeType?: string): string {
  if (!mimeType) return 'ogg';
  const map: Record<string, string> = {
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
  };
  return map[mimeType] || 'ogg';
}

// ============================================================================
// Message handler
// ============================================================================

/**
 * Process an incoming Telegram message through the Brainiac agent.
 * Transcribes voice/audio before passing to the agent.
 * Always delivers the response text back via sendMessage.
 */
export async function handleTelegramMessage(
  event: TelegramWebhookEvent,
  mastra: Mastra,
): Promise<void> {
  const input = extractTelegramInput(event);
  if (!input) {
    console.log('[Telegram] Ignoring unsupported message type');
    return;
  }

  console.log(`[Telegram] Processing ${input.messageType} from ${input.senderName}`);

  // Resolve message text — transcribe audio if needed
  let messageText = input.text || '';

  if ((input.messageType === 'voice' || input.messageType === 'audio') && input.fileId) {
    try {
      const fileInfo = await getFile(input.fileId);
      if (fileInfo.file_path) {
        const buffer = await downloadFile(fileInfo.file_path);
        const ext = audioExtension(input.mimeType);
        messageText = await transcribeAudioBuffer(buffer, `voice.${ext}`);
      }
    } catch (err) {
      console.error('[Telegram] Transcription failed:', err);
      try {
        await sendMessage(input.chatId, "Sorry, I couldn't process that audio. Please try again or send text.");
      } catch {
        // notification failure is non-fatal
      }
      return;
    }
  }

  if (!messageText.trim()) {
    console.log('[Telegram] Empty message, ignoring');
    return;
  }

  // Route through the Brainiac agent (channel-agnostic)
  // Include channel metadata in the prompt so the saveNote tool can capture it
  const agent = mastra.getAgent('brainiac');
  const prompt = `[sender=${input.senderName}, type=${input.messageType}]\n\n${messageText}`;

  try {
    const result = await agent.generate([{ role: 'user', content: prompt }], {
      memory: {
        thread: String(input.chatId),
        resource: String(input.chatId),
      },
    });

    if (result.text?.trim()) {
      await sendMessage(input.chatId, result.text.trim());
    }
  } catch (err) {
    console.error('[Telegram] Agent failed:', err);
    try {
      await sendMessage(input.chatId, 'Something went wrong. Please try again.');
    } catch {
      // notification failure is non-fatal
    }
  }
}

// ============================================================================
// Callback query handler (inline keyboard for note routing workflow)
// ============================================================================

/**
 * Handle a Telegram callback_query (inline keyboard button press).
 * Callback data format:
 *   route:confirm:<runId>          - user confirms suggested folder
 *   route:change:<runId>           - user wants to pick a different folder
 *   route:select:<folderId>:<runId> - user selected a specific folder
 */
export async function handleTelegramCallbackQuery(
  event: TelegramWebhookEvent,
  mastra: Mastra,
): Promise<void> {
  const cb = event.callback_query;
  if (!cb?.data) return;

  await answerCallbackQuery(cb.id);

  const parts = cb.data.split(':');
  const action = parts[1]; // confirm | change | select

  if (action === 'confirm') {
    const runId = parts[2];
    const workflow = mastra.getWorkflow('noteRouterWorkflow');
    const run = await workflow.createRun({ runId });
    await run.resume({
      resumeData: { confirmed: true },
      step: 'await-confirmation',
    });
  } else if (action === 'change') {
    // Show folder selection keyboard using discovered vaults
    const runId = parts[2];
    const chatId = cb.message?.chat.id;
    if (!chatId) return;

    const vaults = await getDiscoveredVaults();
    const keyboard = vaults.map(v => [
      { text: v.name, callback_data: `route:select:${v.id}:${runId}` },
    ]);

    await sendMessageWithKeyboard(chatId, 'Choose a folder:', keyboard);
  } else if (action === 'select') {
    const folderId = parts[2];
    const runId = parts[3];
    const workflow = mastra.getWorkflow('noteRouterWorkflow');
    const run = await workflow.createRun({ runId });
    await run.resume({
      resumeData: { confirmed: true, selectedFolderId: folderId },
      step: 'await-confirmation',
    });
  }
}

// ============================================================================
// Route handler (registered with Mastra)
// ============================================================================

/**
 * Telegram webhook route handler.
 * Register with Mastra's registerApiRoute at POST /webhooks/telegram.
 */
export const telegramWebhookHandler = async (c: {
  req: {
    header: (name: string) => string | undefined;
    text: () => Promise<string>;
  };
  json: (data: unknown, status?: number) => Response;
  get: (key: string) => unknown;
}) => {
  const secretToken = c.req.header('x-telegram-bot-api-secret-token') || '';
  const body = await c.req.text();

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[Telegram] TELEGRAM_WEBHOOK_SECRET not configured');
    return c.json({ error: 'Webhook not configured' }, 500);
  }

  if (!verifyTelegramSecret(secretToken, secret)) {
    console.warn('[Telegram] Invalid secret token');
    return c.json({ error: 'Invalid secret token' }, 401);
  }

  try {
    const event = JSON.parse(body) as TelegramWebhookEvent;
    const mastra = c.get('mastra') as Mastra;

    if (event.callback_query) {
      await handleTelegramCallbackQuery(event, mastra);
    } else {
      await handleTelegramMessage(event, mastra);
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error('[Telegram] Error processing event:', err);
    return c.json({ error: 'Processing failed' }, 500);
  }
};
