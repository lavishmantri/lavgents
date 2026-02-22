/** Messages sent from worker thread to main thread */
export type WorkerMessage =
  | { type: 'tick' }
  | { type: 'started' };

/** Messages sent from main thread to worker thread */
export type MainMessage =
  | { type: 'stop' };

/** Definition of a cron job to register with the scheduler */
export interface CronJobDefinition {
  id: string;
  schedule: string;       // cron expression (e.g. '*/5 * * * *')
  workflowId: string;     // Mastra workflow ID
  inputData?: Record<string, unknown>;
  enabled?: boolean;      // defaults to true
}

/** Row shape from the cron_jobs table */
export interface CronJobRow {
  job_id: string;
  schedule: string;
  workflow_id: string;
  input_data: string;     // JSON string
  last_run_at: string | null;
  enabled: number;        // 0 or 1
  created_at: string;
  updated_at: string;
}
