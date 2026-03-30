'use client';

import { useState, useEffect } from 'react';
import type { ActivityEntry } from '@/lib/types';

/**
 * Activity Feed — "What happened while I was gone?"
 *
 * Primary reader: the user returning between sessions.
 * Design decisions (from 2026-03-30 design review):
 * - Type is the primary badge (what happened), source is secondary metadata
 * - No polling — feed is fresh on page load, sufficient for between-sessions use
 *   Trigger to add polling: worker run duration > 2 minutes or user requests live view
 * - linkedMeeting entries are navigable (click opens the meeting)
 * - flag entries get distinct amber/warning treatment
 * - This feed is NOT the worker log — worker log is verbose scratchpad,
 *   feed is curated one-line digest of user-visible changes
 */

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  meeting_complete: { label: 'Meeting', color: 'var(--color-decision, #22c55e)', icon: '\u2714' },
  code_change:      { label: 'Code', color: 'var(--accent, #3b82f6)', icon: '\u2699' },
  worker_run:       { label: 'Worker', color: 'var(--color-action, #f59e0b)', icon: '\u23F3' },
  action_resolved:  { label: 'Resolved', color: 'var(--color-decision, #22c55e)', icon: '\u2705' },
  flag:             { label: 'Flag', color: 'var(--warning, #eab308)', icon: '\u26A0' },
};

const SOURCE_LABELS: Record<string, string> = {
  worker: 'worker',
  interactive: 'session',
  meeting: 'meeting',
};

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface ActivityFeedProps {
  onSelectMeeting?: (filename: string) => void;
}

export default function ActivityFeed({ onSelectMeeting }: ActivityFeedProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch('/api/activity?limit=10')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.entries) setEntries(data.entries);
      })
      .catch(() => {});
  }, []);

  if (entries.length === 0) return null;

  const shown = expanded ? entries : entries.slice(0, 3);

  return (
    <div
      className="rounded-lg mb-6 overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-xs font-medium tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>
          Recent Activity
        </span>
        {entries.length > 3 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs"
            style={{ color: 'var(--accent)' }}
          >
            {expanded ? 'Show less' : `Show all (${entries.length})`}
          </button>
        )}
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {shown.map((entry) => {
          const typeConf = TYPE_CONFIG[entry.type] ?? { label: entry.type, color: 'var(--text-muted)', icon: '\u2022' };
          const isFlag = entry.type === 'flag';
          const isNavigable = entry.linkedMeeting && onSelectMeeting;

          return (
            <div
              key={entry.id}
              className={`px-4 py-2.5 flex items-start gap-3 ${isNavigable ? 'cursor-pointer hover:brightness-110' : ''}`}
              style={isFlag ? { background: 'rgba(234, 179, 8, 0.06)' } : undefined}
              onClick={isNavigable ? () => onSelectMeeting(entry.linkedMeeting!.replace(/.*[\\/]/, '')) : undefined}
            >
              {/* Type badge (primary) */}
              <span
                className="text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 flex items-center gap-1"
                style={{
                  color: typeConf.color,
                  background: isFlag ? 'rgba(234, 179, 8, 0.12)' : 'var(--bg-elevated)',
                  border: `1px solid ${isFlag ? 'rgba(234, 179, 8, 0.4)' : typeConf.color}`,
                  opacity: 0.9,
                }}
              >
                <span>{typeConf.icon}</span>
                {typeConf.label}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-sm block" style={{ color: isFlag ? 'var(--warning, #eab308)' : 'var(--text-secondary)' }}>
                  {entry.summary}
                </span>
                {/* Source as secondary metadata */}
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {SOURCE_LABELS[entry.source] ?? entry.source}
                  {isNavigable && <span className="ml-1 opacity-70">&middot; click to view</span>}
                </span>
              </div>
              <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                {timeAgo(entry.timestamp)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
