import { Cron } from 'croner';
import { CronStore } from '../scheduler/cron-store.js';

const DB_URL = 'file:../data/mastra.db';

// ============================================================================
// Middleware Handlers
// ============================================================================

/**
 * Middleware: GET /crons — serve the cron jobs UI.
 */
export const cronsPageHandler = async (
  c: { req: { method: string; path: string }; json: (data: unknown, status?: number) => Response },
  next: () => Promise<void>,
) => {
  if (c.req.method !== 'GET' || c.req.path !== '/crons') {
    return next();
  }
  // MASTRA_STUDIO_URL: set to Mastra Cloud studio base for cloud links,
  // e.g. https://cloud.mastra.ai/{team}/dashboard/projects/{project}/studio
  // Leave unset for local relative paths.
  const studioBase = (process.env.MASTRA_STUDIO_URL || '').replace(/\/+$/, '');
  return new Response(buildCronsPage(studioBase), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
};

/**
 * API: POST /crons/toggle — enable or disable a cron job.
 * Body JSON: { jobId: string, enabled: boolean }
 */
export const toggleCronHandler = async (c: {
  req: { text: () => Promise<string> };
  json: (data: unknown, status?: number) => Response;
}) => {
  try {
    const body = JSON.parse(await c.req.text()) as { jobId?: string; enabled?: boolean };
    if (!body.jobId || typeof body.enabled !== 'boolean') {
      return c.json({ error: 'jobId and enabled (boolean) required' }, 400);
    }
    const store = new CronStore(DB_URL);
    await store.setEnabled(body.jobId, body.enabled);
    return c.json({ ok: true });
  } catch (err) {
    console.error('[Crons] Failed to toggle:', err);
    return c.json({ error: 'Failed to toggle cron job' }, 500);
  }
};

/**
 * Middleware: GET /crons/list — return all cron jobs as JSON.
 */
export const listCronsHandler = async (
  c: { req: { method: string; path: string }; json: (data: unknown, status?: number) => Response },
  next: () => Promise<void>,
) => {
  if (c.req.method !== 'GET' || c.req.path !== '/crons/list') {
    return next();
  }
  try {
    const store = new CronStore(DB_URL);
    const rows = await store.getAllJobs();

    const data = rows.map((row) => {
      let nextRunAt: string | null = null;
      try {
        const cron = new Cron(row.schedule);
        const next = cron.nextRun();
        nextRunAt = next ? next.toISOString() : null;
      } catch {
        // invalid schedule — leave null
      }
      return {
        jobId: row.job_id,
        schedule: row.schedule,
        scheduleDescription: describeCron(row.schedule),
        workflowId: row.workflow_id,
        lastRunAt: row.last_run_at,
        nextRunAt,
        enabled: row.enabled === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    return c.json({ data });
  } catch (err) {
    console.error('[Crons] Failed to list:', err);
    return c.json({ error: 'Failed to list cron jobs' }, 500);
  }
};

// ============================================================================
// Helpers
// ============================================================================

function describeCron(schedule: string): string {
  const parts = schedule.split(' ');
  if (parts.length !== 5) return schedule;
  const [min, hour, dom, mon, dow] = parts;

  if (min.startsWith('*/') && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return `Every ${min.slice(2)} minutes`;
  }
  if (!min.includes('*') && !hour.includes('*') && dom === '*' && mon === '*' && dow === '*') {
    const h = parseInt(hour, 10);
    const m = parseInt(min, 10);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `Daily at ${h12}:${String(m).padStart(2, '0')} ${period}`;
  }
  return schedule;
}

// ============================================================================
// HTML Page
// ============================================================================

function buildCronsPage(studioBase: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cron Jobs - Lavgents</title>
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

    /* Nav */
    nav { display: flex; gap: 0.25rem; margin-bottom: 2rem; }
    nav a {
      padding: 0.4rem 0.9rem; border-radius: 6px;
      text-decoration: none; font-size: 0.85rem; font-weight: 500;
      color: #888; transition: all 0.15s;
    }
    nav a:hover { color: #e5e5e5; background: #1a1a1a; }
    nav a.active { color: #e5e5e5; background: #1a1a1a; border: 1px solid #333; }

    /* Job card */
    .job-card {
      background: #161616; border: 1px solid #262626; border-radius: 12px;
      margin-bottom: 1rem; overflow: hidden;
    }
    .job-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      padding: 1rem 1.25rem;
    }
    .job-info { flex: 1; }
    .job-id { font-weight: 600; font-size: 1rem; font-family: monospace; }
    .job-schedule { color: #888; font-size: 0.8rem; margin-top: 0.25rem; }
    .job-schedule code {
      background: #0f0f0f; border: 1px solid #1e1e1e;
      padding: 0.1rem 0.4rem; border-radius: 4px;
      font-size: 0.75rem; color: #a3a3a3; margin-right: 0.4rem;
    }

    /* Toggle switch */
    .toggle-wrap {
      display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; margin-left: 1rem;
    }
    .toggle-label { font-size: 0.72rem; font-weight: 600; }
    .toggle-label.on { color: #4ade80; }
    .toggle-label.off { color: #666; }
    .toggle {
      position: relative; width: 36px; height: 20px; cursor: pointer;
      background: #333; border-radius: 10px; border: none;
      transition: background 0.2s;
    }
    .toggle.on { background: #166534; }
    .toggle::after {
      content: ''; position: absolute; top: 2px; left: 2px;
      width: 16px; height: 16px; border-radius: 50%;
      background: #666; transition: all 0.2s;
    }
    .toggle.on::after { left: 18px; background: #4ade80; }
    .toggle:disabled { opacity: 0.4; cursor: not-allowed; }

    /* Detail rows */
    .job-details {
      border-top: 1px solid #1e1e1e;
      padding: 0.75rem 1.25rem;
      display: grid; grid-template-columns: 1fr 1fr 1fr;
      gap: 0.75rem;
    }
    .detail-item { }
    .detail-label { font-size: 0.7rem; color: #555; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem; }
    .detail-value { font-size: 0.85rem; color: #ccc; }
    .detail-value a {
      color: #60a5fa; text-decoration: none; font-family: monospace; font-size: 0.8rem;
    }
    .detail-value a:hover { text-decoration: underline; }

    .loading { text-align: center; padding: 3rem; color: #666; }
    .error { color: #ef4444; padding: 1rem; text-align: center; }
    .empty { color: #555; padding: 2rem; text-align: center; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="container">
    <nav>
      <a href="/connections">Connections</a>
      <a href="/crons" class="active">Cron Jobs</a>
    </nav>
    <h1>Cron Jobs</h1>
    <p class="subtitle">Scheduled workflows and their execution status.</p>
    <div id="list"><div class="loading">Loading...</div></div>
  </div>

<script>
const STUDIO_BASE = ${JSON.stringify(studioBase)};

async function load() {
  try {
    const res = await fetch('/crons/list');
    const { data, error } = await res.json();
    if (error) throw new Error(error);
    render(data);
  } catch (e) {
    document.getElementById('list').innerHTML = '<div class="error">Failed to load cron jobs: ' + e.message + '</div>';
  }
}

function formatAgo(iso) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  return days + 'd ago';
}

function formatIn(iso) {
  if (!iso) return 'N/A';
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  if (diff < 0) return 'Overdue';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Now';
  if (mins < 60) return 'in ' + mins + 'm';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return 'in ' + hours + 'h ' + (mins % 60) + 'm';
  return 'in ' + Math.floor(hours / 24) + 'd';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(jobs) {
  const el = document.getElementById('list');
  if (!jobs || jobs.length === 0) {
    el.innerHTML = '<div class="empty">No cron jobs registered.</div>';
    return;
  }
  el.innerHTML = jobs.map(job => \`
    <div class="job-card">
      <div class="job-header">
        <div class="job-info">
          <div class="job-id">\${escHtml(job.jobId)}</div>
          <div class="job-schedule">
            <code>\${escHtml(job.schedule)}</code>
            \${escHtml(job.scheduleDescription)}
          </div>
        </div>
        <div class="toggle-wrap">
          <span class="toggle-label \${job.enabled ? 'on' : 'off'}">\${job.enabled ? 'On' : 'Off'}</span>
          <button class="toggle \${job.enabled ? 'on' : ''}" data-job-id="\${escHtml(job.jobId)}" data-enabled="\${job.enabled}" onclick="handleToggle(this)"></button>
        </div>
      </div>
      <div class="job-details">
        <div class="detail-item">
          <div class="detail-label">Workflow</div>
          <div class="detail-value">
            <a href="\${STUDIO_BASE}/workflows/\${encodeURIComponent(job.workflowId)}/graph" target="_blank" rel="noopener">
              \${escHtml(job.workflowId)} ↗
            </a>
          </div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Last Run</div>
          <div class="detail-value">\${formatAgo(job.lastRunAt)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Next Run</div>
          <div class="detail-value">\${formatIn(job.nextRunAt)}</div>
        </div>
      </div>
    </div>
  \`).join('');
}

async function handleToggle(btn) {
  const jobId = btn.dataset.jobId;
  const newEnabled = btn.dataset.enabled !== 'true';
  btn.disabled = true;
  try {
    const res = await fetch('/crons/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, enabled: newEnabled }),
    });
    const { error } = await res.json();
    if (error) throw new Error(error);
    await load();
  } catch (e) {
    alert('Failed to toggle cron: ' + e.message);
    btn.disabled = false;
  }
}

load();
</script>
</body>
</html>`;
}
