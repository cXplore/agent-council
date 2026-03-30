'use client';

import { useState, useEffect } from 'react';
import type { ActivityEntry } from '@/lib/types';

const SOURCE_LABELS: Record<string, string> = {
  worker: 'Worker',
  interactive: 'Session',
  meeting: 'Meeting',
};

const SOURCE_COLORS: Record<string, string> = {
  worker: 'var(--color-action, #f59e0b)',
  interactive: 'var(--accent, #3b82f6)',
  meeting: 'var(--color-decision, #22c55e)',
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

export default function ActivityFeed() {
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
        {shown.map((entry) => (
          <div key={entry.id} className="px-4 py-2.5 flex items-start gap-3">
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5"
              style={{
                color: SOURCE_COLORS[entry.source] ?? 'var(--text-muted)',
                background: 'var(--bg-elevated)',
                border: `1px solid ${SOURCE_COLORS[entry.source] ?? 'var(--border)'}`,
                opacity: 0.9,
              }}
            >
              {SOURCE_LABELS[entry.source] ?? entry.source}
            </span>
            <span className="text-sm flex-1" style={{ color: 'var(--text-secondary)' }}>
              {entry.summary}
            </span>
            <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
              {timeAgo(entry.timestamp)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
