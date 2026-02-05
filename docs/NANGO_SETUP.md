# Nango OAuth Setup

Nango is a self-hosted OAuth management service that handles token storage, automatic refresh, and provider authentication for 500+ APIs.

## Prerequisites

- Docker and Docker Compose
- Ports 3003 (Nango) and 5432 (PostgreSQL) available
- OAuth credentials from providers (Google, GitHub, etc.)

## Starting Nango

```bash
# From project root
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f nango-server
```

Nango will be available at http://localhost:3003

## Accessing the Dashboard

1. Open http://localhost:3003 in your browser
2. Login with:
   - Username: `admin`
   - Password: `admin`
3. The dashboard shows configured integrations and active connections
4. Use Environment Settings to find your secret key

> **Note**: These credentials are for local development only. For production, configure `NANGO_ADMIN_KEY` and enable proper authentication.

## Configuring OAuth Providers

### Google OAuth (Gmail, Calendar, Drive)

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URI: `http://localhost:3003/oauth/callback`
4. Enable required APIs (Gmail API, Google Calendar API, etc.)
5. In Nango dashboard:
   - Click "Add Integration"
   - Select "Google"
   - Enter Client ID and Client Secret
   - Set scopes:
     ```
     https://www.googleapis.com/auth/gmail.readonly
     https://www.googleapis.com/auth/gmail.labels
     https://www.googleapis.com/auth/calendar.readonly
     ```

### GitHub OAuth

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create new OAuth App
3. Set Authorization callback URL: `http://localhost:3003/oauth/callback`
4. In Nango dashboard:
   - Add "GitHub" integration
   - Enter Client ID and Client Secret
   - Scopes: `repo`, `read:user`, `read:org`

### Slack OAuth

1. Go to [Slack API Apps](https://api.slack.com/apps)
2. Create new app "From scratch"
3. Under OAuth & Permissions, add redirect URL: `http://localhost:3003/oauth/callback`
4. Add scopes: `channels:read`, `chat:write`, `users:read`
5. In Nango dashboard:
   - Add "Slack" integration
   - Enter Client ID and Client Secret

### Notion OAuth

1. Go to [Notion Integrations](https://www.notion.so/my-integrations)
2. Create new integration
3. Set redirect URI: `http://localhost:3003/oauth/callback`
4. In Nango dashboard:
   - Add "Notion" integration
   - Enter OAuth Client ID and Secret

## Creating Connections

Connections link a user account to an OAuth provider. Use the Nango Node SDK:

```typescript
import { createConnectSession } from './integrations/nango';

// Start OAuth flow for a user
const { url, token } = await createConnectSession('google', 'user-123');
// Redirect user to `url` to authenticate
```

Or use the Nango dashboard:
1. Go to Connections tab
2. Click "Add Connection"
3. Select integration and enter connection ID (e.g., user ID)
4. Complete OAuth flow

## Using Tokens in Your App

```typescript
import { getToken, hasConnection } from './integrations/nango';

// Check if user has connected Google
if (await hasConnection('google', 'user-123')) {
  // Get fresh access token (auto-refreshed by Nango)
  const token = await getToken('google', 'user-123');

  // Use token with Google APIs
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NANGO_HOST` | Nango server URL for SDK | `http://localhost:3003` |
| `NANGO_SECRET_KEY` | Secret key from Nango dashboard | Required |
| `NANGO_DB_PASSWORD` | PostgreSQL password | `nango` |
| `NANGO_SERVER_URL` | Public URL for OAuth callbacks | `http://localhost:3003` |
| `NANGO_CALLBACK_URL` | OAuth redirect URI | `http://localhost:3003/oauth/callback` |
| `NANGO_ENCRYPTION_KEY` | Token encryption key (production) | Optional |

## Production Setup

For production, update these in your `.env`:

```bash
# Generate secure keys
NANGO_SECRET_KEY=$(openssl rand -hex 32)
NANGO_ENCRYPTION_KEY=$(openssl rand -hex 32)
NANGO_DB_PASSWORD=$(openssl rand -hex 16)

# Public URL for OAuth redirects
NANGO_SERVER_URL=https://nango.yourdomain.com
NANGO_CALLBACK_URL=https://nango.yourdomain.com/oauth/callback
```

## Troubleshooting

### OAuth callback fails
- Ensure `NANGO_CALLBACK_URL` matches the redirect URI in your OAuth app settings
- Check that Nango server is accessible at the callback URL

### Token retrieval fails
- Verify the connection exists in Nango dashboard
- Check that `NANGO_SECRET_KEY` matches the dashboard environment settings
- Ensure the connection has completed OAuth successfully

### Docker container won't start
- Check port 3003 and 5432 are not in use
- On Apple Silicon, the `platform: linux/amd64` directive handles compatibility
- View logs: `docker-compose logs nango-server`

### Connection shows but token is invalid
- The OAuth app may have been modified (scopes changed)
- Delete the connection and re-authenticate
- Check if the OAuth app is still active in the provider's developer console
