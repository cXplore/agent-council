'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';

interface RoadmapItem {
  type: 'DECISION' | 'OPEN' | 'ACTION' | 'RESOLVED';
  text: string;
  id: string | null;
  meeting: string;
  meetingTitle: string;
  meetingStatus: string;
  lineNumber: number;
  date: string | null;
  hash: string;
  itemStatus: 'active' | 'done' | 'stale' | 'working';
  statusNote?: string;
  statusUpdatedAt?: string;
}

interface RoadmapResponse {
  items: RoadmapItem[];
  total: number;
  meetingCount: number;
  counts: {
    active: number;
    done: number;
    stale: number;
    decisions: number;
    openQuestions: number;
  };
}

/** Group items by meeting, most recent first */
function groupByMeeting(items: RoadmapItem[]): { meeting: string; meetingTitle: string; date: string | null; items: RoadmapItem[] }[] {
  const map = new Map<string, { meetingTitle: string; date: string | null; items: RoadmapItem[] }>();
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

function TypeBadge({ type }: { type: RoadmapItem['type'] }) {
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

function StatusBadge({ status }: { status: RoadmapItem['itemStatus'] }) {
  if (status === 'active') return null;
  const config: Record<string, { bg: string; color: string; label: string }> = {
    done: { bg: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent)', label: 'Done' },
    stale: { bg: 'rgba(107, 114, 128, 0.15)', color: 'var(--text-muted)', label: 'Stale' },
    working: { bg: 'rgba(124, 109, 216, 0.2)', color: 'var(--accent)', label: '⚡ Working' },
  };
  const c = config[status];
  if (!c) return null;
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
      style={{ background: c.bg, color: c.color }}
    >
      {c.label}
    </span>
  );
}

function ProgressBar({ done, active, open, stale }: { done: number; active: number; open: number; stale: number }) {
  const total = done + active + open;
  if (total === 0) return null;

  const donePct = (done / total) * 100;
  const activePct = (active / total) * 100;

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
            {activePct > 0 && (
              <div
                className="h-full transition-all"
                style={{ width: `${activePct}%`, background: 'var(--live-green)' }}
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
        <span style={{ color: 'var(--live-green)' }}>{active} in progress</span>
        <span style={{ color: 'var(--warning)' }}>{open} open</span>
        {stale > 0 && <span>{stale} archived</span>}
      </div>
    </div>
  );
}

function ActionButtons({
  item,
  onStatusChange,
}: {
  item: RoadmapItem;
  onStatusChange: (hash: string, status: 'done' | 'active' | 'stale') => Promise<void>;
}) {
  const [updating, setUpdating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleStatusChange = async (status: 'done' | 'active' | 'stale') => {
    setUpdating(true);
    try {
      await onStatusChange(item.hash, status);
    } finally {
      setUpdating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(item.text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (updating) {
    return <span className="text-xs" style={{ color: 'var(--text-muted)' }}>...</span>;
  }

  // Show different buttons based on current status
  if (item.itemStatus === 'done') {
    return (
      <button
        onClick={() => handleStatusChange('active')}
        className="text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: 'var(--text-muted)', background: 'var(--bg)' }}
        title="Mark as active again"
      >
        Undo
      </button>
    );
  }

  if (item.itemStatus === 'stale') {
    return (
      <button
        onClick={() => handleStatusChange('active')}
        className="text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: 'var(--text-muted)', background: 'var(--bg)' }}
        title="Restore to active"
      >
        Restore
      </button>
    );
  }

  // Active items — only show for ACTION and OPEN types
  if (item.type !== 'ACTION' && item.type !== 'OPEN') return null;

  return (
    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
      <button
        onClick={() => handleStatusChange('done')}
        className="text-xs px-1.5 py-0.5 rounded"
        style={{ color: 'var(--accent)', background: 'rgba(59, 130, 246, 0.1)' }}
        title="Mark as done"
      >
        Done
      </button>
      <button
        onClick={() => handleStatusChange('stale')}
        className="text-xs px-1.5 py-0.5 rounded"
        style={{ color: 'var(--text-muted)', background: 'var(--bg)' }}
        title="Mark as stale / archived"
      >
        Stale
      </button>
      <button
        onClick={handleCopy}
        className="text-xs px-1.5 py-0.5 rounded"
        style={{ color: copied ? 'var(--live-green)' : 'var(--text-muted)', background: 'var(--bg)' }}
        title="Copy item text to clipboard"
      >
        {copied ? 'Copied' : 'Work on this'}
      </button>
    </div>
  );
}

function ItemRow({
  item,
  onStatusChange,
}: {
  item: RoadmapItem;
  onStatusChange: (hash: string, status: 'done' | 'active' | 'stale') => Promise<void>;
}) {
  const isWorking = item.itemStatus === 'working';
  return (
    <div
      className={`flex items-start gap-2 group rounded-lg ${isWorking ? 'px-2 py-1.5 -mx-2' : ''}`}
      style={isWorking ? {
        background: 'rgba(124, 109, 216, 0.08)',
        border: '1px solid rgba(124, 109, 216, 0.3)',
        animation: 'pulse 2s ease-in-out infinite',
      } : undefined}
    >
      {isWorking && (
        <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0 mt-2" style={{ background: 'var(--accent)' }} />
      )}
      <TypeBadge type={item.type} />
      <StatusBadge status={item.itemStatus} />
      <span
        className="text-sm leading-relaxed flex-1 min-w-0"
        style={{
          color: item.itemStatus === 'stale' ? 'var(--text-muted)' : 'var(--text-secondary)',
          textDecoration: item.itemStatus === 'done' && (item.type === 'ACTION' || item.type === 'OPEN') ? 'line-through' : undefined,
          opacity: item.itemStatus === 'stale' ? 0.7 : 1,
        }}
      >
        {item.text}
      </span>
      <ActionButtons item={item} onStatusChange={onStatusChange} />
    </div>
  );
}

function MeetingGroup({
  meeting,
  meetingTitle,
  date,
  items,
  onStatusChange,
}: {
  meeting: string;
  meetingTitle: string;
  date: string | null;
  items: RoadmapItem[];
  onStatusChange: (hash: string, status: 'done' | 'active' | 'stale') => Promise<void>;
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
          <ItemRow
            key={`${item.meeting}-${item.lineNumber}-${i}`}
            item={item}
            onStatusChange={onStatusChange}
          />
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
  const [data, setData] = useState<RoadmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [roadmapFilter, setRoadmapFilter] = useState<'all' | 'actions' | 'questions' | 'decisions'>('all');
  const [fetchError, setFetchError] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const prevCountsRef = useRef<{ done: number; active: number } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/roadmap');
      if (!res.ok) throw new Error('Roadmap fetch failed');
      const roadmapData: RoadmapResponse = await res.json();

      // Detect changes for visual feedback
      const newDone = roadmapData.counts?.done ?? 0;
      const newActive = roadmapData.counts?.active ?? 0;
      if (prevCountsRef.current && (prevCountsRef.current.done !== newDone || prevCountsRef.current.active !== newActive)) {
        setLastUpdate(new Date().toLocaleTimeString());
      }
      prevCountsRef.current = { done: newDone, active: newActive };

      setData(roadmapData);
      setFetchError(false);
    } catch {
      setFetchError(true);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
    // Poll every 5 seconds for live updates while the page is open
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleStatusChange = async (hash: string, status: 'done' | 'active' | 'stale') => {
    try {
      const res = await fetch('/api/roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: hash, status }),
      });
      if (!res.ok) throw new Error('Status update failed');
      // Reload data to reflect change
      await loadData();
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

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

  // Categorize items by their tracked status
  const allItems = data.items;

  // Active action items and open questions
  const activeActions = allItems.filter(i => i.type === 'ACTION' && (i.itemStatus === 'active' || i.itemStatus === 'working'));
  const activeOpen = allItems.filter(i => i.type === 'OPEN' && (i.itemStatus === 'active' || i.itemStatus === 'working'));

  // Done items: explicitly marked done + decisions + resolved
  const doneItems = allItems.filter(i => i.itemStatus === 'done');

  // Stale / archived items
  const staleItems = allItems.filter(i => i.itemStatus === 'stale');

  // Group each section by meeting
  const activeActionGroups = groupByMeeting(activeActions);
  const activeOpenGroups = groupByMeeting(activeOpen);
  const doneGroups = groupByMeeting(doneItems);
  const staleGroups = groupByMeeting(staleItems);

  const hasData = allItems.length > 0;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          Roadmap
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
          {data.counts.decisions} decision{data.counts.decisions !== 1 ? 's' : ''} made,{' '}
          {activeActions.length} action{activeActions.length !== 1 ? 's' : ''} tracked,{' '}
          {data.counts.openQuestions} question{data.counts.openQuestions !== 1 ? 's' : ''} open
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
              <div className="text-xs mb-3 flex items-center justify-between" style={{ color: 'var(--text-muted)' }}>
                <span>Overall progress</span>
                <span className="flex items-center gap-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--live-green)' }} />
                  <span>live</span>
                  {lastUpdate && <span style={{ opacity: 0.6 }}>· updated {lastUpdate}</span>}
                </span>
              </div>
              <ProgressBar
                done={doneItems.length}
                active={activeActions.length}
                open={data.counts.openQuestions}
                stale={staleItems.length}
              />
            </div>

            {/* Filter buttons */}
            <div className="flex gap-2 flex-wrap">
              {(['all', 'actions', 'questions', 'decisions'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setRoadmapFilter(f)}
                  aria-pressed={roadmapFilter === f}
                  className="text-xs px-3 py-1 rounded-full transition-colors"
                  style={{
                    background: roadmapFilter === f ? 'var(--accent-muted)' : 'transparent',
                    color: roadmapFilter === f ? 'var(--accent)' : 'var(--text-muted)',
                    border: `1px solid ${roadmapFilter === f ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >
                  {f === 'all' ? 'All' : f === 'actions' ? 'Actions' : f === 'questions' ? 'Open Questions' : 'Decisions'}
                </button>
              ))}
            </div>

            {/* In Progress section */}
            {(roadmapFilter === 'all' || roadmapFilter === 'actions') && (
            <div>
              <SectionHeader title="In Progress" count={activeActions.length} accent="var(--live-green)" />
              {activeActionGroups.length > 0 ? (
                <div
                  className="rounded-lg px-5 py-4 space-y-5"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  {activeActionGroups.map(g => (
                    <MeetingGroup key={g.meeting} {...g} onStatusChange={handleStatusChange} />
                  ))}
                </div>
              ) : (
                <EmptySection message="No active action items. All caught up." />
              )}
            </div>

            )}

            {/* Open Questions section */}
            {(roadmapFilter === 'all' || roadmapFilter === 'questions') && (
            <div>
              <SectionHeader title="Open Questions" count={data.counts.openQuestions} accent="var(--warning)" />
              {activeOpenGroups.length > 0 ? (
                <div
                  className="rounded-lg px-5 py-4 space-y-5"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  {activeOpenGroups.map(g => (
                    <MeetingGroup key={g.meeting} {...g} onStatusChange={handleStatusChange} />
                  ))}
                </div>
              ) : (
                <EmptySection message="No unresolved questions. All clear." />
              )}
            </div>

            )}

            {/* Done section */}
            {(roadmapFilter === 'all' || roadmapFilter === 'decisions') && (
            <div>
              <SectionHeader title="Done" count={doneItems.length} accent="var(--accent)" />
              {doneGroups.length > 0 ? (
                <div
                  className="rounded-lg px-5 py-4 space-y-5"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  {doneGroups.map(g => (
                    <MeetingGroup key={g.meeting} {...g} onStatusChange={handleStatusChange} />
                  ))}
                </div>
              ) : (
                <EmptySection message="No completed items yet." />
              )}
            </div>

            )}

            {/* Archived / Stale section — collapsed by default */}
            {staleItems.length > 0 && (
              <div>
                <button
                  onClick={() => setArchivedOpen(!archivedOpen)}
                  className="flex items-center gap-2 mb-4 group"
                  aria-expanded={archivedOpen}
                >
                  <span
                    className="text-xs transition-transform"
                    style={{
                      color: 'var(--text-muted)',
                      transform: archivedOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                      display: 'inline-block',
                    }}
                  >
                    &#9654;
                  </span>
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--text-muted)' }}>
                    Archived
                  </h2>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full tabular-nums"
                    style={{ background: 'rgba(107, 114, 128, 0.15)', color: 'var(--text-muted)' }}
                  >
                    {staleItems.length}
                  </span>
                </button>
                {archivedOpen && (
                  <div
                    className="rounded-lg px-5 py-4 space-y-5"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', opacity: 0.8 }}
                  >
                    {staleGroups.map(g => (
                      <MeetingGroup key={g.meeting} {...g} onStatusChange={handleStatusChange} />
                    ))}
                  </div>
                )}
              </div>
            )}

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
    <Suspense fallback={<div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>}>
      <RoadmapInner />
    </Suspense>
  );
}
