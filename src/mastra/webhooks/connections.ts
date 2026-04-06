import {
  createConnectSession,
  listAllConnections,
  deleteConnection,
  hasConnection,
  setConnectionMetadata,
  getConnectionMetadata,
  type NangoProvider,
} from "../integrations/nango";
import { fetchConnectionIdentity } from "../integrations/connection-identity";

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

// ============================================================================
// Middleware Handlers
// ============================================================================

/**
 * Middleware: GET /connections — serve the connections management UI.
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
 * Middleware: GET /connections/list — list all connections grouped by provider.
 */
export const listConnectionsHandler = async (
  c: { req: { method: string; path: string }; json: (data: unknown, status?: number) => Response },
  next: () => Promise<void>,
) => {
  if (c.req.method !== "GET" || c.req.path !== "/connections/list") {
    return next();
  }
  try {
    const allConnections = await listAllConnections();

    // Fetch metadata for all connections in parallel; auto-name lazily if missing
    const withMeta = await Promise.all(
      allConnections.map(async (conn) => {
        let meta = await getConnectionMetadata(
          conn.provider as NangoProvider,
          conn.connectionId,
        );

        // Lazy auto-naming: if no metadata yet (e.g. legacy "lavish" connections),
        // fetch identity from provider and store it now.
        if (!meta?.autoName) {
          const identity = await fetchConnectionIdentity(
            conn.provider as NangoProvider,
            conn.connectionId,
          );
          if (identity) {
            await setConnectionMetadata(
              conn.provider as NangoProvider,
              conn.connectionId,
              { autoName: identity, displayName: identity },
            );
            meta = { autoName: identity, displayName: identity };
          }
        }

        return {
          ...conn,
          displayName: meta?.displayName ?? meta?.autoName ?? conn.connectionId,
          autoName: meta?.autoName ?? null,
        };
      }),
    );

    // Group connections by provider
    const byProvider: Record<string, typeof withMeta> = {};
    for (const conn of withMeta) {
      if (!byProvider[conn.provider]) byProvider[conn.provider] = [];
      byProvider[conn.provider].push(conn);
    }

    // Merge with INTEGRATIONS metadata
    const result = INTEGRATIONS.map((integration) => ({
      ...integration,
      connections: (byProvider[integration.provider] ?? []).map((c) => ({
        connectionId: c.connectionId,
        displayName: c.displayName,
        autoName: c.autoName,
        createdAt: c.createdAt,
      })),
    }));

    return c.json({ data: result });
  } catch (err) {
    console.error("[Connections] Failed to list:", err);
    return c.json({ error: "Failed to list connections" }, 500);
  }
};

// ============================================================================
// API Route Handlers
// ============================================================================

/**
 * POST /connections/session — create a Nango connect session.
 * Body JSON: { provider: "google-mail" }
 * Returns the connect URL plus the new connectionId to use for completion.
 */
export const createSessionHandler = async (c: {
  req: { header: (name: string) => string | undefined; text: () => Promise<string> };
  json: (data: unknown, status?: number) => Response;
}) => {
  try {
    const body = JSON.parse(await c.req.text()) as { provider?: string };
    const provider = body.provider as NangoProvider | undefined;
    if (!provider) {
      return c.json({ error: "provider field required" }, 400);
    }

    // Generate a unique ID for this connection — used as both local ref and Nango end_user.id
    const connectionId = crypto.randomUUID();

    const session = await createConnectSession(provider, connectionId);
    return c.json({ data: { ...session, connectionId } });
  } catch (err) {
    console.error("[Connections] Failed to create session:", err);
    return c.json({ error: "Failed to create connect session" }, 500);
  }
};

/**
 * POST /connections/complete — finalize a connection after OAuth popup closes.
 * Body JSON: { provider: "google-mail", connectionId: "uuid" }
 * Verifies connection exists in Nango, fetches identity, stores metadata.
 */
export const completeConnectionHandler = async (c: {
  req: { header: (name: string) => string | undefined; text: () => Promise<string> };
  json: (data: unknown, status?: number) => Response;
}) => {
  try {
    const body = JSON.parse(await c.req.text()) as {
      provider?: string;
      connectionId?: string;
    };
    const provider = body.provider as NangoProvider | undefined;
    const connectionId = body.connectionId;

    if (!provider || !connectionId) {
      return c.json({ error: "provider and connectionId required" }, 400);
    }

    // Verify the connection actually exists in Nango (user may have cancelled)
    const connected = await hasConnection(provider, connectionId);
    if (!connected) {
      return c.json({ ok: false, reason: "connection_not_found" });
    }

    // Fetch provider identity and store as metadata
    const identity = await fetchConnectionIdentity(provider, connectionId);
    if (identity) {
      await setConnectionMetadata(provider, connectionId, {
        autoName: identity,
        displayName: identity,
      });
    }

    return c.json({
      ok: true,
      connection: {
        connectionId,
        displayName: identity ?? connectionId,
        autoName: identity ?? null,
      },
    });
  } catch (err) {
    console.error("[Connections] Failed to complete connection:", err);
    return c.json({ error: "Failed to complete connection" }, 500);
  }
};

/**
 * POST /connections/delete — disconnect a specific connection.
 * Body JSON: { provider: "google-mail", connectionId: "uuid" }
 */
export const deleteConnectionHandler = async (c: {
  req: { header: (name: string) => string | undefined; text: () => Promise<string> };
  json: (data: unknown, status?: number) => Response;
}) => {
  try {
    const body = JSON.parse(await c.req.text()) as {
      provider?: string;
      connectionId?: string;
    };
    const provider = body.provider as NangoProvider | undefined;
    const connectionId = body.connectionId;

    if (!provider || !connectionId) {
      return c.json({ error: "provider and connectionId required" }, 400);
    }

    await deleteConnection(provider, connectionId);
    return c.json({ ok: true });
  } catch (err) {
    console.error("[Connections] Failed to delete:", err);
    return c.json({ error: "Failed to delete connection" }, 500);
  }
};

/**
 * POST /connections/rename — set a custom display name on a connection.
 * Body JSON: { provider: "google-mail", connectionId: "uuid", name: "Work Gmail" }
 */
export const renameConnectionHandler = async (c: {
  req: { header: (name: string) => string | undefined; text: () => Promise<string> };
  json: (data: unknown, status?: number) => Response;
}) => {
  try {
    const body = JSON.parse(await c.req.text()) as {
      provider?: string;
      connectionId?: string;
      name?: string;
    };
    const provider = body.provider as NangoProvider | undefined;
    const connectionId = body.connectionId;
    const name = body.name?.trim();

    if (!provider || !connectionId || !name) {
      return c.json({ error: "provider, connectionId, and name required" }, 400);
    }

    await setConnectionMetadata(provider, connectionId, { displayName: name });
    return c.json({ ok: true });
  } catch (err) {
    console.error("[Connections] Failed to rename:", err);
    return c.json({ error: "Failed to rename connection" }, 500);
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
    .container { max-width: 720px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .subtitle { color: #888; margin-bottom: 2rem; font-size: 0.9rem; }

    /* Provider section */
    .provider-section {
      background: #161616; border: 1px solid #262626; border-radius: 12px;
      margin-bottom: 1rem; overflow: hidden;
    }
    .provider-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 1rem 1.25rem; border-bottom: 1px solid #1e1e1e;
    }
    .provider-header:last-child { border-bottom: none; }
    .provider-info { flex: 1; }
    .provider-name { font-weight: 600; font-size: 1rem; }
    .provider-desc { color: #888; font-size: 0.8rem; margin-top: 0.2rem; }

    /* Connection rows */
    .connections-list { padding: 0 0.5rem 0.5rem; }
    .conn-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.6rem 0.75rem; border-radius: 8px; margin-top: 0.5rem;
      background: #0f0f0f; border: 1px solid #1e1e1e;
    }
    .conn-row:hover { border-color: #333; }
    .conn-info { flex: 1; min-width: 0; }
    .conn-name { font-weight: 500; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .conn-id {
      font-size: 0.72rem; color: #555; margin-top: 0.15rem;
      font-family: monospace; cursor: pointer; display: inline-flex; align-items: center; gap: 0.3rem;
    }
    .conn-id:hover { color: #888; }
    .conn-date { font-size: 0.75rem; color: #666; margin-left: 1rem; white-space: nowrap; }
    .conn-actions { display: flex; gap: 0.4rem; margin-left: 0.75rem; flex-shrink: 0; }

    .empty-state { padding: 0.75rem 1.25rem 1rem; color: #555; font-size: 0.85rem; }

    /* Buttons */
    button {
      padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid #333;
      background: #1a1a1a; color: #e5e5e5; cursor: pointer;
      font-size: 0.8rem; font-weight: 500; transition: all 0.15s;
      white-space: nowrap;
    }
    button:hover { background: #262626; border-color: #555; }
    button.add { background: #1d4ed8; border-color: #2563eb; color: white; padding: 0.4rem 0.9rem; }
    button.add:hover { background: #2563eb; }
    button.rename { color: #a3a3a3; }
    button.rename:hover { background: #1a1a1a; border-color: #555; color: #e5e5e5; }
    button.disconnect { color: #ef4444; }
    button.disconnect:hover { background: #1a0505; border-color: #7f1d1d; }
    button:disabled { opacity: 0.4; cursor: not-allowed; }

    /* Nav */
    nav { display: flex; gap: 0.25rem; margin-bottom: 2rem; }
    nav a {
      padding: 0.4rem 0.9rem; border-radius: 6px;
      text-decoration: none; font-size: 0.85rem; font-weight: 500;
      color: #888; transition: all 0.15s;
    }
    nav a:hover { color: #e5e5e5; background: #1a1a1a; }
    nav a.active { color: #e5e5e5; background: #1a1a1a; border: 1px solid #333; }

    .loading { text-align: center; padding: 3rem; color: #666; }
    .error { color: #ef4444; padding: 1rem; text-align: center; }
    .copied-toast {
      position: fixed; bottom: 1.5rem; right: 1.5rem;
      background: #1a3a1a; border: 1px solid #166534; color: #4ade80;
      padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.85rem;
      opacity: 0; transition: opacity 0.2s;
    }
    .copied-toast.show { opacity: 1; }
  </style>
</head>
<body>
  <div class="container">
    <nav>
      <a href="/connections" class="active">Connections</a>
      <a href="/crons">Cron Jobs</a>
    </nav>
    <h1>Connections</h1>
    <p class="subtitle">Connect services to give your agents more capabilities. Multiple accounts per service are supported.</p>
    <div id="list"><div class="loading">Loading...</div></div>
  </div>
  <div class="copied-toast" id="toast">Copied!</div>

<script>
const CONNECT_URL = ${JSON.stringify(connectUrl)};

async function load() {
  try {
    const res = await fetch('/connections/list');
    const { data, error } = await res.json();
    if (error) throw new Error(error);
    render(data);
  } catch (e) {
    document.getElementById('list').innerHTML = '<div class="error">Failed to load connections: ' + e.message + '</div>';
  }
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return days + 'd ago';
  return d.toLocaleDateString();
}

function render(integrations) {
  const el = document.getElementById('list');
  el.innerHTML = integrations.map(integration => {
    const connRows = integration.connections.map(conn => \`
      <div class="conn-row" id="conn-\${conn.connectionId}">
        <div class="conn-info">
          <div class="conn-name">\${escHtml(conn.displayName)}</div>
          <span class="conn-id" onclick="copyId('\${escHtml(conn.connectionId)}')" title="Click to copy connection ID">
            \${escHtml(conn.connectionId.length > 32 ? conn.connectionId.slice(0, 8) + '...' + conn.connectionId.slice(-4) : conn.connectionId)}
            <span style="opacity:0.5">⊕</span>
          </span>
        </div>
        <span class="conn-date">\${formatDate(conn.createdAt)}</span>
        <div class="conn-actions">
          <button class="rename" onclick="renameConn('\${escHtml(integration.provider)}', '\${escHtml(conn.connectionId)}', '\${escHtml(conn.displayName)}')">Rename</button>
          <button class="disconnect" onclick="disconnectConn('\${escHtml(integration.provider)}', '\${escHtml(conn.connectionId)}')">Disconnect</button>
        </div>
      </div>
    \`).join('');

    const emptyState = integration.connections.length === 0
      ? '<div class="empty-state">No accounts connected</div>'
      : '';

    return \`
      <div class="provider-section">
        <div class="provider-header">
          <div class="provider-info">
            <div class="provider-name">\${escHtml(integration.name)}</div>
            <div class="provider-desc">\${escHtml(integration.description)}</div>
          </div>
          <button class="add" onclick="addConnection('\${escHtml(integration.provider)}')">+ Add Account</button>
        </div>
        \${connRows || emptyState ? '<div class="connections-list">' + connRows + emptyState + '</div>' : ''}
      </div>
    \`;
  }).join('');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function addConnection(provider) {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Opening...';
  try {
    const res = await fetch('/connections/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    const { data, error } = await res.json();
    if (error) throw new Error(error);

    const { url, connectionId } = data;
    const w = 500, h = 700;
    const left = (screen.width - w) / 2, top = (screen.height - h) / 2;
    const popup = window.open(url, 'nango-connect', \`width=\${w},height=\${h},left=\${left},top=\${top}\`);

    const poll = setInterval(async () => {
      if (!popup || popup.closed) {
        clearInterval(poll);
        // Finalize: verify + auto-name
        try {
          await fetch('/connections/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, connectionId }),
          });
        } catch {}
        load();
      }
    }, 500);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '+ Add Account';
    alert('Failed to start connection flow: ' + e.message);
  }
}

async function disconnectConn(provider, connectionId) {
  const displayName = document.querySelector(\`#conn-\${connectionId} .conn-name\`)?.textContent || connectionId;
  if (!confirm(\`Disconnect "\${displayName}"?\`)) return;
  try {
    const res = await fetch('/connections/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, connectionId }),
    });
    const { ok, error } = await res.json();
    if (!ok) throw new Error(error || 'Failed');
    load();
  } catch (e) {
    alert('Failed to disconnect: ' + e.message);
  }
}

async function renameConn(provider, connectionId, currentName) {
  const newName = prompt('Rename connection:', currentName);
  if (!newName || newName.trim() === currentName) return;
  try {
    const res = await fetch('/connections/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, connectionId, name: newName.trim() }),
    });
    const { ok, error } = await res.json();
    if (!ok) throw new Error(error || 'Failed');
    load();
  } catch (e) {
    alert('Failed to rename: ' + e.message);
  }
}

function copyId(connectionId) {
  navigator.clipboard.writeText(connectionId).then(() => {
    const toast = document.getElementById('toast');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  });
}

load();
</script>
</body>
</html>`;
}
