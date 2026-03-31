'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { motion } from 'motion/react';

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25 },
};

interface RoadmapItem {
  type: 'DECISION' | 'OPEN' | 'ACTION' | 'RESOLVED' | 'CLOSED' | 'IDEA';
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
  warnings?: Array<'missing-assignee' | 'missing-done-when' | 'missing-rationale'>;
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
    CLOSED: { bg: 'rgba(107, 114, 128, 0.15)', color: 'var(--text-muted)', label: 'Closed' },
    IDEA: { bg: 'var(--color-idea-bg)', color: 'var(--color-idea)', label: 'Idea' },
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

/** Show age in days for active items — dims items >5 days old */
function AgeBadge({ date, status }: { date: string | null; status: RoadmapItem['itemStatus'] }) {
  if (!date || status !== 'active') return null;
  const ageMs = Date.now() - new Date(date).getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  if (ageDays < 2) return null; // don't clutter recent items
  const isOld = ageDays >= 5;
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded flex-shrink-0 tabular-nums"
      style={{
        background: isOld ? 'rgba(234, 179, 8, 0.12)' : 'rgba(107, 114, 128, 0.1)',
        color: isOld ? 'var(--warning)' : 'var(--text-muted)',
      }}
      title={`From meeting on ${date} (${ageDays}d ago)`}
    >
      {ageDays}d
    </span>
  );
}

const WARNING_LABELS: Record<string, string> = {
  'missing-assignee': 'No @role',
  'missing-done-when': 'No "done when:"',
  'missing-rationale': 'No "because:"',
};

function WarningIndicator({ warnings }: { warnings: Array<'missing-assignee' | 'missing-done-when' | 'missing-rationale'> }) {
  const tooltip = warnings.map(w => WARNING_LABELS[w] ?? w).join(', ');
  return (
    <span
      className="text-xs flex-shrink-0 cursor-help"
      style={{ color: 'var(--warning)', opacity: 0.8 }}
      title={tooltip}
      aria-label={`Quality warnings: ${tooltip}`}
    >
      {'\u26A0'}
    </span>
  );
}

function ProgressBar({ done, active, open, stale, animate: shouldAnimate = false }: { done: number; active: number; open: number; stale: number; animate?: boolean }) {
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
              <motion.div
                className="h-full"
                style={{ background: 'var(--accent)' }}
                initial={shouldAnimate ? { width: '0%' } : false}
                animate={{ width: `${donePct}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            )}
            {activePct > 0 && (
              <motion.div
                className="h-full"
                style={{ background: 'var(--live-green)' }}
                initial={shouldAnimate ? { width: '0%' } : false}
                animate={{ width: `${activePct}%` }}
                transition={{ duration: 0.3, ease: 'easeOut', delay: 0.05 }}
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

  const handleWorkOn = async () => {
    setCopied(true);
    navigator.clipboard.writeText(item.text).catch(() => {});
    try {
      await fetch('/api/council/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'work_on',
          message: item.text,
          value: JSON.stringify({
            itemType: item.type,
            meeting: item.meeting,
            meetingTitle: item.meetingTitle,
            hash: item.hash,
            id: item.id,
          }),
        }),
      });
    } catch {
      // POST failed silently — clipboard copy still works as fallback
    }
    setTimeout(() => setCopied(false), 2000);
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
        onClick={handleWorkOn}
        className="text-xs px-1.5 py-0.5 rounded"
        style={{ color: copied ? 'var(--live-green)' : 'var(--text-muted)', background: 'var(--bg)' }}
        title="Nudge Claude Code to work on this"
      >
        {copied ? 'Sent ✓' : 'Work on this'}
      </button>
    </div>
  );
}

function ItemRow({
  item,
  onStatusChange,
  index,
}: {
  item: RoadmapItem;
  onStatusChange: (hash: string, status: 'done' | 'active' | 'stale') => Promise<void>;
  index?: number;
}) {
  const isWorking = item.itemStatus === 'working';
  const shouldAnimate = index !== undefined && index < 10;
  const MotionOrDiv = shouldAnimate ? motion.div : 'div';
  const animProps = shouldAnimate ? {
    initial: { opacity: 0, y: 8 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.2, delay: (index ?? 0) * 0.03 },
  } : {};
  return (
    <MotionOrDiv
      className={`flex items-start gap-2 group rounded-lg ${isWorking ? 'px-2 py-1.5 -mx-2' : ''}`}
      {...animProps}
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
      <AgeBadge date={item.date} status={item.itemStatus} />
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
      {item.warnings && item.warnings.length > 0 && item.itemStatus === 'active' && (
        <WarningIndicator warnings={item.warnings} />
      )}
      <ActionButtons item={item} onStatusChange={onStatusChange} />
    </MotionOrDiv>
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
            index={i}
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
    <motion.div
      className="flex items-center gap-2 mb-4"
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.2 }}
    >
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h2>
      <span
        className="text-xs px-2 py-0.5 rounded-full tabular-nums"
        style={{ background: `${accent}22`, color: accent }}
      >
        {count}
      </span>
    </motion.div>
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

interface RecallResult {
  type: 'DECISION' | 'OPEN' | 'ACTION' | 'RESOLVED' | 'CLOSED' | 'IDEA';
  text: string;
  id: string | null;
  meeting: string;
  meetingTitle: string;
  date: string | null;
  context: string;
}

function SearchPanel() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RecallResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+K to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        inputRef.current?.blur();
        setQuery('');
        setResults([]);
        setSearched(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/meetings/tags?mode=recall&q=${encodeURIComponent(q.trim())}&types=decision,open,action`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setSearching(false);
      setSearched(true);
    }
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    debounceRef.current = setTimeout(() => doSearch(value), 400);
  };

  return (
    <div className="mb-6">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => handleInput(e.target.value)}
          placeholder="Search decisions, actions, and questions..."
          className="w-full text-sm rounded-lg px-4 py-2.5 pr-10 outline-none transition-colors"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}
          onFocus={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--accent)'; }}
          onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--border)'; }}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-muted)' }}>
          {searching ? '...' : query ? `${results.length}` : '⌘K'}
        </span>
      </div>

      {searched && query.trim() && (
        <div className="mt-3">
          {results.length === 0 ? (
            <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>
              No results for &ldquo;{query}&rdquo;
            </p>
          ) : (
            <div
              className="rounded-lg overflow-hidden divide-y"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', backdropFilter: 'blur(8px) saturate(150%)', boxShadow: 'var(--shadow-sm)' }}
            >
              {results.slice(0, 15).map((r, i) => (
                <a
                  key={`${r.meeting}-${i}`}
                  href={`/meetings?file=${encodeURIComponent(r.meeting)}`}
                  className="block px-4 py-3 hover:brightness-110 transition-all"
                >
                  <div className="flex items-start gap-2 mb-1">
                    <TypeBadge type={r.type} />
                    <span className="text-sm leading-snug flex-1" style={{ color: 'var(--text-secondary)' }}>
                      {r.text}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 ml-0.5">
                    <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                      {r.meetingTitle}
                    </span>
                    {r.date && (
                      <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                        {r.date}
                      </span>
                    )}
                  </div>
                  {r.context && (
                    <p className="text-xs mt-1.5 line-clamp-2 leading-relaxed" style={{ color: 'var(--text-muted)', opacity: 0.8 }}>
                      {r.context}
                    </p>
                  )}
                </a>
              ))}
              {results.length > 15 && (
                <div className="px-4 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  ...and {results.length - 15} more
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Simple word-overlap similarity between two strings (0-1) */
function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) if (wordsB.has(w)) overlap++;
  return overlap / Math.min(wordsA.size, wordsB.size);
}

/** Group items by text similarity into clusters */
function clusterByText(items: RoadmapItem[], threshold = 0.5): { representative: string; items: RoadmapItem[] }[] {
  const clusters: { representative: string; items: RoadmapItem[] }[] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < items.length; i++) {
    if (assigned.has(i)) continue;
    const cluster: RoadmapItem[] = [items[i]];
    assigned.add(i);

    for (let j = i + 1; j < items.length; j++) {
      if (assigned.has(j)) continue;
      if (textSimilarity(items[i].text, items[j].text) >= threshold) {
        cluster.push(items[j]);
        assigned.add(j);
      }
    }
    // Only show as cluster if there are duplicates
    if (cluster.length > 1) {
      clusters.push({ representative: items[i].text, items: cluster });
    }
  }
  return clusters;
}

function TriageBatchBar({
  selectedCount,
  onBatchDone,
  onBatchStale,
  onClear,
  updating,
}: {
  selectedCount: number;
  onBatchDone: () => void;
  onBatchStale: () => void;
  onClear: () => void;
  updating: boolean;
}) {
  if (selectedCount === 0) return null;
  return (
    <motion.div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--accent)', backdropFilter: 'blur(8px)' }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
    >
      <span className="text-sm font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
        {selectedCount} selected
      </span>
      <button
        onClick={onBatchDone}
        disabled={updating}
        className="text-xs px-3 py-1.5 rounded-lg font-medium"
        style={{ background: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent)' }}
      >
        {updating ? '...' : 'Mark Done'}
      </button>
      <button
        onClick={onBatchStale}
        disabled={updating}
        className="text-xs px-3 py-1.5 rounded-lg font-medium"
        style={{ background: 'rgba(107, 114, 128, 0.15)', color: 'var(--text-muted)' }}
      >
        {updating ? '...' : 'Archive'}
      </button>
      <button
        onClick={onClear}
        className="text-xs px-2 py-1 rounded"
        style={{ color: 'var(--text-muted)' }}
      >
        Clear
      </button>
    </motion.div>
  );
}

function TriageItemRow({
  item,
  selected,
  onToggle,
}: {
  item: RoadmapItem;
  selected: boolean;
  onToggle: (hash: string) => void;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer group py-1">
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(item.hash)}
        className="mt-1 accent-[var(--accent)] flex-shrink-0"
      />
      <TypeBadge type={item.type} />
      <AgeBadge date={item.date} status={item.itemStatus} />
      <span className="text-sm leading-relaxed flex-1 min-w-0" style={{ color: 'var(--text-secondary)' }}>
        {item.text}
      </span>
      <span className="text-[10px] font-mono flex-shrink-0 truncate max-w-[120px]" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
        {item.meetingTitle.slice(0, 30)}
      </span>
    </label>
  );
}

function RoadmapInner() {
  const [data, setData] = useState<RoadmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [roadmapFilter, setRoadmapFilter] = useState<'all' | 'actions' | 'questions' | 'decisions'>('all');
  const [fetchError, setFetchError] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [triageMode, setTriageMode] = useState(false);
  const [triageSelected, setTriageSelected] = useState<Set<string>>(new Set());
  const [triageBatchUpdating, setTriageBatchUpdating] = useState(false);
  const prevCountsRef = useRef<{ done: number; active: number } | null>(null);
  const isInitialRender = useRef(true);

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
      // After first successful load, disable entrance animations
      if (isInitialRender.current) {
        setTimeout(() => { isInitialRender.current = false; }, 400);
      }
    } catch {
      setFetchError(true);
    }
  }, []);

  useEffect(() => { document.title = 'Roadmap — Agent Council'; }, []);

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

  const toggleTriageSelect = useCallback((hash: string) => {
    setTriageSelected(prev => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  }, []);

  const handleBatchAction = useCallback(async (status: 'done' | 'stale') => {
    if (triageSelected.size === 0) return;
    setTriageBatchUpdating(true);
    try {
      const promises = Array.from(triageSelected).map(hash =>
        fetch('/api/roadmap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: hash, status }),
        })
      );
      await Promise.all(promises);
      setTriageSelected(new Set());
      await loadData();
    } catch (err) {
      console.error('Batch update failed:', err);
    } finally {
      setTriageBatchUpdating(false);
    }
  }, [triageSelected, loadData]);

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
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', backdropFilter: 'blur(8px) saturate(150%)', boxShadow: 'var(--shadow-sm)' }}
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
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', backdropFilter: 'blur(8px) saturate(150%)', boxShadow: 'var(--shadow-sm)' }}
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

  // Idea backlog — deferred proposals not yet rejected or scheduled
  const ideaItems = allItems.filter(i => i.type === 'IDEA' && i.itemStatus !== 'stale');

  // Done items: explicitly marked done + decisions + resolved
  const doneItems = allItems.filter(i => i.itemStatus === 'done');

  // Stale / archived items
  const staleItems = allItems.filter(i => i.itemStatus === 'stale');

  // Group each section by meeting
  const activeActionGroups = groupByMeeting(activeActions);
  const activeOpenGroups = groupByMeeting(activeOpen);
  const ideaGroups = groupByMeeting(ideaItems);
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

        <SearchPanel />

        {!hasData ? (
          <div
            className="rounded-lg p-8 text-center"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', backdropFilter: 'blur(8px) saturate(150%)', boxShadow: 'var(--shadow-sm)' }}
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
            <motion.div
              className="rounded-lg px-5 py-4"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', backdropFilter: 'blur(8px) saturate(150%)', boxShadow: 'var(--shadow-sm)' }}
              {...fadeUp}
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
                animate={isInitialRender.current}
              />
            </motion.div>

            {/* Filter buttons */}
            <div className="flex gap-2 flex-wrap items-center">
              {(['all', 'actions', 'questions', 'decisions'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => { setRoadmapFilter(f); if (triageMode) setTriageMode(false); }}
                  aria-pressed={roadmapFilter === f && !triageMode}
                  className="text-xs px-3 py-1 rounded-full transition-colors"
                  style={{
                    background: roadmapFilter === f && !triageMode ? 'var(--accent-muted)' : 'transparent',
                    color: roadmapFilter === f && !triageMode ? 'var(--accent)' : 'var(--text-muted)',
                    border: `1px solid ${roadmapFilter === f && !triageMode ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >
                  {f === 'all' ? 'All' : f === 'actions' ? 'Actions' : f === 'questions' ? 'Open Questions' : 'Decisions'}
                </button>
              ))}
              <span style={{ color: 'var(--border)' }}>|</span>
              <button
                onClick={() => { setTriageMode(!triageMode); setTriageSelected(new Set()); }}
                aria-pressed={triageMode}
                className="text-xs px-3 py-1 rounded-full transition-colors"
                style={{
                  background: triageMode ? 'rgba(234, 179, 8, 0.15)' : 'transparent',
                  color: triageMode ? 'var(--warning)' : 'var(--text-muted)',
                  border: `1px solid ${triageMode ? 'var(--warning)' : 'var(--border)'}`,
                }}
              >
                Triage
              </button>
            </div>

            {/* Triage mode */}
            {triageMode && (() => {
              const triageItems = [...activeActions, ...activeOpen];
              const clusters = clusterByText(triageItems);
              const clusteredHashes = new Set(clusters.flatMap(c => c.items.map(i => i.hash)));
              const unclustered = triageItems.filter(i => !clusteredHashes.has(i.hash));

              return (
                <div>
                  <SectionHeader title="Triage" count={triageItems.length} accent="var(--warning)" />

                  {/* Duplicate clusters */}
                  {clusters.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-xs font-medium mb-3 flex items-center gap-2" style={{ color: 'var(--warning)' }}>
                        <span>Potential duplicates</span>
                        <span className="px-1.5 py-0.5 rounded-full tabular-nums" style={{ background: 'rgba(234, 179, 8, 0.12)' }}>
                          {clusters.length} cluster{clusters.length !== 1 ? 's' : ''}
                        </span>
                      </h3>
                      <div className="space-y-4">
                        {clusters.map((cluster, ci) => (
                          <div
                            key={ci}
                            className="rounded-lg px-4 py-3"
                            style={{ background: 'var(--bg-card)', border: '1px solid rgba(234, 179, 8, 0.2)' }}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-medium" style={{ color: 'var(--warning)' }}>
                                {cluster.items.length} similar items
                              </span>
                              <button
                                onClick={() => {
                                  // Select all in cluster except the first (keep the newest)
                                  setTriageSelected(prev => {
                                    const next = new Set(prev);
                                    cluster.items.slice(1).forEach(i => next.add(i.hash));
                                    return next;
                                  });
                                }}
                                className="text-[10px] px-2 py-0.5 rounded"
                                style={{ color: 'var(--accent)', background: 'rgba(59, 130, 246, 0.1)' }}
                              >
                                Select duplicates
                              </button>
                            </div>
                            <div className="space-y-1">
                              {cluster.items.map((item, ii) => (
                                <TriageItemRow
                                  key={`${ci}-${ii}-${item.hash}`}
                                  item={item}
                                  selected={triageSelected.has(item.hash)}
                                  onToggle={toggleTriageSelect}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Remaining unclustered items */}
                  {unclustered.length > 0 && (
                    <div>
                      <h3 className="text-xs font-medium mb-3" style={{ color: 'var(--text-muted)' }}>
                        All items ({unclustered.length})
                      </h3>
                      <div
                        className="rounded-lg px-4 py-3 space-y-1"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', backdropFilter: 'blur(8px) saturate(150%)', boxShadow: 'var(--shadow-sm)' }}
                      >
                        {unclustered.map((item, ui) => (
                          <TriageItemRow
                            key={`u-${ui}-${item.hash}`}
                            item={item}
                            selected={triageSelected.has(item.hash)}
                            onToggle={toggleTriageSelect}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {triageItems.length === 0 && (
                    <EmptySection message="No active items to triage. All clean." />
                  )}

                  <TriageBatchBar
                    selectedCount={triageSelected.size}
                    onBatchDone={() => handleBatchAction('done')}
                    onBatchStale={() => handleBatchAction('stale')}
                    onClear={() => setTriageSelected(new Set())}
                    updating={triageBatchUpdating}
                  />
                </div>
              );
            })()}

            {/* In Progress section */}
            {!triageMode && (roadmapFilter === 'all' || roadmapFilter === 'actions') && (
            <div>
              <SectionHeader title="In Progress" count={activeActions.length} accent="var(--live-green)" />
              {activeActionGroups.length > 0 ? (
                <div
                  className="rounded-lg px-5 py-4 space-y-5"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', backdropFilter: 'blur(8px) saturate(150%)', boxShadow: 'var(--shadow-sm)' }}
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
            {!triageMode && (roadmapFilter === 'all' || roadmapFilter === 'questions') && (
            <div>
              <SectionHeader title="Open Questions" count={data.counts.openQuestions} accent="var(--warning)" />
              {activeOpenGroups.length > 0 ? (
                <div
                  className="rounded-lg px-5 py-4 space-y-5"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', backdropFilter: 'blur(8px) saturate(150%)', boxShadow: 'var(--shadow-sm)' }}
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

            {/* Ideas backlog */}
            {!triageMode && ideaItems.length > 0 && roadmapFilter === 'all' && (
            <div>
              <SectionHeader title="Ideas" count={ideaItems.length} accent="var(--color-idea)" />
              <div
                className="rounded-lg px-5 py-4 space-y-5"
                style={{ background: 'var(--bg-card)', border: '1px solid rgba(168, 85, 247, 0.2)' }}
              >
                {ideaGroups.map(g => (
                  <MeetingGroup key={g.meeting} {...g} onStatusChange={handleStatusChange} />
                ))}
              </div>
            </div>
            )}

            {/* Done section */}
            {!triageMode && (roadmapFilter === 'all' || roadmapFilter === 'decisions') && (
            <div>
              <SectionHeader title="Done" count={doneItems.length} accent="var(--accent)" />
              {doneGroups.length > 0 ? (
                <div
                  className="rounded-lg px-5 py-4 space-y-5"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', backdropFilter: 'blur(8px) saturate(150%)', boxShadow: 'var(--shadow-sm)' }}
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
