/**
 * Telegram Bot API integration using HTTP API.
 * Uses bot token authentication (not OAuth).
 *
 * API Documentation: https://core.telegram.org/bots/api
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org';

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Fetch with retry and per-attempt timeout.
 * Uses exponential backoff: 1s, 2s, 4s.
 */
async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      return response;
    } catch (err) {
      lastError = err;
      if (attempt < RETRY_ATTEMPTS - 1) {
        const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
        console.warn(`[Telegram] fetch attempt ${attempt + 1} failed, retrying in ${delay}ms...`, err);
        await new Promise((r) => setTimeout(r, delay));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

/**
 * Get the Telegram bot token from environment.
 */
function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN environment variable not set');
  }
  return token;
}

// ============================================================================
// Types
// ============================================================================

export interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

export interface TelegramMessage {
  message_id: number;
  chat: { id: number };
}

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

// ============================================================================
// API Operations
// ============================================================================

/**
 * Get file metadata from Telegram (returns file_path for download).
 */
export async function getFile(fileId: string): Promise<TelegramFile> {
  const token = getBotToken();
  const response = await fetchWithRetry(`${TELEGRAM_API_BASE}/bot${token}/getFile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId }),
  });

  if (!response.ok) {
    throw new Error(`Telegram getFile error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as TelegramApiResponse<TelegramFile>;

  if (!data.ok || !data.result) {
    throw new Error(`Telegram getFile failed: ${data.description || 'Unknown error'}`);
  }

  return data.result;
}

/**
 * Download raw binary from Telegram file servers.
 * @param filePath - The file_path returned from getFile()
 */
export async function downloadFile(filePath: string): Promise<Buffer> {
  const token = getBotToken();
  const response = await fetchWithRetry(`${TELEGRAM_API_BASE}/file/bot${token}/${filePath}`);

  if (!response.ok) {
    throw new Error(`Telegram downloadFile error: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Send a text message to a Telegram chat.
 */
export async function sendMessage(
  chatId: number,
  text: string,
  opts?: { replyToMessageId?: number },
): Promise<TelegramMessage> {
  const token = getBotToken();

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
  };
  if (opts?.replyToMessageId) {
    body.reply_parameters = { message_id: opts.replyToMessageId };
  }

  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Telegram sendMessage error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as TelegramApiResponse<TelegramMessage>;

  if (!data.ok || !data.result) {
    throw new Error(`Telegram sendMessage failed: ${data.description || 'Unknown error'}`);
  }

  return data.result;
}

/**
 * Send a message with an inline keyboard.
 */
export async function sendMessageWithKeyboard(
  chatId: number,
  text: string,
  keyboard: InlineKeyboardButton[][],
): Promise<TelegramMessage> {
  const token = getBotToken();

  const body = {
    chat_id: chatId,
    text,
    reply_markup: { inline_keyboard: keyboard },
  };

  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Telegram sendMessageWithKeyboard error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as TelegramApiResponse<TelegramMessage>;
  if (!data.ok || !data.result) {
    throw new Error(`Telegram sendMessageWithKeyboard failed: ${data.description || 'Unknown error'}`);
  }

  return data.result;
}

/**
 * Acknowledge a callback query (dismiss the "loading" spinner on the button).
 */
export async function answerCallbackQuery(callbackQueryId: string): Promise<void> {
  const token = getBotToken();

  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });

  if (!response.ok) {
    throw new Error(`Telegram answerCallbackQuery error: ${response.status} ${response.statusText}`);
  }
}

/**
 * Edit an existing message's text (e.g., to update after button press).
 */
export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
): Promise<void> {
  const token = getBotToken();

  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text }),
  });

  if (!response.ok) {
    throw new Error(`Telegram editMessageText error: ${response.status} ${response.statusText}`);
  }
}
