import { Nango } from "@nangohq/node";

const nangoHost =
  process.env.NANGO_HOST ||
  process.env.NANGO_SERVER_URL ||
  "http://localhost:3003";
const nangoSecretKey = process.env.NANGO_SECRET_KEY || "";

let nangoClient: Nango | null = null;

/**
 * Supported OAuth providers in Nango.
 * Provider names must match integration names configured in Nango dashboard.
 */
export type NangoProvider =
  | "google-mail"
  | "github"
  | "slack"
  | "notion"
  | "gitlab";

function formatNangoError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return String(error);
  }

  const e = error as {
    message?: string;
    code?: string;
    config?: { url?: string };
    errors?: Array<{ message?: string; code?: string }>;
  };

  const parts: string[] = [];

  if (e.message) {
    parts.push(e.message);
  }
  if (e.code) {
    parts.push(`code=${e.code}`);
  }
  if (e.config?.url) {
    parts.push(`url=${e.config.url}`);
  }
  if (Array.isArray(e.errors) && e.errors.length > 0) {
    const firstError = e.errors[0];
    if (firstError?.message) {
      parts.push(`cause=${firstError.message}`);
    }
    if (firstError?.code) {
      parts.push(`causeCode=${firstError.code}`);
    }
  }

  if (parts.length > 0) {
    return parts.join("; ");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getNangoClient(): Nango {
  if (!nangoSecretKey) {
    throw new Error("NANGO_SECRET_KEY environment variable not set");
  }

  if (!nangoClient) {
    // Initialize lazily so importing this module does not crash when OAuth is unused.
    nangoClient = new Nango({
      secretKey: nangoSecretKey,
      host: nangoHost,
    });
  }

  return nangoClient;
}

/**
 * Get a valid access token for a provider connection.
 * Nango automatically handles token refresh.
 *
 * @param provider - The integration provider name (e.g., 'google', 'github')
 * @param connectionId - Unique identifier for the user's connection (typically user ID)
 * @returns Valid access token string
 * @throws Error if connection not found or token retrieval fails
 */
export async function getToken(
  provider: NangoProvider,
  connectionId: string,
): Promise<string> {
  try {
    const connection = await getNangoClient().getConnection(
      provider,
      connectionId,
    );

    // Handle different credential types based on OAuth vs API key
    const credentials = connection.credentials as Record<string, unknown>;
    if (
      "access_token" in credentials &&
      typeof credentials.access_token === "string"
    ) {
      return credentials.access_token;
    }
    if ("apiKey" in credentials && typeof credentials.apiKey === "string") {
      return credentials.apiKey;
    }

    throw new Error(`Unexpected credential type for ${provider}`);
  } catch (error) {
    throw new Error(
      `Failed to fetch ${provider} token for connectionId "${connectionId}" from Nango host "${nangoHost}": ${formatNangoError(error)}`,
    );
  }
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
  userId: string,
): Promise<{ url: string; token: string; expiresAt: string }> {
  const result = await getNangoClient().createConnectSession({
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
export async function hasConnection(
  provider: NangoProvider,
  connectionId: string,
): Promise<boolean> {
  try {
    const connection = await getNangoClient().getConnection(
      provider,
      connectionId,
    );
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
  const result = await getNangoClient().listConnections();

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
export async function deleteConnection(
  provider: NangoProvider,
  connectionId: string,
): Promise<void> {
  await getNangoClient().deleteConnection(provider, connectionId);
}

// Export the nango client for advanced use cases
const nango = new Proxy({} as Nango, {
  get(_target, prop, receiver) {
    const client = getNangoClient();
    const value = Reflect.get(client as unknown as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export { nango };
