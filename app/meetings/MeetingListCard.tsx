'use client';

import { useState, useEffect } from 'react';
import type { MeetingListItem } from '@/lib/types';

// Shared interval: one 60s timer drives all useRelativeTime consumers
let subscriberCount = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  subscriberCount++;
  if (subscriberCount === 1) {
    intervalId = setInterval(() => {
      listeners.forEach((fn) => fn());
    }, 60_000);
  }
  return () => {
    listeners.delete(listener);
    subscriberCount--;
    if (subscriberCount === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

/** Hook that returns a live-updating relative time string, refreshing every 60s. */
function useRelativeTime(isoDate: string): string {
  const [display, setDisplay] = useState(() => formatTimeAgo(isoDate));

  useEffect(() => {
    // Sync immediately in case isoDate changed
    setDisplay(formatTimeAgo(isoDate));
    const unsubscribe = subscribe(() => {
      setDisplay(formatTimeAgo(isoDate));
    });
    return unsubscribe;
  }, [isoDate]);

  return display;
}

export function formatType(type: string): string {
  return type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Get a subtle HSL color for each meeting type */
export function getTypeColor(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('design')) return 'hsl(210, 60%, 60%)';
  if (t.includes('strategy')) return 'hsl(270, 50%, 60%)';
  if (t.includes('architecture')) return 'hsl(180, 50%, 50%)';
  if (t.includes('sprint')) return 'hsl(30, 70%, 55%)';
  if (t.includes('standup')) return 'hsl(150, 50%, 50%)';
  if (t.includes('retrospective')) return 'hsl(330, 55%, 60%)';
  if (t.includes('incident')) return 'hsl(0, 60%, 55%)';
  return 'var(--text-muted)';
}

/** Get a subtle type indicator character for meeting types */
export function getTypeIndicator(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('standup')) return '\u25B3'; // triangle
  if (t.includes('design')) return '\u25CB'; // circle
  if (t.includes('strategy')) return '\u25C7'; // diamond
  if (t.includes('architecture')) return '\u25A1'; // square
  if (t.includes('retrospective')) return '\u25C1'; // left-pointing triangle
  if (t.includes('sprint')) return '\u25B7'; // right-pointing triangle
  if (t.includes('incident')) return '\u25CF'; // filled circle
  return '\u25CB'; // default: circle
}

export function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Format duration between two ISO timestamps into a human-readable string */
export function formatDuration(started: string, ended: string): string {
  const ms = new Date(ended).getTime() - new Date(started).getTime();
  if (ms < 0) return '';
  const totalMins = Math.round(ms / 60000);
  if (totalMins < 1) return '<1 min';
  if (totalMins < 60) return `~${totalMins} min`;
  const hours = totalMins / 60;
  if (hours < 10) {
    const rounded = Math.round(hours * 10) / 10;
    return rounded === Math.floor(rounded)
      ? `~${Math.floor(rounded)} hr${Math.floor(rounded) !== 1 ? 's' : ''}`
      : `~${rounded} hrs`;
  }
  return `~${Math.round(hours)} hrs`;
}

/** Small muted badge for project names */
export function ProjectBadge({ project }: { project: string }) {
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded"
      style={{
        color: 'var(--text-muted)',
        background: 'var(--border)',
        whiteSpace: 'nowrap',
      }}
    >
      {project}
    </span>
  );
}

interface MeetingListCardProps {
  meeting: MeetingListItem;
  onSelect: (filename: string) => void;
  onDelete: (filename: string) => void;
  taggedMeetings: Set<string>;
  hasMultipleProjects: boolean;
  focused?: boolean;
  tagCounts?: { decisions: number; open: number; actions: number };
  pinned?: boolean;
  onTogglePin?: (filename: string) => void;
}

export default function MeetingListCard({
  meeting: m,
  onSelect,
  onDelete,
  taggedMeetings,
  hasMultipleProjects,
  focused,
  tagCounts,
  pinned,
  onTogglePin,
}: MeetingListCardProps) {
  const timeAgo = useRelativeTime(m.modifiedAt);

  return (
    <div
      key={m.filename}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(m.filename)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(m.filename); } }}
      className="w-full text-left rounded-lg p-4 transition-colors hover:brightness-110 group cursor-pointer"
      style={{
        background: 'var(--bg-card)',
        border: focused
          ? '1px solid var(--accent)'
          : m.status === 'in-progress'
            ? '1px solid var(--live-green)'
            : '1px solid var(--border)',
      }}
    >
      <div className="flex items-center gap-3 mb-1">
        <span
          className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${m.status === 'in-progress' ? 'animate-pulse' : ''}`}
          style={{
            background: m.status === 'in-progress' ? 'var(--live-green)' : 'var(--text-muted)',
          }}
        />
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {m.title || formatType(m.type)}
        </span>
        {m.status === 'in-progress' && (
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'var(--live-green-muted)', color: 'var(--live-green)' }}
          >
            LIVE
          </span>
        )}
        {taggedMeetings.size > 0 && m.status === 'complete' && !taggedMeetings.has(m.filename) && (
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            title="This meeting predates the tagging system — outcomes not indexed"
          >
            untagged
          </span>
        )}
        {m.filename.startsWith('example-') && (
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
          >
            SAMPLE
          </span>
        )}
        {hasMultipleProjects && m.project && (
          <ProjectBadge project={m.project} />
        )}
      </div>
      <div className="flex items-center gap-2 ml-5 mb-1">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          <span style={{ marginRight: 4, opacity: 0.8, color: getTypeColor(m.type) }}>{getTypeIndicator(m.type)}</span>
          {formatType(m.type)}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>&middot;</span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {m.date}
        </span>
        {m.participants.length > 0 && (
          <>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>&middot;</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {m.participants.length} agent{m.participants.length !== 1 ? 's' : ''}
            </span>
          </>
        )}
        {m.status === 'complete' && m.started && (() => {
          const dur = formatDuration(m.started, m.modifiedAt);
          return dur ? (
            <>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>&middot;</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{dur}</span>
            </>
          ) : null;
        })()}
        {m.wordCount && m.wordCount > 100 && (
          <>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>&middot;</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {m.wordCount > 1000 ? `${(m.wordCount / 1000).toFixed(1)}k` : m.wordCount} words
            </span>
          </>
        )}
      </div>

      {m.participants.length > 0 && (
        <div className="text-xs mt-1 ml-5" style={{ color: 'var(--text-muted)' }}>
          {m.participants.join(', ')}
        </div>
      )}

      {m.preview && (
        <div className="text-xs mt-2 ml-5 line-clamp-2" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
          {m.preview}
        </div>
      )}

      <div className="flex items-center justify-between mt-2 ml-5">
        <span className="flex items-center gap-1.5">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {timeAgo}
          </span>
          {tagCounts && (tagCounts.decisions > 0 || tagCounts.open > 0 || tagCounts.actions > 0) && (
            <span className="flex items-center gap-1" style={{ opacity: 0.7 }}>
              {tagCounts.decisions > 0 && (
                <span style={{ fontSize: '0.6rem', color: '#60a5fa' }} title={`${tagCounts.decisions} decision${tagCounts.decisions !== 1 ? 's' : ''}`}>
                  {tagCounts.decisions}D
                </span>
              )}
              {tagCounts.open > 0 && (
                <span style={{ fontSize: '0.6rem', color: '#fbbf24' }} title={`${tagCounts.open} open question${tagCounts.open !== 1 ? 's' : ''}`}>
                  {tagCounts.open}Q
                </span>
              )}
              {tagCounts.actions > 0 && (
                <span style={{ fontSize: '0.6rem', color: '#4ade80' }} title={`${tagCounts.actions} action${tagCounts.actions !== 1 ? 's' : ''}`}>
                  {tagCounts.actions}A
                </span>
              )}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1">
          {onTogglePin && (
            <button
              onClick={(e) => { e.stopPropagation(); onTogglePin(m.filename); }}
              className={`text-xs px-1.5 py-0.5 rounded transition-opacity ${pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
              style={{ color: pinned ? 'var(--accent)' : 'var(--text-muted)' }}
              title={pinned ? 'Unpin meeting' : 'Pin to top'}
            >
              {pinned ? '\u{1F4CC}' : '\u{1F4CC}'}
            </button>
          )}
          {m.status !== 'in-progress' && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(m.filename); }}
              className="text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: 'var(--text-muted)' }}
            >
              Delete
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
