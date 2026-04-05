import {
  createConnectSession,
  listConnections,
  deleteConnection,
  type NangoProvider,
} from "../integrations/nango";

/**
 * Default user ID for single-user self-hosted setup.
 */
const DEFAULT_USER = "lavish";

/**
 * Available integrations that can be connected via Nango.
 */
const INTEGRATIONS: Array<{
  provider: NangoProvider;
  name: string;
  description: string;
}> = [
  {
    provider: "google-mail",
    name: "Gmail",
    description: "Read, classify, and manage emails",
  },
  {
    provider: "google-calendar",
    name: "Google Calendar",
    description: "View and manage calendar events",
  },
  {
    provider: "github",
    name: "GitHub",
    description: "Repos, PRs, issues, and code review",
  },
  {
    provider: "slack",
    name: "Slack",
    description: "Send messages and manage channels",
  },
  {
    provider: "notion",
    name: "Notion",
    description: "Read and write Notion pages",
  },
  {
    provider: "gitlab",
    name: "GitLab",
    description: "Repos, merge requests, and pipelines",
  },
];

/**
 * Middleware: GET /connections — serve the connections management UI.
 * Registered as server.middleware so it runs before Mastra's catch-all.
 */
export const connectionsPageHandler = async (
  c: { req: { method: string; path: string }; json: (data: unknown, status?: number) => Response },
  next: () => Promise<void>,
) => {
  if (c.req.method !== "GET" || c.req.path !== "/connections") {
    return next();
  }
  const connectUrl =
    process.env.NANGO_PUBLIC_CONNECT_URL || "http://localhost:3009";

  return new Response(buildConnectionsPage(connectUrl), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};

/**
 * Middleware: GET /connections/list — list all current connections with status.
 * Registered as server.middleware so it runs before Mastra's catch-all.
 */
export const listConnectionsHandler = async (
  c: { req: { method: string; path: string }; json: (data: unknown, status?: number) => Response },
  next: () => Promise<void>,
) => {
  if (c.req.method !== "GET" || c.req.path !== "/connections/list") {
    return next();
  }
  try {
    const connections = await listConnections(DEFAULT_USER);

    const result = INTEGRATIONS.map((integration) => {
      const conn = connections.find(
        (cn) => cn.provider === integration.provider,
      );
      return {
        ...integration,
        connected: !!conn,
        connectionId: conn?.connectionId ?? null,
        connectedAt: conn?.createdAt ?? null,
      };
    });

    return c.json({ data: result });
  } catch (err) {
    console.error("[Connections] Failed to list:", err);
    return c.json({ error: "Failed to list connections" }, 500);
  }
};

/**
 * POST /connections/session — create a Nango connect session.
 * Body JSON: { provider?: "google-mail" }
 */
export const createSessionHandler = async (c: {
  req: { header: (name: string) => string | undefined; text: () => Promise<string> };
  json: (data: unknown, status?: number) => Response;
}) => {
  try {
    const body = JSON.parse(await c.req.text()) as { provider?: string };
    const provider = body.provider as NangoProvider | undefined;
    const session = await createConnectSession(provider, DEFAULT_USER);
    return c.json({ data: session });
  } catch (err) {
    console.error("[Connections] Failed to create session:", err);
    return c.json({ error: "Failed to create connect session" }, 500);
  }
};

/**
 * POST /connections/delete — disconnect a provider.
 * Body JSON: { provider: "google-mail" }
 */
export const deleteConnectionHandler = async (c: {
  req: { header: (name: string) => string | undefined; text: () => Promise<string> };
  json: (data: unknown, status?: number) => Response;
}) => {
  try {
    const body = JSON.parse(await c.req.text()) as { provider?: string };
    const provider = body.provider as NangoProvider | undefined;
    if (!provider) {
      return c.json({ error: "provider field required" }, 400);
    }
    await deleteConnection(provider, DEFAULT_USER);
    return c.json({ ok: true });
  } catch (err) {
    console.error("[Connections] Failed to delete:", err);
    return c.json({ error: "Failed to delete connection" }, 500);
  }
};

// ============================================================================
// HTML Page
// ============================================================================

function buildConnectionsPage(connectUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connections - Lavgents</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a; color: #e5e5e5;
      min-height: 100vh; padding: 2rem;
    }
    .container { max-width: 640px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .subtitle { color: #888; margin-bottom: 2rem; font-size: 0.9rem; }
    .card {
      background: #161616; border: 1px solid #262626; border-radius: 12px;
      padding: 1rem 1.25rem; margin-bottom: 0.75rem;
      display: flex; align-items: center; justify-content: space-between;
      transition: border-color 0.15s;
    }
    .card:hover { border-color: #404040; }
    .card-info { flex: 1; }
    .card-name { font-weight: 600; font-size: 1rem; }
    .card-desc { color: #888; font-size: 0.8rem; margin-top: 0.2rem; }
    .badge {
      font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: 99px;
      font-weight: 500; margin-left: 0.5rem; display: inline-block;
      vertical-align: middle;
    }
    .badge-connected { background: #052e16; color: #4ade80; border: 1px solid #166534; }
    .badge-disconnected { background: #1c1917; color: #a8a29e; border: 1px solid #292524; }
    button {
      padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid #333;
      background: #1a1a1a; color: #e5e5e5; cursor: pointer;
      font-size: 0.85rem; font-weight: 500; transition: all 0.15s;
      white-space: nowrap;
    }
    button:hover { background: #262626; border-color: #555; }
    button.connect { background: #1d4ed8; border-color: #2563eb; color: white; }
    button.connect:hover { background: #2563eb; }
    button.disconnect { color: #ef4444; }
    button.disconnect:hover { background: #1a0505; border-color: #7f1d1d; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .loading { text-align: center; padding: 3rem; color: #666; }
    .error { color: #ef4444; padding: 1rem; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Integrations</h1>
    <p class="subtitle">Connect services to give your agents more capabilities.</p>
    <div id="list"><div class="loading">Loading...</div></div>
  </div>
<script>
const CONNECT_URL = ${JSON.stringify(connectUrl)};

async function load() {
  try {
    const res = await fetch('/connections/list');
    const { data } = await res.json();
    render(data);
  } catch (e) {
    document.getElementById('list').innerHTML = '<div class="error">Failed to load connections</div>';
  }
}

function render(integrations) {
  const el = document.getElementById('list');
  el.innerHTML = integrations.map(i => \`
    <div class="card" id="card-\${i.provider}">
      <div class="card-info">
        <span class="card-name">\${i.name}</span>
        <span class="badge \${i.connected ? 'badge-connected' : 'badge-disconnected'}">
          \${i.connected ? 'Connected' : 'Not connected'}
        </span>
        <div class="card-desc">\${i.description}</div>
      </div>
      \${i.connected
        ? \`<button class="disconnect" onclick="disconnect('\${i.provider}')">Disconnect</button>\`
        : \`<button class="connect" onclick="connect('\${i.provider}')">Connect</button>\`
      }
    </div>
  \`).join('');
}

async function connect(provider) {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Opening...';
  try {
    const res = await fetch('/connections/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    const { data } = await res.json();
    const w = 500, h = 700;
    const left = (screen.width - w) / 2, top = (screen.height - h) / 2;
    const popup = window.open(
      data.url,
      'nango-connect',
      \`width=\${w},height=\${h},left=\${left},top=\${top}\`
    );
    const poll = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(poll);
        load();
      }
    }, 500);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Connect';
    alert('Failed to start connection flow');
  }
}

async function disconnect(provider) {
  if (!confirm('Disconnect ' + provider + '?')) return;
  const btn = event.target;
  btn.disabled = true;
  try {
    await fetch('/connections/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    load();
  } catch (e) {
    btn.disabled = false;
    alert('Failed to disconnect');
  }
}

load();
</script>
</body>
</html>`;
}
