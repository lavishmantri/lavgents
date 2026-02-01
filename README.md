# Lavgents

AI agents for email classification and automation, built on [Mastra](https://mastra.ai/).

## Features

- **Email Classification** - LLM-powered classification with customizable labels (action-required, urgent, meeting, fyi, etc.)
- **Gmail Integration** - Batch fetch and classify emails via OAuth
- **Nango OAuth** - Self-hosted OAuth management for Google, GitHub, Slack, Notion, and more
- **Mastra Workflows** - Step-based pipelines for email processing
- **Webhook Handlers** - Ready for integration with external services

## Quick Start

1. **Clone and install**
   ```bash
   git clone <repo-url>
   cd lavgents
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Start Nango (OAuth server)**
   ```bash
   docker-compose up -d
   ```

4. **Configure OAuth providers** - Open http://localhost:3003 and add your OAuth credentials. See [Nango Setup Guide](docs/NANGO_SETUP.md).

5. **Start development server**
   ```bash
   npm run dev
   ```

6. **Open Mastra Studio** - http://localhost:4111

## Project Structure

```
src/mastra/
├── agents/           # AI agents (email-classifier, weather)
├── config/           # Label configurations
├── integrations/     # Nango, Google, GitHub, Slack, Notion, Fireflies
├── schemas/          # Zod schemas for emails and workflows
├── workflows/        # Mastra workflows
└── index.ts          # Mastra instance configuration
```

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with Mastra Studio |
| `npm run build` | Build for production |
| `npm run start` | Start production server |

## Documentation

- [Nango OAuth Setup](docs/NANGO_SETUP.md) - Configure self-hosted OAuth
- [Workflows Guide](docs/WORKFLOWS.md) - Email classification workflows

## Requirements

- Node.js >= 22.13.0
- Docker (for Nango)
- OpenAI API key (for LLM classification)

## Links

- [Mastra Documentation](https://mastra.ai/docs/)
- [Mastra Discord](https://discord.gg/BTYqqHKUrf)
- [Nango Documentation](https://docs.nango.dev/)

## License

ISC
