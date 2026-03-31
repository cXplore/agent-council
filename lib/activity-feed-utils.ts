/**
 * Shared utilities for the activity feed — used by both the meetings-list feed
 * and the dashboard feed variant.
 */

export const TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  meeting_complete: { label: 'Meeting', color: 'var(--color-decision, #22c55e)', icon: '\u2714' },
  code_change:      { label: 'Code', color: 'var(--accent, #3b82f6)', icon: '\u2699' },
  worker_run:       { label: 'Worker', color: 'var(--color-action, #f59e0b)', icon: '\u23F3' },
  action_resolved:  { label: 'Resolved', color: 'var(--color-decision, #22c55e)', icon: '\u2705' },
  flag:             { label: 'Flag', color: 'var(--warning, #eab308)', icon: '\u26A0' },
};

export const SOURCE_LABELS: Record<string, string> = {
  worker: 'worker',
  interactive: 'session',
  meeting: 'meeting',
};

export function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
