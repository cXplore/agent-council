'use client';

import { useState, useEffect, Suspense } from 'react';

interface TagEntry {
  type: 'DECISION' | 'OPEN' | 'ACTION' | 'RESOLVED';
  text: string;
  id: string | null;
  meeting: string;
  meetingTitle: string;
  meetingStatus: string;
  lineNumber: number;
  date: string | null;
}

interface TagsResponse {
  results: TagEntry[];
  total: number;
  meetingCount: number;
}

/** Group tag entries by meeting, most recent first */
function groupByMeeting(items: TagEntry[]): { meeting: string; meetingTitle: string; date: string | null; items: TagEntry[] }[] {
  const map = new Map<string, { meetingTitle: string; date: string | null; items: TagEntry[] }>();
  for (const item of items) {
    const existing = map.get(item.meeting);
    if (existing) {
      existing.items.push(item);
    } else {
      map.set(item.meeting, { meetingTitle: item.meetingTitle, date: item.date, items: [item] });
    }
  }
  return Array.from(map.entries())
    .map(([meeting, data]) => ({ meeting, ...data }))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}

function TypeBadge({ type }: { type: TagEntry['type'] }) {
  const config: Record<string, { bg: string; color: string; label: string }> = {
    DECISION: { bg: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent)', label: 'Decision' },
    ACTION: { bg: 'rgba(34, 197, 94, 0.15)', color: 'var(--live-green)', label: 'Action' },
    OPEN: { bg: 'rgba(234, 179, 8, 0.15)', color: 'var(--warning)', label: 'Open' },
    RESOLVED: { bg: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent)', label: 'Resolved' },
  };
  const c = config[type] ?? config.DECISION;
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
      style={{ background: c.bg, color: c.color }}
    >
      {c.label}
    </span>
  );
}

function ProgressBar({ done, inProgress, open }: { done: number; inProgress: number; open: number }) {
  const total = done + inProgress + open;
  if (total === 0) return null;

  const donePct = (done / total) * 100;
  const inProgressPct = (inProgress / total) * 100;

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="h-2 flex-1 rounded-full overflow-hidden" style={{ background: 'var(--bg)' }}>
          <div className="h-full flex">
            {donePct > 0 && (
              <div
                className="h-full transition-all"
                style={{ width: `${donePct}%`, background: 'var(--accent)' }}
              />
            )}
            {inProgressPct > 0 && (
              <div
                className="h-full transition-all"
                style={{ width: `${inProgressPct}%`, background: 'var(--live-green)' }}
              />
            )}
          </div>
        </div>
        <span className="text-xs tabular-nums flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
          {Math.round(donePct)}%
        </span>
      </div>
      <div className="flex gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--accent)' }}>{done} done</span>
        <span style={{ color: 'var(--live-green)' }}>{inProgress} in progress</span>
        <span style={{ color: 'var(--warning)' }}>{open} open</span>
      </div>
    </div>
  );
}

function MeetingGroup({
  meeting,
  meetingTitle,
  date,
  items,
}: {
  meeting: string;
  meetingTitle: string;
  date: string | null;
  items: TagEntry[];
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <a
          href={`/meetings?file=${encodeURIComponent(meeting)}`}
          className="text-sm font-medium truncate hover:underline"
          style={{ color: 'var(--text-primary)' }}
        >
          {meetingTitle}
        </a>
        {date && (
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
            {date}
          </span>
        )}
      </div>
      <div className="space-y-1.5 pl-3" style={{ borderLeft: '2px solid var(--border)' }}>
        {items.map((item, i) => (
          <div key={`${item.meeting}-${item.lineNumber}-${i}`} className="flex items-start gap-2">
            <TypeBadge type={item.type} />
            <span className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {item.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  count,
  accent,
}: {
  title: string;
  count: number;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h2>
      <span
        className="text-xs px-2 py-0.5 rounded-full tabular-nums"
        style={{ background: `${accent}22`, color: accent }}
      >
        {count}
      </span>
    </div>
  );
}

function EmptySection({ message }: { message: string }) {
  return (
    <div
      className="rounded-lg px-5 py-6 text-center text-sm"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
    >
      {message}
    </div>
  );
}

function RoadmapInner() {
  const [data, setData] = useState<TagsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/meetings/tags');
        if (!res.ok) throw new Error('Tags fetch failed');
        const tagsData: TagsResponse = await res.json();
        setData(tagsData);
      } catch {
        setFetchError(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
        <div className="max-w-3xl mx-auto px-6 py-12">
          <h1 className="text-2xl font-semibold mb-6" style={{ color: 'var(--text-primary)' }}>
            Roadmap
          </h1>
          {/* Summary skeleton */}
          <div
            className="rounded-lg p-4 mb-6"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div className="loading-shimmer h-3 w-64 rounded mb-3" />
            <div className="loading-shimmer h-2 w-full rounded mb-2" />
            <div className="loading-shimmer h-3 w-48 rounded" />
          </div>
          {/* Section skeletons */}
          {[1, 2, 3].map(i => (
            <div key={i} className="mb-8">
              <div className="loading-shimmer h-5 w-32 rounded mb-4" />
              <div
                className="rounded-lg p-4 space-y-3"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              >
                <div className="loading-shimmer h-3 w-full rounded" />
                <div className="loading-shimmer h-3 w-3/4 rounded" />
                <div className="loading-shimmer h-3 w-5/6 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (fetchError || !data) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
        <div className="max-w-3xl mx-auto px-6 py-12">
          <h1 className="text-2xl font-semibold mb-6" style={{ color: 'var(--text-primary)' }}>
            Roadmap
          </h1>
          <div
            className="rounded-lg px-5 py-4 text-sm"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--error)', color: 'var(--text-secondary)' }}
          >
            Could not load roadmap data. Check that the project directory exists and try refreshing.
          </div>
        </div>
      </div>
    );
  }

  // Categorize items
  const allItems = data.results;
  const decisions = allItems.filter(r => r.type === 'DECISION');
  const resolved = allItems.filter(r => r.type === 'RESOLVED');
  const actions = allItems.filter(r => r.type === 'ACTION');
  const openItems = allItems.filter(r => r.type === 'OPEN');

  // Build resolved slug set to filter out answered open questions
  const resolvedSlugs = new Set(
    resolved.map(r => r.id).filter((id): id is string => id !== null)
  );
  const unresolvedOpen = openItems.filter(o => !o.id || !resolvedSlugs.has(o.id));

  // Done = resolved items + decisions
  const doneItems = [...resolved, ...decisions];

  // In Progress = actions from the 2 most recent meetings
  const sortedByDate = [...actions].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const recentMeetings = new Set<string>();
  for (const a of sortedByDate) {
    recentMeetings.add(a.meeting);
    if (recentMeetings.size >= 2) break;
  }
  const inProgressItems = actions.filter(a => recentMeetings.has(a.meeting));

  // Group each section by meeting
  const doneGroups = groupByMeeting(doneItems);
  const inProgressGroups = groupByMeeting(inProgressItems);
  const openGroups = groupByMeeting(unresolvedOpen);

  const hasData = allItems.length > 0;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          Roadmap
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
          {decisions.length} decision{decisions.length !== 1 ? 's' : ''} made,{' '}
          {actions.length} action{actions.length !== 1 ? 's' : ''} tracked,{' '}
          {unresolvedOpen.length} question{unresolvedOpen.length !== 1 ? 's' : ''} open
        </p>

        {!hasData ? (
          <div
            className="rounded-lg p-8 text-center"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              No meeting outcomes yet. Run a meeting to track decisions, actions, and open questions here.
            </p>
            <a
              href="/meetings"
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              View meetings
            </a>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Progress summary */}
            <div
              className="rounded-lg px-5 py-4"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <div className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                Overall progress
              </div>
              <ProgressBar
                done={doneItems.length}
                inProgress={inProgressItems.length}
                open={unresolvedOpen.length}
              />
            </div>

            {/* In Progress section */}
            <div>
              <SectionHeader title="In Progress" count={inProgressItems.length} accent="var(--live-green)" />
              {inProgressGroups.length > 0 ? (
                <div
                  className="rounded-lg px-5 py-4 space-y-5"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  {inProgressGroups.map(g => (
                    <MeetingGroup key={g.meeting} {...g} />
                  ))}
                </div>
              ) : (
                <EmptySection message="No active action items from recent meetings." />
              )}
            </div>

            {/* Open Questions section */}
            <div>
              <SectionHeader title="Open Questions" count={unresolvedOpen.length} accent="var(--warning)" />
              {openGroups.length > 0 ? (
                <div
                  className="rounded-lg px-5 py-4 space-y-5"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  {openGroups.map(g => (
                    <MeetingGroup key={g.meeting} {...g} />
                  ))}
                </div>
              ) : (
                <EmptySection message="No unresolved questions. All clear." />
              )}
            </div>

            {/* Done section */}
            <div>
              <SectionHeader title="Done" count={doneItems.length} accent="var(--accent)" />
              {doneGroups.length > 0 ? (
                <div
                  className="rounded-lg px-5 py-4 space-y-5"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  {doneGroups.map(g => (
                    <MeetingGroup key={g.meeting} {...g} />
                  ))}
                </div>
              ) : (
                <EmptySection message="No completed items yet." />
              )}
            </div>

            {/* Quick links */}
            <div className="flex gap-3 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <a href="/meetings" className="hover:underline" style={{ color: 'var(--accent)' }}>All meetings</a>
              <span>&middot;</span>
              <a href="/dashboard" className="hover:underline" style={{ color: 'var(--accent)' }}>Dashboard</a>
              <span>&middot;</span>
              <a href="/agents" className="hover:underline" style={{ color: 'var(--accent)' }}>Agents</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RoadmapPage() {
  return (
    <Suspense>
      <RoadmapInner />
    </Suspense>
  );
}
