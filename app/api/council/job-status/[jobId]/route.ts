import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/job-store';

/**
 * GET /api/council/job-status/[jobId]
 *
 * Poll the status of an async job (e.g., multi-consult meeting).
 *
 * Returns:
 * - { status: 'pending' | 'running', progress?: string } — still working
 * - { status: 'complete', result: {...} } — done, result included
 * - { status: 'failed', error: string } — failed with error message
 * - 404 — job not found (expired or invalid ID)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json(
      { error: 'Job not found — it may have expired (1 hour TTL) or the ID is invalid' },
      { status: 404 },
    );
  }

  if (job.status === 'complete') {
    return NextResponse.json({
      status: 'complete',
      result: job.result,
      elapsed: job.completedAt ? job.completedAt - job.createdAt : undefined,
    });
  }

  if (job.status === 'failed') {
    return NextResponse.json({
      status: 'failed',
      error: job.error,
      elapsed: job.completedAt ? job.completedAt - job.createdAt : undefined,
    });
  }

  return NextResponse.json({
    status: job.status,
    progress: job.progress,
  });
}
