/**
 * Integration modules for external services.
 *
 * OAuth-based integrations (via Nango):
 * - google: Gmail, Calendar, Drive
 * - github: Repositories, Issues, PRs
 * - slack: Messages, Channels
 * - notion: Pages, Databases
 *
 * API key integrations:
 * - fireflies: Meeting transcripts
 * - telegram: Bot API (messages, files)
 */

// OAuth management via Nango
export * from './nango';

// Google Workspace
export * as google from './google';

// GitHub
export * as github from './github';

// Slack
export * as slack from './slack';

// Notion
export * as notion from './notion';

// Fireflies (API key only)
export * as fireflies from './fireflies';

// Telegram (API key only)
export * as telegram from './telegram';
