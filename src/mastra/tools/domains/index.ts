import type { VaultConfig } from '../../config/vaults';
import { createFitnessTools } from './fitness';

type DomainToolFactory = (vault: VaultConfig) => Record<string, unknown>;

/**
 * Registry that maps vault IDs to their domain-specific tool factories.
 * When a new vault is added (e.g., "finance", "travel"), add an entry here.
 */
const domainToolRegistry: Record<string, DomainToolFactory> = {
  fitness: createFitnessTools,
};

/**
 * Get domain tools for a vault. Returns an empty object if no domain
 * tools are registered for this vault ID.
 */
export function getDomainTools(vault: VaultConfig): Record<string, unknown> {
  const factory = domainToolRegistry[vault.id];
  return factory ? factory(vault) : {};
}
