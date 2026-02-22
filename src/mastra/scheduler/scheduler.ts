import { Worker } from 'node:worker_threads';
import { Cron } from 'croner';
import type { Mastra } from '@mastra/core/mastra';
import { CronStore } from './cron-store.js';
import type { CronJobDefinition, CronJobRow, WorkerMessage } from './types.js';

const TICK_INTERVAL_MS = 30_000;

/**
 * Inline worker source (CJS).
 * Runs in a separate thread, immune to main-thread CPU load.
 * Posts a 'tick' message every TICK_INTERVAL_MS.
 */
const WORKER_SOURCE = `
'use strict';
const { parentPort } = require('node:worker_threads');
const INTERVAL = ${TICK_INTERVAL_MS};

parentPort.postMessage({ type: 'started' });

const timer = setInterval(() => {
  parentPort.postMessage({ type: 'tick' });
}, INTERVAL);

parentPort.on('message', (msg) => {
  if (msg.type === 'stop') {
    clearInterval(timer);
    process.exit(0);
  }
});
`;

export class CronScheduler {
  private store: CronStore;
  private worker: Worker | null = null;
  private mastra: Mastra | null = null;
  private running = new Set<string>();
  private jobs: CronJobDefinition[] = [];

  constructor(dbUrl: string) {
    this.store = new CronStore(dbUrl);
  }

  /** Register a job definition (call before start) */
  register(job: CronJobDefinition): void {
    this.jobs.push(job);
  }

  /** Initialize DB, upsert jobs, run catch-up, start worker */
  async start(mastra: Mastra): Promise<void> {
    this.mastra = mastra;

    await this.store.init();

    for (const job of this.jobs) {
      await this.store.upsertJob(job);
    }

    // Catch-up: run any jobs that missed their window
    await this.handleTick();

    // Start worker thread
    this.worker = new Worker(WORKER_SOURCE, { eval: true });
    this.worker.on('message', (msg: WorkerMessage) => {
      if (msg.type === 'tick') {
        this.handleTick().catch((err) => {
          console.error('[CronScheduler] Tick error:', err);
        });
      }
    });
    this.worker.on('error', (err) => {
      console.error('[CronScheduler] Worker error:', err);
    });

    console.log(`[CronScheduler] Started with ${this.jobs.length} job(s)`);
  }

  /** Check all enabled jobs and run any that are due */
  private async handleTick(): Promise<void> {
    const rows = await this.store.getEnabledJobs();
    const now = new Date();

    for (const row of rows) {
      if (this.running.has(row.job_id)) continue;
      if (this.isDue(row, now)) {
        this.executeJob(row, now);
      }
    }
  }

  /**
   * Is there a scheduled time between last_run_at and now?
   * If never run (last_run_at is null), the job is due.
   */
  private isDue(row: CronJobRow, now: Date): boolean {
    if (!row.last_run_at) return true;

    const lastRun = new Date(row.last_run_at);
    const cron = new Cron(row.schedule);
    const nextAfterLastRun = cron.nextRun(lastRun);

    if (!nextAfterLastRun) return false;
    return nextAfterLastRun <= now;
  }

  /** Fire-and-forget job execution with overlap protection */
  private executeJob(row: CronJobRow, now: Date): void {
    this.running.add(row.job_id);
    const inputData = JSON.parse(row.input_data);

    console.log(`[CronScheduler] Running job "${row.job_id}"`);

    (async () => {
      try {
        const workflow = this.mastra!.getWorkflow(row.workflow_id);
        const run = await workflow.createRun();
        const result = await run.start({ inputData });
        console.log(`[CronScheduler] Job "${row.job_id}" finished:`, result.result);
      } catch (err) {
        console.error(`[CronScheduler] Job "${row.job_id}" failed:`, err);
      } finally {
        // Update last_run_at even on failure to prevent retry storm
        await this.store.updateLastRun(row.job_id, now).catch((err) => {
          console.error(`[CronScheduler] Failed to update last_run for "${row.job_id}":`, err);
        });
        this.running.delete(row.job_id);
      }
    })();
  }

  /** Gracefully stop the worker thread */
  stop(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'stop' });
      this.worker = null;
    }
  }
}
