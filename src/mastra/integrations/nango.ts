import { Nango } from '@nangohq/node';

// Initialize Nango client for self-hosted instance
// secretKey is required - get it from Nango dashboard environment settings
const nango = new Nango({
  secretKey: process.env.NANGO_SECRET_KEY || '',
  host: process.env.NANGO_HOST || 'http://localhost:3003',
});

/**
 * Supported OAuth providers in Nango.
 * Provider names must match integration names configured in Nango dashboard.
 */
export type NangoProvider = 'google' | 'github' | 'slack' | 'notion' | 'gitlab';

/**
 * Get a valid access token for a provider connection.
 * Nango automatically handles token refresh.
 *
 * @param provider - The integration provider name (e.g., 'google', 'github')
 * @param connectionId - Unique identifier for the user's connection (typically user ID)
 * @returns Valid access token string
 * @throws Error if connection not found or token retrieval fails
 */
export async function getToken(provider: NangoProvider, connectionId: string): Promise<string> {
  const connection = await nango.getConnection(provider, connectionId);

  // Handle different credential types based on OAuth vs API key
  const credentials = connection.credentials as Record<string, unknown>;
  if ('access_token' in credentials && typeof credentials.access_token === 'string') {
    return credentials.access_token;
  }
  if ('apiKey' in credentials && typeof credentials.apiKey === 'string') {
    return credentials.apiKey;
  }

  throw new Error(`Unexpected credential type for ${provider}`);
}

/**
 * Create a connect session to start OAuth flow.
 * Returns a connect URL where users authenticate with the provider.
 *
 * @param provider - The integration provider name
 * @param userId - Unique identifier for the end user
 * @returns Object with connect URL and session token
 */
export async function createConnectSession(
  provider: NangoProvider,
  userId: string
): Promise<{ url: string; token: string; expiresAt: string }> {
  const result = await nango.createConnectSession({
    end_user: { id: userId },
    allowed_integrations: [provider],
  });

  return {
    url: result.data.connectUrl,
    token: result.data.token,
    expiresAt: result.data.expiresAt,
  };
}

/**
 * Check if a connection exists and is active.
 *
 * @param provider - The integration provider name
 * @param connectionId - Unique identifier for the user's connection
 * @returns True if connection exists and has valid credentials
 */
export async function hasConnection(provider: NangoProvider, connectionId: string): Promise<boolean> {
  try {
    const connection = await nango.getConnection(provider, connectionId);
    return !!connection.credentials;
  } catch {
    return false;
  }
}

/**
 * List all connections for a user across all providers.
 *
 * @param connectionId - Unique identifier for the user
 * @returns Array of connection info objects
 */
export async function listConnections(connectionId: string): Promise<
  Array<{
    provider: string;
    connectionId: string;
    createdAt: string;
  }>
> {
  const result = await nango.listConnections();

  // Type the connection response properly
  interface NangoConnection {
    connection_id: string;
    provider_config_key: string;
    created_at: string;
  }

  // Filter by connectionId and map to our format
  return (result.connections as NangoConnection[])
    .filter((conn) => conn.connection_id === connectionId)
    .map((conn) => ({
      provider: conn.provider_config_key,
      connectionId: conn.connection_id,
      createdAt: conn.created_at,
    }));
}

/**
 * Delete a connection (revoke access).
 *
 * @param provider - The integration provider name
 * @param connectionId - Unique identifier for the user's connection
 */
export async function deleteConnection(provider: NangoProvider, connectionId: string): Promise<void> {
  await nango.deleteConnection(provider, connectionId);
}

// Export the nango client for advanced use cases
export { nango };
