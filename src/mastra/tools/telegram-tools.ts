import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { sendMessage, sendMessageWithKeyboard } from '../integrations/telegram';

export const sendReplyTool = createTool({
  id: 'send-telegram-reply',
  description: 'Send a text reply to the user on Telegram',
  inputSchema: z.object({
    chatId: z.number().describe('Telegram chat ID to send the reply to'),
    text: z.string().describe('Message text (supports Markdown)'),
  }),
  outputSchema: z.object({ sent: z.boolean() }),
  execute: async ({ chatId, text }) => {
    await sendMessage(chatId, text);
    return { sent: true };
  },
});

export const sendKeyboardTool = createTool({
  id: 'send-telegram-keyboard',
  description: 'Send a message with inline keyboard buttons on Telegram for user choices',
  inputSchema: z.object({
    chatId: z.number().describe('Telegram chat ID'),
    text: z.string().describe('Message text above the buttons'),
    buttons: z.array(z.array(z.object({
      text: z.string().describe('Button label'),
      callback_data: z.string().describe('Data sent back when pressed'),
    }))).describe('Rows of buttons'),
  }),
  outputSchema: z.object({ sent: z.boolean() }),
  execute: async ({ chatId, text, buttons }) => {
    await sendMessageWithKeyboard(chatId, text, buttons);
    return { sent: true };
  },
});
