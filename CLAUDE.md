# Lavgents - Claude Code Notes

## Mastra Agent Naming

Mastra resolves agents by their **map key** in the `agents` config object, NOT by the agent's internal `id` property. When registering an agent whose `id` differs from the variable name, use an explicit key:

```typescript
// WRONG - registers as "brainiac" (variable name matches id here, so this works, but be careful when they differ)
agents: { brainiac }

// CORRECT - explicit key ensures the key matches what mastra.getAgent("brainiac") expects
agents: { "brainiac": brainiac }
```

Always ensure the key used in `agents: { ... }` matches what `mastra.getAgent("...")` expects.
