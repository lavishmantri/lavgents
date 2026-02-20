/**
 * Config-driven model selection for Mastra agents and scorers.
 *
 * Set LLM_PROVIDER=ollama in .env to use a local Ollama instance.
 * Defaults to OpenAI when unset.
 */

type OpenAICompatibleConfig =
  | { id: `${string}/${string}`; url?: string; apiKey?: string }
  | { providerId: string; modelId: string; url?: string; apiKey?: string };

export const isOfflineMode = process.env.LLM_PROVIDER === 'ollama';

export function getModelConfig(): string | OpenAICompatibleConfig {
  if (isOfflineMode) {
    return {
      id: `ollama/${process.env.OLLAMA_MODEL || 'qwen3:8b'}`,
      url: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
    };
  }

  return `openai/${process.env.OPENAI_MODEL || 'gpt-4o'}`;
}
