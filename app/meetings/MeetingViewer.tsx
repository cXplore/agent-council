'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import type { MeetingListItem, MeetingDetail } from '@/lib/types';
import { getAgentColor } from '@/lib/utils';
import { createMeetingComponents } from '@/lib/md-components';
import MeetingOutcomes, { countOutcomes } from './MeetingOutcomes';

const POLL_INTERVAL = 2000;

function formatType(type: string): string {
  return type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Small muted badge for project names */
function ProjectBadge({ project }: { project: string }) {
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

const mdComponents = createMeetingComponents(getAgentColor);

export default function MeetingViewer() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [selected, setSelected] = useState<string | null>(searchParams.get('file'));
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tagSummary, setTagSummary] = useState<{ decisions: number; open: number; actions: number; meetingCount: number } | null>(null);
  const [taggedMeetings, setTaggedMeetings] = useState<Set<string>>(new Set());
  const [tagExpanded, setTagExpanded] = useState(false);
  const [tagDetails, setTagDetails] = useState<{ decisions: { text: string; meeting: string; meetingTitle?: string; meetingStatus?: string }[]; open: { text: string; meeting: string; meetingTitle?: string; meetingStatus?: string }[]; actions: { text: string; meeting: string; meetingTitle?: string; meetingStatus?: string }[] } | null>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [userExplicitlyBack, setUserExplicitlyBack] = useState(false);

  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState<'summary' | 'all' | null>(null);
  const [outcomesOpen, setOutcomesOpen] = useState(false);
  const [addingFacilitator, setAddingFacilitator] = useState(false);
  const [facilitatorError, setFacilitatorError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'in-progress' | 'complete'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [recentlyUpdated, setRecentlyUpdated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);

  // Active project context
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [hasProject, setHasProject] = useState<boolean | null>(null); // null = loading
  const [hasFacilitator, setHasFacilitator] = useState<boolean | null>(null); // null = still checking

  // Track seen content for fade-in splitting
  const [seenContent, setSeenContent] = useState<string>('');

  // MCP event tracking
  const [latestEvent, setLatestEvent] = useState<string | null>(null);

  // Planned meetings
  const [plannedMeetings, setPlannedMeetings] = useState<{ id: string; type: string; topic: string; trigger?: string; source?: string }[]>([]);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [planTopic, setPlanTopic] = useState('');
  const [planType, setPlanType] = useState('strategy');

  // Connection health tracking
  const [connectionLost, setConnectionLost] = useState(false);
  const failedPollsRef = useRef(0);

  const connectionLostRef = useRef(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const lastModifiedRef = useRef<string>('');
  const lastContentLengthRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const recentlyUpdatedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const seenContentTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const selectedRef = useRef<string | null>(searchParams.get('file'));
  const userExplicitlyBackRef = useRef(false);
  const userScrolledUpRef = useRef(false);

  // Update both state and URL when selecting a meeting
  const selectMeeting = useCallback((filename: string | null) => {
    setSelected(filename);
    const params = new URLSearchParams(window.location.search);
    if (filename) {
      params.set('file', filename);
    } else {
      params.delete('file');
    }
    const newUrl = params.toString() ? `/meetings?${params}` : '/meetings';
    router.replace(newUrl, { scroll: false });
  }, [router]);

  // Keep refs in sync
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { userExplicitlyBackRef.current = userExplicitlyBack; }, [userExplicitlyBack]);
  useEffect(() => { userScrolledUpRef.current = userScrolledUp; }, [userScrolledUp]);
  useEffect(() => { connectionLostRef.current = connectionLost; }, [connectionLost]);

  // Fetch project state on mount
  useEffect(() => {
    async function fetchProjectState() {
      try {
        const res = await fetch('/api/projects');
        if (!res.ok) return;
        const data = await res.json();
        const active = data.activeProject ?? null;
        setActiveProject(active);
        setHasProject(data.projects?.length > 0);

        // Check if active project has a facilitator
        if (active && active !== 'workspace') {
          try {
            const agentsRes = await fetch('/api/agents');
            if (agentsRes.ok) {
              const agentsData = await agentsRes.json();
              const agents = agentsData.agents || [];
              setHasFacilitator(agents.some((a: { filename: string }) => a.filename === 'facilitator.md'));
            }
          } catch { /* silent */ }
        }
      } catch {
        // silent
      }
    }
    fetchProjectState();
  }, []);

  // Build query string with optional project param
  const projectParam = useCallback((extra?: string) => {
    const params = new URLSearchParams();
    if (activeProject) params.set('project', activeProject);
    if (extra) {
      const extraParams = new URLSearchParams(extra);
      extraParams.forEach((v, k) => params.set(k, v));
    }
    const str = params.toString();
    return str ? `?${str}` : '';
  }, [activeProject]);

  // Fetch meeting list — stable callback using refs for auto-select logic
  const fetchList = useCallback(async () => {
    try {
      const res = await fetch(`/api/meetings${projectParam()}`);
      if (!res.ok) { setFetchError(true); return; }
      const data = await res.json();
      setMeetings(Array.isArray(data) ? data : []);

      // Auto-select if exactly one is in-progress (but not if user explicitly went back)
      if (!selectedRef.current && !userExplicitlyBackRef.current) {
        const inProgress = data.filter((m: MeetingListItem) => m.status === 'in-progress');
        if (inProgress.length === 1) {
          selectMeeting(inProgress[0].filename);
        }
      }
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [projectParam]);

  // Fetch cross-meeting tag summary + build set of tagged meeting filenames
  const fetchTagSummary = useCallback(async () => {
    try {
      const [summaryRes, searchRes] = await Promise.all([
        fetch(`/api/meetings/tags?mode=summary`),
        fetch(`/api/meetings/tags`),
      ]);
      if (summaryRes.ok) setTagSummary(await summaryRes.json());
      if (searchRes.ok) {
        const data = await searchRes.json();
        const filenames = new Set<string>((data.results || []).map((r: { meeting: string }) => r.meeting as string));
        setTaggedMeetings(filenames);
      }
    } catch {}
  }, []);

  // Fetch single meeting content
  const fetchDetail = useCallback(async (filename: string) => {
    try {
      const res = await fetch(`/api/meetings${projectParam(`file=${encodeURIComponent(filename)}`)}`);
      if (!res.ok) {
        failedPollsRef.current++;
        if (failedPollsRef.current >= 3) setConnectionLost(true);
        return;
      }
      const data: MeetingDetail = await res.json();

      // Poll succeeded — reset failure tracking
      failedPollsRef.current = 0;
      if (connectionLostRef.current) setConnectionLost(false);

      // Only update if content changed
      if (data.modifiedAt !== lastModifiedRef.current) {
        lastModifiedRef.current = data.modifiedAt;

        // Track if content grew (new agent response)
        const newLength = data.content?.length ?? 0;
        if (newLength > lastContentLengthRef.current) {
          setRecentlyUpdated(true);
          // Clear any existing timer to prevent leaks
          if (recentlyUpdatedTimerRef.current) {
            clearTimeout(recentlyUpdatedTimerRef.current);
          }
          recentlyUpdatedTimerRef.current = setTimeout(() => setRecentlyUpdated(false), 3000);
        }
        lastContentLengthRef.current = newLength;

        setDetail(data);

        // After animation plays, mark all content as seen
        if (seenContentTimerRef.current) clearTimeout(seenContentTimerRef.current);
        seenContentTimerRef.current = setTimeout(() => {
          setSeenContent(data.content ?? '');
        }, 600);

        // Auto-scroll if user hasn't scrolled up
        if (!userScrolledUpRef.current && contentRef.current) {
          requestAnimationFrame(() => {
            contentRef.current?.scrollTo({
              top: contentRef.current.scrollHeight,
              behavior: 'smooth',
            });
          });
        }
      }

      // Stop polling if complete
      if (data.status === 'complete' && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = undefined;
      }
    } catch {
      failedPollsRef.current++;
      if (failedPollsRef.current >= 3) setConnectionLost(true);
    }
  }, [projectParam]);

  // Initial list load + periodic refresh
  useEffect(() => {
    fetchList();
    fetchTagSummary();
    const interval = setInterval(fetchList, 5000);
    // Refresh tag summary less frequently (30s)
    const tagInterval = setInterval(fetchTagSummary, 30000);
    return () => { clearInterval(interval); clearInterval(tagInterval); };
  }, [fetchList, fetchTagSummary]);

  // Fetch planned meetings
  useEffect(() => {
    const fetchPlanned = async () => {
      try {
        const res = await fetch('/api/council/planned');
        if (res.ok) {
          const data = await res.json();
          setPlannedMeetings(data.meetings || []);
        }
      } catch { /* silent */ }
    };
    fetchPlanned();
    const interval = setInterval(fetchPlanned, 10000);
    return () => clearInterval(interval);
  }, []);

  // Poll selected meeting
  useEffect(() => {
    if (!selected) return;

    lastModifiedRef.current = '';
    lastContentLengthRef.current = 0;
    setDetail(null);
    setSeenContent('');
    setUserScrolledUp(false);
    fetchDetail(selected);

    pollRef.current = setInterval(() => fetchDetail(selected), POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (recentlyUpdatedTimerRef.current) clearTimeout(recentlyUpdatedTimerRef.current);
      if (seenContentTimerRef.current) clearTimeout(seenContentTimerRef.current);
    };
  }, [selected, fetchDetail]);

  // Poll MCP events for live meetings
  useEffect(() => {
    if (!selected || !detail || detail.status !== 'in-progress') {
      setLatestEvent(null);
      return;
    }

    const fetchEvents = async () => {
      try {
        const res = await fetch(`/api/council/events?meeting=${encodeURIComponent(selected)}`);
        if (!res.ok) return;
        const data = await res.json();
        const events = data.events;
        if (events && events.length > 0) {
          const last = events[events.length - 1];
          // Format the event into a human-readable string
          switch (last.event) {
            case 'meeting_starting':
              setLatestEvent('Meeting starting...');
              break;
            case 'round_starting':
              setLatestEvent(`${last.detail || 'Next round'} starting...`);
              break;
            case 'agent_speaking':
              setLatestEvent(`${last.detail || 'Agent'} is thinking...`);
              break;
            case 'round_complete':
              setLatestEvent(`${last.detail || 'Round'} complete`);
              break;
            case 'meeting_complete':
              setLatestEvent('Meeting complete');
              break;
            default:
              setLatestEvent(null);
          }
        }
      } catch {
        // silent — events are optional
      }
    };

    fetchEvents();
    const interval = setInterval(fetchEvents, 3000);
    return () => clearInterval(interval);
  }, [selected, detail?.status]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    if (!contentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
    const nearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setUserScrolledUp(!nearBottom);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape' && selected) {
        selectMeeting(null);
        setUserExplicitlyBack(true);
      }
      // j/k to navigate meetings in list view
      if (!selected && meetings.length > 0) {
        if (e.key === 'j' || e.key === 'k') {
          e.preventDefault();
          // No meeting focused — select first/last
          selectMeeting(e.key === 'j' ? meetings[0].filename : meetings[meetings.length - 1].filename);
          setUserExplicitlyBack(false);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selected, meetings, selectMeeting]);

  const scrollToBottom = () => {
    contentRef.current?.scrollTo({
      top: contentRef.current.scrollHeight,
      behavior: 'smooth',
    });
    setUserScrolledUp(false);
  };

  const deleteMeeting = async (filename: string) => {
    if (!confirm(`Delete "${filename}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/meetings${projectParam(`file=${encodeURIComponent(filename)}`)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to delete meeting');
        return;
      }
      setMeetings(prev => prev.filter(m => m.filename !== filename));
    } catch {
      setError('Failed to delete meeting');
    }
  };

  const sendMessage = async () => {
    if (!chatInput.trim() || !selected || sending) return;
    setSending(true);
    setError(null);
    try {
      const body: Record<string, string> = { file: selected, message: chatInput.trim() };
      if (activeProject) body.project = activeProject;

      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to send message');
        return;
      }
      setChatInput('');
      fetchDetail(selected);
    } catch {
      setError('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  // Check if meetings span multiple projects
  const hasMultipleProjects = (() => {
    const projects = new Set(meetings.map(m => m.project).filter(Boolean));
    return projects.size > 1;
  })();

  // ─── List View ───
  if (!selected) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
        <div className="max-w-3xl mx-auto px-6 py-12">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                Meetings
              </h1>
              {hasProject && activeProject && activeProject !== 'workspace' && (
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {activeProject}
                </span>
              )}
            </div>
            {hasProject && hasFacilitator && (
              <button
                onClick={() => setShowPlanForm(!showPlanForm)}
                className="text-sm px-4 py-2 rounded-lg font-medium transition-colors"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                + Plan meeting
              </button>
            )}
          </div>

          {/* State-aware guidance — only show after project state is known */}
          {hasProject === null ? null : hasProject === false ? (
            /* No project connected at all */
            <div
              className="rounded-lg p-6"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--accent)' }}
            >
              <p className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
                Connect a project to get started
              </p>
              <ol className="space-y-2 text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                <li className="flex gap-3">
                  <span className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--accent)' }}>1</span>
                  Connect your project — point us at the directory
                </li>
                <li className="flex gap-3">
                  <span className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--accent)' }}>2</span>
                  Set up agents (or use your existing ones)
                </li>
                <li className="flex gap-3">
                  <span className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--accent)' }}>3</span>
                  Ask Claude Code for a meeting — it shows up here live
                </li>
              </ol>
              <a
                href="/setup"
                className="px-5 py-2.5 rounded-lg text-sm font-medium inline-block"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                Connect project
              </a>
              <a
                href="/guide"
                className="px-5 py-2.5 rounded-lg text-sm font-medium inline-block ml-3"
                style={{ color: 'var(--text-muted)' }}
              >
                How it works
              </a>
            </div>
          ) : activeProject === 'workspace' ? (
            /* Projects exist but none selected */
            <div
              className="rounded-lg p-6"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                No project selected. Choose one from the dropdown above to view its meetings.
              </p>
            </div>
          ) : hasFacilitator === false ? (
            /* Project connected but no facilitator */
            <div
              className="rounded-lg px-5 py-4 mb-6 text-sm"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--warning)', color: 'var(--text-secondary)' }}
            >
              <strong style={{ color: 'var(--warning)' }}>Your project needs a facilitator to run meetings.</strong>
              <p className="mt-2" style={{ color: 'var(--text-muted)' }}>
                The facilitator orchestrates rounds, picks participants, and produces summaries. Your existing agents stay untouched.
              </p>
              <div className="flex gap-3 mt-3">
                <button
                  disabled={addingFacilitator}
                  onClick={async () => {
                    setAddingFacilitator(true);
                    setFacilitatorError(null);
                    try {
                      const projRes = await fetch('/api/projects');
                      if (!projRes.ok) throw new Error('Could not load projects');
                      const projData = await projRes.json();
                      const active = projData.projects?.find((p: { name: string }) => p.name === projData.activeProject);
                      if (!active?.path) throw new Error('No active project path');
                      const res = await fetch('/api/setup/generate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          targetDir: active.path,
                          agents: [{ name: 'facilitator', template: 'facilitator', model: 'opus', description: 'Orchestrates meetings' }],
                          projectProfile: null,
                        }),
                      });
                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        throw new Error(data.error || 'Failed to generate facilitator');
                      }
                      setHasFacilitator(true);
                    } catch (err) {
                      setFacilitatorError(err instanceof Error ? err.message : 'Failed to add facilitator');
                    } finally {
                      setAddingFacilitator(false);
                    }
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  style={{ background: 'var(--accent)', color: 'white' }}
                >
                  {addingFacilitator ? 'Adding...' : 'Add facilitator'}
                </button>
                {facilitatorError && (
                  <span className="text-xs" style={{ color: 'var(--error)' }}>{facilitatorError}</span>
                )}
                <a
                  href={`/setup?scan=${encodeURIComponent(activeProject || '')}`}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  Full setup
                </a>
              </div>
            </div>
          ) : (
            /* Ready — show hint */
            <div
              className="rounded-lg px-5 py-4 mb-6 text-sm"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>New meeting:</span>{' '}
              in Claude Code, ask for one — <em>&quot;run a meeting about the API design&quot;</em> or <em>&quot;let&apos;s have a design review on the dashboard&quot;</em>. It shows up here live.
            </div>
          )}

          {/* Planned meetings */}
          {plannedMeetings.length > 0 && !selected && (
            <div className="mb-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                Planned ({plannedMeetings.length})
              </h2>
              <div className="space-y-2">
                {plannedMeetings.map(m => (
                  <div
                    key={m.id}
                    className="rounded-lg px-4 py-3 text-sm flex items-center justify-between"
                    style={{ background: 'var(--bg-card)', border: '1px dashed var(--accent)', borderStyle: 'dashed' }}
                  >
                    <div>
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                        {m.type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </span>
                      <span className="mx-2" style={{ color: 'var(--text-muted)' }}>—</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{m.topic}</span>
                      {m.trigger && (
                        <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>({m.trigger})</span>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        await fetch('/api/council/planned', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: m.id, status: 'dismissed' }),
                        });
                        setPlannedMeetings(prev => prev.filter(p => p.id !== m.id));
                      }}
                      className="text-xs px-2 py-0.5 rounded"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Dismiss
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Plan meeting form — toggled by header button */}
          {showPlanForm && (
            <div
              className="rounded-lg p-4 space-y-3 mb-4"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--accent)' }}
            >
              <div className="flex gap-2">
                <select
                  value={planType}
                  onChange={(e) => setPlanType(e.target.value)}
                  className="text-sm px-3 py-2 rounded outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                >
                  <option value="standup">Standup</option>
                  <option value="design-review">Design Review</option>
                  <option value="strategy">Strategy Session</option>
                  <option value="architecture">Architecture Review</option>
                  <option value="retrospective">Retrospective</option>
                  <option value="sprint-planning">Sprint Planning</option>
                  <option value="incident-review">Incident Review</option>
                </select>
                <input
                  type="text"
                  value={planTopic}
                  onChange={(e) => setPlanTopic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && planTopic.trim()) {
                      fetch('/api/council/planned', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ type: planType, topic: planTopic.trim(), source: 'manual' }),
                      }).then(() => {
                        setPlanTopic('');
                        setShowPlanForm(false);
                        fetch('/api/council/planned').then(r => r.json()).then(d => setPlannedMeetings(d.meetings || []));
                      });
                    }
                    if (e.key === 'Escape') setShowPlanForm(false);
                  }}
                  placeholder="What should the meeting discuss?"
                  className="flex-1 text-sm px-3 py-2 rounded outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  autoFocus
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowPlanForm(false)}
                  className="text-sm px-3 py-1.5 rounded"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!planTopic.trim()) return;
                    fetch('/api/council/planned', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ type: planType, topic: planTopic.trim(), source: 'manual' }),
                    }).then(() => {
                      setPlanTopic('');
                      setShowPlanForm(false);
                      fetch('/api/council/planned').then(r => r.json()).then(d => setPlannedMeetings(d.meetings || []));
                    });
                  }}
                  className="text-sm px-4 py-1.5 rounded"
                  style={{ background: 'var(--accent)', color: 'white' }}
                >
                  Plan meeting
                </button>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Claude picks up planned meetings via MCP. In your Claude Code session, it will see this and offer to run it.
              </p>
            </div>
          )}

          {loading ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading...</div>
          ) : fetchError ? (
            <div
              className="rounded-lg px-5 py-4 text-sm"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--error)', color: 'var(--text-secondary)' }}
            >
              Could not load meetings. Check that the project directory exists and try refreshing.
            </div>
          ) : hasProject === false ? null : meetings.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                No meetings yet. Try one of these in Claude Code:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { type: 'Standup', prompt: 'what should we work on today?' },
                  { type: 'Strategy', prompt: 'let\'s discuss the roadmap' },
                  { type: 'Design Review', prompt: 'review the login flow design' },
                  { type: 'Architecture', prompt: 'review our API architecture' },
                ].map(s => (
                  <div
                    key={s.type}
                    className="rounded-lg px-4 py-3 text-xs"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                  >
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{s.type}</span>
                    <p className="mt-1 italic" style={{ color: 'var(--text-muted)' }}>&quot;{s.prompt}&quot;</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Cross-meeting tag summary — expandable */}
              {tagSummary && (tagSummary.open > 0 || tagSummary.actions > 0 || tagSummary.decisions > 0) && (
                <div
                  className="rounded-lg mb-2"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                >
                  <button
                    onClick={() => {
                      const next = !tagExpanded;
                      setTagExpanded(next);
                      if (next && !tagDetails) {
                        Promise.all([
                          fetch('/api/meetings/tags?mode=unresolved').then(r => r.json()),
                          fetch('/api/meetings/tags?type=decision').then(r => r.json()),
                        ]).then(([unresolved, decisionData]) => {
                          setTagDetails({
                            decisions: decisionData.results || [],
                            open: unresolved.open || [],
                            actions: unresolved.actions || [],
                          });
                        }).catch(() => {});
                      }
                    }}
                    className="flex items-center gap-3 text-xs px-3 py-2 w-full cursor-pointer hover:brightness-110 transition-colors flex-wrap"
                  >
                    {tagSummary.decisions > 0 && (
                      <span style={{ color: '#60a5fa' }}>
                        {tagSummary.decisions} decision{tagSummary.decisions !== 1 ? 's' : ''}
                      </span>
                    )}
                    {tagSummary.open > 0 && (
                      <span style={{ color: '#fbbf24' }}>
                        {tagSummary.open} open question{tagSummary.open !== 1 ? 's' : ''}
                      </span>
                    )}
                    {tagSummary.actions > 0 && (
                      <span style={{ color: '#4ade80' }}>
                        {tagSummary.actions} action{tagSummary.actions !== 1 ? 's' : ''}
                      </span>
                    )}
                    <span style={{ color: 'var(--text-muted)' }}>
                      across {tagSummary.meetingCount} meeting{tagSummary.meetingCount !== 1 ? 's' : ''}
                    </span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      {tagExpanded ? '▾' : '▸'}
                    </span>
                  </button>
                  {tagExpanded && tagDetails && (
                    <div className="px-3 pb-3 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
                      {([
                        { key: 'decisions' as const, label: 'Decisions', color: '#60a5fa', border: 'rgba(96, 165, 250, 0.4)' },
                        { key: 'open' as const, label: 'Open Questions', color: '#fbbf24', border: 'rgba(251, 191, 36, 0.4)' },
                        { key: 'actions' as const, label: 'Pending Actions', color: '#4ade80', border: 'rgba(74, 222, 128, 0.4)' },
                      ]).map(({ key, label, color, border }) => {
                        const items = tagDetails[key];
                        if (!items?.length) return null;
                        return (
                          <div key={key} className="pt-2">
                            <div className="text-xs font-medium mb-1.5" style={{ color }}>{label}</div>
                            {items.map((item, i) => (
                              <button
                                key={`${key}-${i}`}
                                onClick={() => {
                                  const meetingFile = item.meeting.replace(/.*[\\/]/, '');
                                  setSelected(meetingFile);
                                }}
                                className="block w-full text-left text-xs mb-1.5 pl-3 py-1.5 rounded hover:brightness-110 transition-colors"
                                style={{ color: 'var(--text-secondary)', borderLeft: `2px solid ${border}` }}
                              >
                                <span className="block">{item.text}</span>
                                <span className="flex items-center gap-1.5 mt-0.5">
                                  {item.meetingStatus === 'in-progress' && (
                                    <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--live-green)' }} />
                                  )}
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                                    {item.meetingTitle ?? item.meeting.replace(/.*[\\/]/, '')}
                                    {item.meetingStatus === 'in-progress' ? ' · live' : ''}
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Search and filter */}
              {meetings.length > 1 && (
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search meetings..."
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-2"
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              )}
              {meetings.length > 1 && (
                <div className="flex gap-2 mb-2">
                  {(['all', 'in-progress', 'complete'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setStatusFilter(f)}
                      className="text-xs px-3 py-1 rounded-full transition-colors"
                      style={{
                        background: statusFilter === f ? 'var(--accent-muted)' : 'transparent',
                        color: statusFilter === f ? 'var(--accent)' : 'var(--text-muted)',
                        border: `1px solid ${statusFilter === f ? 'var(--accent)' : 'var(--border)'}`,
                      }}
                    >
                      {f === 'all' ? 'All' : f === 'in-progress' ? 'Live' : 'Completed'}
                    </button>
                  ))}
                </div>
              )}
              {error && (
                <div
                  className="rounded-lg px-4 py-2 text-sm flex items-center justify-between"
                  style={{ background: 'var(--error)', color: 'white' }}
                >
                  <span>{error}</span>
                  <button onClick={() => setError(null)} className="ml-2 text-white/80 hover:text-white" aria-label="Dismiss error">&#x2715;</button>
                </div>
              )}
              {meetings.filter(m => {
                if (statusFilter !== 'all' && m.status !== statusFilter) return false;
                if (searchQuery) {
                  const q = searchQuery.toLowerCase();
                  return (
                    (m.title?.toLowerCase().includes(q)) ||
                    m.type.toLowerCase().includes(q) ||
                    m.participants.some(p => p.toLowerCase().includes(q)) ||
                    m.preview?.toLowerCase().includes(q)
                  );
                }
                return true;
              }).map((m) => (
                <div
                  key={m.filename}
                  role="button"
                  tabIndex={0}
                  onClick={() => { selectMeeting(m.filename); setUserExplicitlyBack(false); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectMeeting(m.filename); setUserExplicitlyBack(false); } }}
                  className="w-full text-left rounded-lg p-4 transition-colors hover:brightness-110 group cursor-pointer"
                  style={{
                    background: 'var(--bg-card)',
                    border: m.status === 'in-progress'
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
                      {formatType(m.type)}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>&middot;</span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {m.date}
                    </span>
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
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {formatTimeAgo(m.modifiedAt)}
                    </span>
                    {m.status !== 'in-progress' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteMeeting(m.filename); }}
                        className="text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Keyboard shortcuts hint */}
          {meetings.length > 0 && (
            <div className="mt-6 text-xs text-center" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
              <kbd className="px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>j</kbd>
              {' / '}
              <kbd className="px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>k</kbd>
              {' select meeting · '}
              <kbd className="px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>esc</kbd>
              {' go back'}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Detail View ───
  const isLive = detail?.status === 'in-progress';

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Sticky header */}
      <div
        className="sticky top-0 z-10 px-6 py-3 flex items-center gap-4"
        style={{
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <button
          onClick={() => { selectMeeting(null); setUserExplicitlyBack(true); }}
          className="text-sm hover:underline"
          style={{ color: 'var(--accent)' }}
        >
          &larr; All meetings
        </button>

        <div className="flex-1" />

        {detail && (
          <>
            {detail.project && (
              <ProjectBadge project={detail.project} />
            )}

            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {detail.title || formatType(detail.type)}
            </span>

            {isLive ? (
              <span
                className="inline-block w-2.5 h-2.5 rounded-full animate-pulse"
                style={{ background: 'var(--live-green)' }}
                title="Meeting in progress"
              />
            ) : detail && (
              <>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Completed
                </span>
                {detail.content?.includes('## Summary') && (
                  <button
                    onClick={async () => {
                      const summaryMatch = detail.content?.match(/## Summary[\s\S]*$/);
                      if (summaryMatch) {
                        await navigator.clipboard.writeText(summaryMatch[0]);
                        setCopied('summary');
                        setTimeout(() => setCopied(null), 1500);
                      }
                    }}
                    className="text-xs px-2 py-0.5 rounded transition-colors"
                    style={{ color: 'var(--accent)', border: '1px solid var(--border)' }}
                    title="Copy the summary section to clipboard"
                  >
                    {copied === 'summary' ? 'Copied!' : 'Copy summary'}
                  </button>
                )}
                <button
                  onClick={async () => {
                    if (!detail?.content) return;
                    await navigator.clipboard.writeText(detail.content);
                    setCopied('all');
                    setTimeout(() => setCopied(null), 1500);
                  }}
                  className="text-xs px-2 py-0.5 rounded transition-colors"
                  style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                  title="Copy full meeting to clipboard"
                >
                  {copied === 'all' ? 'Copied!' : 'Copy all'}
                </button>
              </>
            )}
          </>
        )}
      </div>

      {/* Participants bar */}
      {detail && detail.participants.length > 0 && (
        <div
          className="px-6 py-2 text-xs flex items-center gap-3 flex-wrap"
          style={{
            background: 'var(--bg)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>Participants:</span>
          {detail.participants.map((p) => {
            const hasSpoken = detail.content?.includes(`**${p}:**`) ?? false;
            return (
              <a
                key={p}
                href={`/agents?agent=${encodeURIComponent(p)}`}
                className="px-2 py-0.5 rounded hover:brightness-125 transition-all cursor-pointer"
                style={{
                  color: getAgentColor(p),
                  background: `${getAgentColor(p).replace(')', ', 0.12)').replace('hsl(', 'hsla(')}`,
                  opacity: hasSpoken ? 1 : 0.4,
                }}
                title={hasSpoken ? `${p} has spoken — click to view profile` : `${p} — waiting to speak`}
              >
                {p}
              </a>
            );
          })}
        </div>
      )}

      {/* Meeting stats for completed meetings */}
      {detail && detail.status === 'complete' && detail.content && (() => {
        // Count words per agent — handle both "### Name (Round N)" and "**Name:**" formats
        const wordCounts: Record<string, number> = {};
        const headingBlocks = detail.content.split(/^###\s+(.+?)(?:\s+\(Round\s+\d+\))?$/m);
        if (headingBlocks.length > 1) {
          for (let i = 1; i < headingBlocks.length; i += 2) {
            const name = headingBlocks[i].trim();
            const text = headingBlocks[i + 1] || '';
            const words = text.trim().split(/\s+/).filter((w: string) => w.length > 0).length;
            if (name && !/^round\s+\d+/i.test(name)) {
              wordCounts[name] = (wordCounts[name] || 0) + words;
            }
          }
        }
        if (Object.keys(wordCounts).length === 0) {
          // Fallback: bold "**Name:**" format
          const agentBlocks = detail.content.split(/\*\*([\w-]+):\*\*/);
          for (let i = 1; i < agentBlocks.length; i += 2) {
            const name = agentBlocks[i];
            const text = agentBlocks[i + 1] || '';
            const words = text.trim().split(/\s+/).filter((w: string) => w.length > 0).length;
            wordCounts[name] = (wordCounts[name] || 0) + words;
          }
        }
        const totalWords = Object.values(wordCounts).reduce((a, b) => a + b, 0);
        const rounds = (detail.content.match(/^(?:## Round \d+|\*Round \d+)/gm) || []).length;
        if (totalWords === 0) return null;

        return (
          <div
            className="px-6 py-2 flex items-center gap-4 text-xs flex-wrap"
            style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            <span>{totalWords.toLocaleString()} words</span>
            <span>{rounds} round{rounds !== 1 ? 's' : ''}</span>
            <span>{Object.keys(wordCounts).length} agents</span>
            <div className="flex-1" />
            {/* Mini contribution bar */}
            <div className="flex h-1.5 rounded-full overflow-hidden" style={{ width: 120 }}>
              {Object.entries(wordCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => (
                  <div
                    key={name}
                    style={{
                      width: `${(count / totalWords) * 100}%`,
                      background: getAgentColor(name),
                    }}
                    title={`${name}: ${count} words (${Math.round((count / totalWords) * 100)}%)`}
                  />
                ))}
            </div>
            {/* Outcomes toggle */}
            {(() => {
              const count = detail?.content ? countOutcomes(detail.content) : 0;
              if (count === 0) return null;
              return (
                <button
                  onClick={() => setOutcomesOpen(!outcomesOpen)}
                  className="text-xs px-2.5 py-1 rounded-full transition-colors"
                  style={{
                    background: outcomesOpen ? 'rgba(96, 165, 250, 0.15)' : 'var(--bg)',
                    color: outcomesOpen ? '#60a5fa' : 'var(--text-muted)',
                    border: `1px solid ${outcomesOpen ? 'rgba(96, 165, 250, 0.3)' : 'var(--border)'}`,
                  }}
                >
                  Outcomes ({count})
                </button>
              );
            })()}
          </div>
        );
      })()}

      {/* Recommended next meetings from summary */}
      {detail && detail.status === 'complete' && detail.recommendedMeetings && detail.recommendedMeetings.length > 0 && (
        <div
          className="px-6 py-3 text-sm"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}
        >
          <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Recommended next meetings:</div>
          <div className="flex flex-wrap gap-2">
            {detail.recommendedMeetings.map((rec, i) => (
              <button
                key={i}
                onClick={async () => {
                  // Parse: "**Type** — description", "Type: Topic — desc", or plain text
                  const clean = rec.replace(/\*\*/g, '').trim();
                  const dashMatch = clean.match(/^([^—–:]+)[—–]\s*(.+)/);
                  const colonMatch = clean.match(/^([^:]+):\s*(.+)/);
                  let type: string, topic: string;
                  if (dashMatch) {
                    type = dashMatch[1].trim().toLowerCase().replace(/\s+/g, '-');
                    topic = dashMatch[2].trim();
                  } else if (colonMatch) {
                    type = colonMatch[1].trim().toLowerCase().replace(/\s+/g, '-');
                    topic = colonMatch[2].trim();
                  } else {
                    type = 'strategy-session';
                    topic = clean;
                  }
                  try {
                    await fetch('/api/council/planned', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        type: 'recommended',
                        topic,
                        meetingType: type,
                        source: detail.filename,
                      }),
                    });
                    // Visual feedback — briefly change button text
                    const btn = document.activeElement as HTMLElement;
                    if (btn) { const orig = btn.textContent; btn.textContent = '✓ Queued'; setTimeout(() => { btn.textContent = orig; }, 1500); }
                  } catch {}
                }}
                className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:brightness-110"
                style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                title="Add to planned meetings"
              >
                + {rec}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content + Outcomes panel wrapper */}
      <div className="flex flex-1 overflow-hidden">

      {/* Content area */}
      <div
        ref={contentRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-8 relative"
      >
        {/* Round jump markers */}
        {detail && detail.content && (() => {
          const rounds = detail.content.match(/^(?:## Round \d+|\*Round \d+)/gm);
          const hasSummary = detail.content.includes('## Summary');
          if (!rounds && !hasSummary) return null;
          return (
            <div className="fixed right-4 top-1/2 -translate-y-1/2 z-10 hidden lg:flex flex-col gap-2">
              {rounds?.map((r, i) => (
                <button
                  key={i}
                  onClick={() => {
                    // Search h2, em, and strong for round markers (different facilitators use different formats)
                    const elements = contentRef.current?.querySelectorAll('h2, em, strong');
                    elements?.forEach(el => {
                      if (el.textContent?.trim().startsWith(`Round ${i + 1}`)) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    });
                  }}
                  className="text-xs px-2 py-1 rounded transition-colors"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                  title={r}
                  aria-label={`Jump to Round ${i + 1}`}
                >
                  R{i + 1}
                </button>
              ))}
              {hasSummary && (
                <button
                  onClick={() => {
                    const headings = contentRef.current?.querySelectorAll('h2');
                    headings?.forEach(h => {
                      if (h.textContent?.trim() === 'Summary') {
                        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    });
                  }}
                  className="text-xs px-2 py-1 rounded transition-colors"
                  style={{ background: 'var(--accent-muted)', border: '1px solid var(--accent)', color: 'var(--accent)' }}
                  title="Jump to Summary"
                  aria-label="Jump to Summary"
                >
                  S
                </button>
              )}
            </div>
          );
        })()}
        <div className="max-w-3xl mx-auto">
          {!detail ? (
            <div className="space-y-4">
              <div className="loading-shimmer h-8 w-64 rounded" />
              <div className="loading-shimmer h-4 w-96 rounded" />
              <div className="loading-shimmer h-4 w-80 rounded" />
              <p className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>Loading meeting...</p>
            </div>
          ) : isLive && !detail.content.match(/\*\*[\w-]+:\*\*/) ? (
            /* Meeting file exists but no agent has responded yet */
            <div className="space-y-6">
              <div className="prose prose-sm prose-invert max-w-none meeting-new-content">
                <ReactMarkdown components={mdComponents}>
                  {detail.content.replace(/<!--[\s\S]*?-->\n?/g, '')}
                </ReactMarkdown>
              </div>
              <div
                className="rounded-lg p-6 text-center"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--live-green)', borderStyle: 'dashed' }}
              >
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--live-green)' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--live-green)' }}>Meeting starting...</span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  The facilitator is assembling the team. Agent responses will appear here as they come in.
                </p>
              </div>
            </div>
          ) : (
            <div className="prose prose-sm prose-invert max-w-none">
              {(() => {
                const clean = detail.content.replace(/<!--[\s\S]*?-->\n?/g, '');
                const cleanSeen = seenContent.replace(/<!--[\s\S]*?-->\n?/g, '');
                const hasNew = clean.length > cleanSeen.length && cleanSeen.length > 0;
                // Split at newline boundary to avoid breaking markdown mid-block
                let splitIdx = cleanSeen.length;
                if (hasNew) {
                  const nlIdx = clean.lastIndexOf('\n', splitIdx);
                  if (nlIdx > 0) splitIdx = nlIdx + 1;
                }
                const seenPart = hasNew ? clean.slice(0, splitIdx) : clean;
                const newPart = hasNew ? clean.slice(splitIdx) : null;

                return (
                  <>
                    <div className="meeting-content">
                      <ReactMarkdown components={mdComponents}>{seenPart}</ReactMarkdown>
                    </div>
                    {newPart && (
                      <div className="meeting-new-content">
                        <ReactMarkdown components={mdComponents}>{newPart}</ReactMarkdown>
                      </div>
                    )}
                  </>
                );
              })()}

              {isLive && (
                <div className="mt-8 flex items-center gap-2">
                  {connectionLost ? (
                    <>
                      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--warning)' }} />
                      <span className="text-xs" style={{ color: 'var(--warning)' }}>
                        Connection lost — retrying...
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${recentlyUpdated ? 'animate-ping' : 'animate-pulse'}`}
                        style={{ background: recentlyUpdated ? 'var(--live-green)' : 'var(--accent)' }}
                      />
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {recentlyUpdated ? 'New response received' : latestEvent || 'Watching for updates...'}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Outcomes panel */}
      {detail && (
        <MeetingOutcomes
          content={detail.content}
          open={outcomesOpen}
          onClose={() => setOutcomesOpen(false)}
        />
      )}

      </div>{/* End Content + Outcomes wrapper */}

      {/* Error banner */}
      {error && (
        <div
          className="px-6 py-2 text-sm flex items-center justify-between"
          style={{ background: 'var(--error)', color: 'white' }}
        >
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 text-white/80 hover:text-white" aria-label="Dismiss error">&#x2715;</button>
        </div>
      )}

      {/* Chat input for live meetings */}
      {isLive && (
        <div
          className="sticky bottom-0 px-6 py-3"
          style={{
            background: 'var(--bg-elevated)',
            borderTop: '1px solid var(--border)',
          }}
        >
          <div className="max-w-3xl mx-auto flex gap-3">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Add your thoughts (agents see this in the next round)..."
              disabled={sending}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!chatInput.trim() || sending}
              className="px-5 py-2.5 rounded-lg text-sm font-medium transition-opacity disabled:opacity-30"
              style={{
                background: 'var(--accent)',
                color: 'var(--bg)',
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Scroll to bottom button */}
      {userScrolledUp && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-24 sm:bottom-20 right-6 z-10 px-4 py-2 rounded-full text-sm shadow-lg transition-opacity"
          style={{
            background: 'var(--accent)',
            color: 'var(--bg)',
          }}
        >
          Scroll to latest &darr;
        </button>
      )}
    </div>
  );
}
