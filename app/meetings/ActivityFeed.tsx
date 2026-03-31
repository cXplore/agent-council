'use client';

import { useState, useEffect } from 'react';
import type { ActivityEntry } from '@/lib/types';
import { TYPE_CONFIG, SOURCE_LABELS, timeAgo } from '@/lib/activity-feed-utils';

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

/** localStorage key for tracking last visit — scoped per location to prevent cross-page conflicts */
const STORAGE_KEY_PREFIX = 'council-activity-visit-';

interface ActivityFeedProps {
  onSelectMeeting?: (filename: string) => void;
  /** Scope key for localStorage seen-state — prevents dashboard and meetings page from conflicting */
  locationKey?: string;
}

export default function ActivityFeed({ onSelectMeeting, locationKey = 'meetings' }: ActivityFeedProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [newSinceLastVisit, setNewSinceLastVisit] = useState(0);
  const [lastVisitTimestamp, setLastVisitTimestamp] = useState<string | null>(null);

  const storageKey = `${STORAGE_KEY_PREFIX}${locationKey}`;

  useEffect(() => {
    fetch('/api/activity?limit=20')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.entries) {
          setEntries(data.entries);
          // Count entries newer than last visit (scoped to this location)
          try {
            const lastVisit = localStorage.getItem(storageKey);
            if (lastVisit) {
              setLastVisitTimestamp(lastVisit);
              const count = data.entries.filter((e: ActivityEntry) => e.timestamp > lastVisit).length;
              setNewSinceLastVisit(count);
            }
          } catch { /* ignore */ }
        }
      })
      .catch(() => {});
  }, [storageKey]);

  // Mark as seen after 3 seconds of visibility (scoped to this location)
  useEffect(() => {
    if (entries.length === 0) return;
    const timer = setTimeout(() => {
      try { localStorage.setItem(storageKey, new Date().toISOString()); } catch { /* ignore */ }
    }, 3000);
    return () => clearTimeout(timer);
  }, [entries.length, storageKey]);

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
      className="rounded-xl mb-6 overflow-hidden"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: 'var(--shadow-sm)',
      }}
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
          const hasLink = !!entry.linkedMeeting;
          const meetingFilename = hasLink ? entry.linkedMeeting!.replace(/.*[\\/]/, '') : '';
          const meetingHref = hasLink ? `/meetings?file=${encodeURIComponent(meetingFilename)}` : undefined;
          const isNew = lastVisitTimestamp && entry.timestamp > lastVisitTimestamp;

          const handleClick = hasLink
            ? (e: React.MouseEvent) => {
                if (onSelectMeeting) {
                  e.preventDefault();
                  onSelectMeeting(meetingFilename);
                }
              }
            : undefined;

          const entryStyle: React.CSSProperties = {
            ...(isFlag ? { background: 'rgba(234, 179, 8, 0.06)' } : {}),
            ...(isNew ? { borderLeft: '2px solid rgba(124, 109, 216, 0.5)', background: 'rgba(124, 109, 216, 0.04)' } : {}),
            display: 'flex',
            color: 'inherit',
            textDecoration: 'none',
          };

          const entryContent = (
            <>
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
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {SOURCE_LABELS[entry.source] ?? entry.source}
                  {hasLink && <span className="ml-1 opacity-70">&middot; view meeting</span>}
                </span>
              </div>
              <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                {timeAgo(entry.timestamp)}
              </span>
            </>
          );

          return hasLink ? (
            <a
              key={entry.id}
              href={meetingHref}
              onClick={handleClick}
              aria-label={`${typeConf.label}: ${entry.summary}`}
              className="px-4 py-2.5 flex items-start gap-3 no-underline cursor-pointer hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
              style={{ ...entryStyle, outlineColor: 'var(--accent)' }}
            >
              {entryContent}
            </a>
          ) : (
            <div
              key={entry.id}
              className="px-4 py-2.5 flex items-start gap-3"
              style={entryStyle}
            >
              {entryContent}
            </div>
          );
        })}
      </div>
    </div>
  );
}
