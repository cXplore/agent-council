/**
 * In-memory job store for async API operations.
 * Jobs are stored in a Map and auto-expire after 1 hour.
 *
 * This is appropriate for a local desktop app — not for serverless deployments.
 */

export type JobStatus = 'pending' | 'running' | 'complete' | 'failed';

export interface Job<T = unknown> {
  id: string;
  status: JobStatus;
  progress?: string;
  result?: T;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

const jobs = new Map<string, Job>();

const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return; // At most once per minute
  lastCleanup = now;
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}

let jobCounter = 0;

export function createJob(): Job {
  cleanup();
  const id = `job_${Date.now()}_${++jobCounter}`;
  const job: Job = {
    id,
    status: 'pending',
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  cleanup();
  return jobs.get(id);
}

export function updateJob(id: string, update: Partial<Job>): void {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, update);
}

export function completeJob<T>(id: string, result: T): void {
  updateJob(id, { status: 'complete', result, completedAt: Date.now() });
}

export function failJob(id: string, error: string): void {
  updateJob(id, { status: 'failed', error, completedAt: Date.now() });
}
