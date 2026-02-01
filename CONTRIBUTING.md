# Contributing to Lavgents

## Development Setup

### Prerequisites

- Node.js >= 22.13.0
- Docker and Docker Compose
- OpenAI API key

### Installation

```bash
git clone <repo-url>
cd lavgents
npm install
cp .env.example .env
# Edit .env with your API keys
```

### Start Development

```bash
# Start Nango OAuth server
docker-compose up -d

# Start Mastra dev server
npm run dev
```

Open Mastra Studio at http://localhost:4111

## Code Style

### TypeScript Conventions

- Use strict TypeScript with Zod schemas for runtime validation
- Prefer `const` over `let`, avoid `var`
- Use explicit return types on exported functions
- Keep functions focused on single responsibility

### Zod Schemas

Define schemas in `src/mastra/schemas/`:

```typescript
import { z } from 'zod';

export const mySchema = z.object({
  id: z.string(),
  name: z.string(),
  optional: z.string().optional(),
});

export type MyType = z.infer<typeof mySchema>;
```

### File Organization

```
src/mastra/
├── agents/         # AI agent definitions
├── config/         # Configuration objects
├── integrations/   # External API integrations
├── schemas/        # Zod schemas and types
├── workflows/      # Mastra workflow definitions
└── index.ts        # Mastra instance
```

## Adding Integrations

Integrations live in `src/mastra/integrations/`. Follow the existing pattern:

```typescript
// src/mastra/integrations/myservice.ts
import { getToken } from './nango';

export async function fetchData(connectionId: string) {
  const token = await getToken('myservice', connectionId);

  const response = await fetch('https://api.myservice.com/data', {
    headers: { Authorization: `Bearer ${token}` },
  });

  return response.json();
}
```

Export from `src/mastra/integrations/index.ts`.

## Adding Agents

Agents are LLM-powered assistants. Create in `src/mastra/agents/`:

```typescript
// src/mastra/agents/my-agent.ts
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';

export const myAgent = new Agent({
  name: 'myAgent',
  model: openai('gpt-4o'),
  instructions: `You are a helpful assistant that...`,
});
```

Register in `src/mastra/index.ts`:

```typescript
import { myAgent } from './agents/my-agent';

export const mastra = new Mastra({
  agents: { /* existing */, myAgent },
  // ...
});
```

## Adding Workflows

Workflows are step-based processing pipelines. See [Workflows Guide](docs/WORKFLOWS.md) for details.

1. Create workflow file in `src/mastra/workflows/`
2. Define input/output schemas
3. Create steps with `createStep()`
4. Chain steps with `.then()`
5. Call `.commit()` and export
6. Register in `src/mastra/index.ts`

## Testing

### Local Testing

Use Mastra Studio (http://localhost:4111) to test:

- **Agents** - Send messages and verify responses
- **Workflows** - Run with test inputs and inspect each step
- **Integrations** - Verify OAuth connections in Nango dashboard

### Testing with Real Data

1. Set up OAuth connection in Nango dashboard
2. Use the connection ID in workflow inputs
3. Run workflow in Mastra Studio

## Pull Requests

### Before Submitting

- [ ] Code compiles without errors
- [ ] New schemas are validated with Zod
- [ ] Workflows are registered in `index.ts`
- [ ] Tested locally in Mastra Studio
- [ ] No sensitive data (API keys, tokens) committed

### PR Guidelines

- Keep changes focused on a single feature or fix
- Write descriptive commit messages
- Update documentation if adding new features
- Reference any related issues

### Commit Messages

Use clear, descriptive messages:

```
feat: add Slack notification workflow
fix: handle empty email body in classifier
docs: update Nango setup instructions
refactor: extract email parsing to shared utility
```

## Questions?

- [Mastra Documentation](https://mastra.ai/docs/)
- [Mastra Discord](https://discord.gg/BTYqqHKUrf)
- [Nango Documentation](https://docs.nango.dev/)
