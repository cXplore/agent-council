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
  const [newSinceLastVisit, setNewSinceLastVisit] = useState(0);
  const [lastVisitTimestamp, setLastVisitTimestamp] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/activity?limit=20')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.entries) {
          setEntries(data.entries);
          // Count entries newer than last visit
          try {
            const lastVisit = localStorage.getItem('council-last-visit');
            if (lastVisit) {
              setLastVisitTimestamp(lastVisit);
              const count = data.entries.filter((e: ActivityEntry) => e.timestamp > lastVisit).length;
              setNewSinceLastVisit(count);
            }
          } catch { /* ignore */ }
        }
      })
      .catch(() => {});
  }, []);

  // Mark as seen after 3 seconds of visibility (avoids overwriting on quick refresh/reload)
  useEffect(() => {
    if (entries.length === 0) return;
    const timer = setTimeout(() => {
      try { localStorage.setItem('council-last-visit', new Date().toISOString()); } catch { /* ignore */ }
    }, 3000);
    return () => clearTimeout(timer);
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <div
        className="rounded-lg mb-6 overflow-hidden px-4 py-6 text-center"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <span className="text-xs uppercase tracking-wide font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
          Recent Activity
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Activity will appear here when the worker runs or meetings complete.
        </span>
      </div>
    );
  }

  const DEFAULT_SHOWN = 5;
  const shown = expanded ? entries : entries.slice(0, DEFAULT_SHOWN);

  return (
    <div
      className="rounded-lg mb-6 overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>
            Recent Activity
          </span>
          {newSinceLastVisit > 0 && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(124, 109, 216, 0.2)', color: '#a78bfa' }}
            >
              {newSinceLastVisit} new
            </span>
          )}
        </div>
        {entries.length > DEFAULT_SHOWN && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs"
            style={{ color: 'var(--accent)' }}
          >
            {expanded ? 'Show less' : `Show all (${entries.length})`}
          </button>
        )}
      </div>
      {/* Worker heartbeat — shows last worker activity */}
      {(() => {
        const lastWorkerRun = entries.find(e => e.source === 'worker');
        if (!lastWorkerRun) return null;
        const ago = timeAgo(lastWorkerRun.timestamp);
        const isRecent = (Date.now() - new Date(lastWorkerRun.timestamp).getTime()) < 15 * 60 * 1000; // 15 min
        return (
          <div className="px-4 py-1.5 flex items-center gap-2 text-xs" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <span style={{ color: isRecent ? '#22c55e' : 'var(--text-muted)' }}>{isRecent ? '●' : '○'}</span>
            <span>Worker {isRecent ? 'active' : 'last seen'} {ago}</span>
          </div>
        );
      })()}
      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {shown.map((entry) => {
          const typeConf = TYPE_CONFIG[entry.type] ?? { label: entry.type, color: 'var(--text-muted)', icon: '\u2022' };
          const isFlag = entry.type === 'flag';
          const isNavigable = entry.linkedMeeting && onSelectMeeting;
          const isNew = lastVisitTimestamp && entry.timestamp > lastVisitTimestamp;

          return (
            <div
              key={entry.id}
              className={`px-4 py-2.5 flex items-start gap-3 ${isNavigable ? 'cursor-pointer hover:brightness-110' : ''}`}
              style={{
                ...(isFlag ? { background: 'rgba(234, 179, 8, 0.06)' } : {}),
                ...(isNew ? { borderLeft: '2px solid rgba(124, 109, 216, 0.5)', background: 'rgba(124, 109, 216, 0.04)' } : {}),
              }}
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
