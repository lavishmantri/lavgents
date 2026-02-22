import { createClient, type Client } from '@libsql/client';
import type { CronJobDefinition, CronJobRow } from './types.js';

export class CronStore {
  private db: Client;

  constructor(dbUrl: string) {
    this.db = createClient({ url: dbUrl });
  }

  async init(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS cron_jobs (
        job_id       TEXT PRIMARY KEY,
        schedule     TEXT NOT NULL,
        workflow_id  TEXT NOT NULL,
        input_data   TEXT NOT NULL DEFAULT '{}',
        last_run_at  TEXT,
        enabled      INTEGER NOT NULL DEFAULT 1,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  async upsertJob(job: CronJobDefinition): Promise<void> {
    await this.db.execute({
      sql: `
        INSERT INTO cron_jobs (job_id, schedule, workflow_id, input_data, enabled)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(job_id) DO UPDATE SET
          schedule    = excluded.schedule,
          workflow_id = excluded.workflow_id,
          input_data  = excluded.input_data,
          enabled     = excluded.enabled,
          updated_at  = datetime('now')
      `,
      args: [
        job.id,
        job.schedule,
        job.workflowId,
        JSON.stringify(job.inputData ?? {}),
        (job.enabled ?? true) ? 1 : 0,
      ],
    });
  }

  async getEnabledJobs(): Promise<CronJobRow[]> {
    const result = await this.db.execute(
      'SELECT * FROM cron_jobs WHERE enabled = 1'
    );
    return result.rows as unknown as CronJobRow[];
  }

  async updateLastRun(jobId: string, timestamp: Date): Promise<void> {
    await this.db.execute({
      sql: `
        UPDATE cron_jobs
        SET last_run_at = ?, updated_at = datetime('now')
        WHERE job_id = ?
      `,
      args: [timestamp.toISOString(), jobId],
    });
  }
}
